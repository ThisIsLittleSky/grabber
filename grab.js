// grab.js — 选课抢课独立工具主流程
//
// 流程：载入配置/模板/会话 → （无会话则）弹出浏览器手动登录+网络层抓模板 →
// 保存会话 → 用纯 HTTP 请求（带 JSESSIONID/route cookie）跑抢课循环。
//
// 安全约束（用户确认）：绝不自动登录（登录偶发验证码，用户人手处理）；
// 冲突自动退选仅限 kklxdm=10 且 rwlx=2 的可退选修课，其余只告警不动手。
'use strict';
var fs = require('fs');
var path = require('path');
var playwright;
try { playwright = require('playwright'); }
catch (e) {
  console.error('缺少依赖 playwright。请在 grabber 目录运行: npm install');
  process.exit(1);
}

var cfg = loadConfig();
var notifyMod = require('./lib/notify');
var logger = notifyMod.makeLogger(cfg);
var log = logger.log;
var notify = logger.notify;
var beep = notifyMod.beep;
var params = require('./lib/params');
var matchLib = require('./lib/match');
var conflictLib = require('./lib/conflict');

var templates = { ctx: null, query: null, submit: null, xkkz: null };
var state = {
  targets: [],
  njdm: [],      // 年级过滤（来自 targets.njdm_id）
  querying: false,
  dryRun: !!cfg.dryRun,
  interval: cfg.intervalSec >= 1 ? cfg.intervalSec : 2.5,
  kklxdm: String(cfg.kklxdm || '10'),
  claim: {},      // kch -> true（已抢成，永久停）
  cooldown: {}    // kch -> 时间戳（冷却到点后再试）
};

function SessionError(message) { this.name = 'SessionError'; this.message = message || '会话失效'; }
SessionError.prototype = Object.create(Error.prototype);
SessionError.prototype.constructor = SessionError;

function NoClassError(message) { this.name = 'NoClassError'; this.message = message || '无可用教学班'; }
NoClassError.prototype = Object.create(Error.prototype);
NoClassError.prototype.constructor = NoClassError;

/* ---------------------------- 配置/状态读写 ---------------------------- */

function loadConfig() {
  var file = path.join(__dirname, 'config.json');
  var cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    console.error('无法读取 config.json: ' + e.message);
    process.exit(1);
  }
  cfg.base = String(cfg.base || '').replace(/\/+$/, '');
  if (!cfg.base) { console.error('config.json 缺少 base'); process.exit(1); }
  return cfg;
}

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8')); } catch (e) { return null; }
}

function saveJson(file, obj) {
  try { fs.writeFileSync(path.join(__dirname, file), JSON.stringify(obj, null, 2), 'utf8'); } catch (e) {}
}

function loadState() { return loadJson(cfg.stateFile || 'state.json'); }

function apiHeaders() {
  return {
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': cfg.base,
    'Referer': cfg.base + cfg.indexPath + '?gnmkdm=' + cfg.gnmkdm
  };
}

// 用会话 cookie 建一个独立的请求上下文（抢课循环走纯 HTTP，不依赖页面）
// 用 storageState 选项加载 state.json 的 cookie（APIRequestContext 无 addCookies）
async function makeRequestContext() {
  var opts = { extraHTTPHeaders: apiHeaders() };
  var st = loadState();
  if (st && Array.isArray(st.cookies) && st.cookies.length) {
    opts.storageState = cfg.stateFile || 'state.json';
  }
  return await playwright.request.newContext(opts);
}

/* ---------------------------- 请求与响应解析 ---------------------------- */

function parseRes(text) {
  var t = String(text || '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return t; }
}

async function apiPost(rc, pathname, obj) {
  var form = params.flatten(obj || {});
  var res = await rc.post(cfg.base + pathname, { form: form });
  var status = res.status();
  var text = await res.text();
  if (status < 200 || status >= 300) throw new Error('HTTP ' + status);
  var t = String(text || '').trim();
  if (t.charAt(0) === '<') {
    throw new SessionError('收到HTML响应（可能登录失效/会话过期），长度' + t.length);
  }
  return parseRes(t);
}

/* ---------------------------- 模板采集（网络层） ---------------------------- */

var XH_KINDS = [
  ['jxb', /JxbWithKch/],
  ['part', /PartDisplay/],
  ['choosed', /ChoosedDisplay/],
  ['batch', /xkBcZypx/],
  ['submit', /xkBcZyZzxkYzb/],
  ['title', /cxXkTitleMsg/],
  ['tuik', /tuikBc/],
  ['checkwin', /xkJcInXksj/]
];

function classify(url) {
  for (var i = 0; i < XH_KINDS.length; i++) {
    if (XH_KINDS[i][1].test(url)) return XH_KINDS[i][0];
  }
  return null;
}

function observe(kind, o) {
  if (!o) return;
  if (o.bh_id && (!templates.ctx || !templates.ctx.jg_id)) {
    templates.ctx = params.deepCopy(o);
    log('✓ 上下文 ctx 已采集', 'ok');
  }
  if (kind === 'part') {
    templates.query = params.deepCopy(o);
    log('✓ 查询模板已采集', 'ok');
    if (!templates.ctx && o.bh_id) { templates.ctx = params.deepCopy(o); log('✓ 上下文 ctx 已采集', 'ok'); }
  }
  if (kind === 'submit') {
    templates.submit = params.deepCopy(o);
    log('✓ 提交模板已采集（真实选课参数）', 'ok');
  }
  if (kind === 'jxb') {
    log('[观察] 页面教学班详情请求参数: ' + JSON.stringify(o), 'dim');
  }
  var xk = params.pickXkkzFromObj(o);
  if (xk && !templates.xkkz) { templates.xkkz = xk; log('✓ xkkz_id 已采集', 'ok'); }
}

function attachCapture(page) {
  page.on('request', function (req) {
    try {
      var kind = classify(req.url());
      if (!kind) return;
      var body = req.postData();
      if (!body) return;
      observe(kind, params.qsParse(body));
    } catch (e) {}
  });
}

// 用 config 里 login.username/password 预填登录表单。
// 正方登录框常见选择器：#yhm 用户名 / #mm 密码 / #dl 登录按钮；有验证码(#yzm)则停手等用户补。
async function autoFillLogin(page) {
  var user = cfg.login && cfg.login.username;
  var pass = cfg.login && cfg.login.password;
  if (!user && !pass) return;
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    var filled = await page.evaluate(function (u, p) {
      function find(selectors) {
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (el) return el;
        }
        return null;
      }
      function setVal(el, v) {
        el.value = v;
        try {
          var evt = document.createEvent('HTMLEvents');
          evt.initEvent('input', true, true);
          el.dispatchEvent(evt);
        } catch (e) {}
      }
      var un = find(['#yhm', 'input[name*="yhm"]', 'input[placeholder*="用户名"]', 'input[placeholder*="账号"]']);
      var pw = find(['#mm', 'input[type="password"]']);
      if (u && un) setVal(un, u);
      if (p && pw) setVal(pw, p);
      return { user: !!(u && un), pass: !!(p && pw) };
    }, user || '', pass || '');
    log('登录表单自动填充: 用户名' + (filled.user ? '✓' : '✗') + ' 密码' + (filled.pass ? '✓' : '✗'),
        filled.user && filled.pass ? 'ok' : 'warn');
    var hasCap = await page.evaluate(function () {
      return !!document.querySelector('#yzm, input[name*="yzm"], input[placeholder*="验证码"]');
    });
    if (hasCap) {
      log('检测到验证码，请在浏览器里填验证码后点登录', 'warn');
    } else if (filled.user && filled.pass) {
      var clicked = await page.evaluate(function () {
        var el = document.querySelector('#dl, button:has-text("登录"), input[value*="登录"], a:has-text("登 录")');
        if (!el) return false;
        el.click();
        return true;
      });
      if (clicked) log('已自动点击登录按钮（若后续停在验证码页，补一下验证码即可）', 'info');
      else log('找不到登录按钮，请手动点登录', 'warn');
    }
  } catch (e) {
    log('自动填充登录表单失败（忽略，手动填即可）: ' + e.message, 'warn');
  }
}

// 登录后若页面没自动发查询请求，程序化点一次"查询"按钮逼出 PartDisplay
async function tryTriggerQuery(page) {
  try {
    var found = await page.evaluate(function () {
      var els = document.querySelectorAll('button, a, input[type=button], input[type=submit]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var txt = (el.textContent || el.value || '') + '';
        if (txt.indexOf('查询') > -1) { el.click(); return true; }
      }
      return false;
    });
    if (found) log('已尝试触发页面查询', 'info');
  } catch (e) {}
}

/* ---------------------------- 登录与会话 ---------------------------- */

async function ensureLogin() {
  // 1) 已有模板 + 会话 → 先探测是否仍有效
  var savedTpl = loadJson(cfg.templatesFile || 'templates.json');
  if (savedTpl) {
    if (savedTpl.ctx) templates.ctx = params.deepCopy(savedTpl.ctx);
    if (savedTpl.query) templates.query = params.deepCopy(savedTpl.query);
    if (savedTpl.submit) templates.submit = params.deepCopy(savedTpl.submit);
    if (savedTpl.xkkz) templates.xkkz = savedTpl.xkkz;
  }
  if (templates.ctx && templates.query && loadState()) {
    log('发现已保存模板与会话，探测会话有效性…', 'info');
    var rc = await makeRequestContext();
    try {
      await apiPost(rc, '/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html', params.fetchChoosedParams(templates));
      log('✓ 会话有效，直接进入抢课循环', 'ok');
      return rc;
    } catch (e) {
      log(e instanceof SessionError ? '会话已过期，需要重新登录' : '会话复用探测失败: ' + e.message, 'warn');
      try { await rc.dispose(); } catch (e2) {}
    }
  }
  return doLogin();
}

async function doLogin() {
  log('== 需要登录 ==', 'info');
  log('即将弹出浏览器打开选课页。', 'info');
  if (cfg.login && cfg.login.username) {
    log('已配置账号 ' + cfg.login.username + '，将自动填充登录表单。', 'info');
  } else {
    log('未配置账号（config.json 的 login），请手动登录。', 'info');
  }
  log('若登录页有验证码，请在浏览器里补上并点登录。', 'info');
  log('登录后页面会自动发初始化请求，脚本在后台采集请求参数。', 'info');
  log('检测到模板就绪后，本工具自动进入抢课循环。', 'info');

  var browser = await playwright.chromium.launch({ headless: !!cfg.headless });
  var st = loadState();
  var context = await browser.newContext(st && st.cookies && st.cookies.length ? { storageState: cfg.stateFile || 'state.json' } : {});
  var page = await context.newPage();
  attachCapture(page);
  try {
    await page.goto(cfg.base + cfg.indexPath + '?gnmkdm=' + cfg.gnmkdm + '&layout=default', { timeout: 60000 });
  } catch (e) {
    log('打开选课页异常（可能网络/会话问题，请在浏览器里处理并刷新）: ' + e.message, 'warn');
  }
  await autoFillLogin(page);

  var deadline = Date.now() + (cfg.loginTimeoutMin || 5) * 60000;
  var triggered = 0;
  while (Date.now() < deadline) {
    if (templates.ctx && templates.query) break;
    if (templates.ctx && !templates.query && triggered < 3) {
      await tryTriggerQuery(page);
      triggered++;
    }
    await params.sleep(1000);
  }

  if (!templates.ctx || !templates.query) {
    log('超时未检测到模板：请确认已登录并进入选课页、页面能正常加载选课数据。', 'err');
    await browser.close();
    process.exit(1);
  }
  log('模板已就绪，保存会话…', 'ok');
  await context.storageState({ path: cfg.stateFile || 'state.json' });
  saveJson(cfg.templatesFile || 'templates.json', templates);
  var rc = await makeRequestContext();
  await browser.close();
  log('会话已保存（' + (cfg.stateFile || 'state.json') + '）。下次运行可跳过登录直接复用。', 'ok');
  return rc;
}

/* ---------------------------- 抢课循环 ---------------------------- */

function canAttempt(course) {
  var kch = String(course.kch || course.kch_id);
  if (state.claim[kch]) return false;
  var cd = state.cooldown[kch];
  if (cd && Date.now() < cd) return false;
  return true;
}

function markCooldown(course, ms) {
  var kch = String(course.kch || course.kch_id);
  state.cooldown[kch] = Date.now() + ms;
}

async function doQuery(rc) {
  var p = params.buildQueryParams(templates, state.kklxdm);
  var res = await apiPost(rc, '/xsxk/zzxkyzb_cxZzxkYzbPartDisplay.html', p);
  return (res && res.tmpList) || [];
}

async function scanOnce(rc) {
  if (state.querying) return [];
  state.querying = true;
  try {
    var list = await doQuery(rc);
    log('[查询] 返回 ' + list.length + ' 门课', 'info');
    var hits = list.filter(function (c) { return matchLib.matchTarget(state.targets, c, state.njdm); });
    if (hits.length) {
      log('[命中] ' + hits.map(function (c) { return '[' + c.kch + ']' + c.kcmc; }).join(' / '), 'hit');
      for (var i = 0; i < hits.length; i++) {
        if (!state.dryRun) await maybeAutoSelect(rc, hits[i]);
      }
    }
    return hits;
  } catch (e) {
    if (e instanceof SessionError) throw e;
    log('[查询] 失败: ' + e.message, 'err');
    return [];
  } finally {
    state.querying = false;
  }
}

async function maybeAutoSelect(rc, course) {
  var kch = String(course.kch || course.kch_id);
  if (!canAttempt(course)) return;
  var desc = '[' + kch + '] ' + course.kcmc;
  // 已选检测：目标已在已选课表中 → 明确提示并标记完成，不再反复抢
  try {
    var choosed = await apiPost(rc, '/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html', params.fetchChoosedParams(templates));
    var already = Array.isArray(choosed) && choosed.some(function (c) {
      return String(c.kch || '') === String(course.kch || '') || String(c.kch_id || '') === String(course.kch_id || '');
    });
    if (already) {
      log('[已选] ' + desc + ' 已在你的已选课表中，无需重复抢，标记完成', 'ok');
      notify('已选课程', course.kcmc + ' 已在已选课表中');
      state.claim[kch] = true;
      state.cooldown[kch] = 0;
      return;
    }
  } catch (e) {
    if (e instanceof SessionError) throw e;
    log('[已选检测] 查询已选课失败（忽略，继续尝试）: ' + e.message, 'warn');
  }
  state.claim[kch] = true; // 防并发重复进入
  try {
    await selectFlow(rc, course);
  } catch (e) {
    if (e instanceof SessionError) throw e;
    log('[选课] ' + desc + ' 流程异常: ' + e.message, 'err');
    markCooldown(course, 15000);
    state.claim[kch] = false;
  }
}

async function fetchJxb(rc, course) {
  var p = params.fetchJxbParams(templates, course, state.kklxdm);
  var res = await apiPost(rc, '/xsxk/zzxkyzbjk_cxJxbWithKchZzxkYzb.html', p);
  // 服务端对"无可用可选教学班"返回 "0"（字符串）或空数组
  if (res === '0' || res === 0) throw new NoClassError('教学班详情返回"0"：该课当前无可用可选教学班');
  var arr = Array.isArray(res) ? res : [];
  if (!arr.length) throw new NoClassError('教学班详情为空：该课当前无可用可选教学班');
  for (var i = 0; i < arr.length; i++) {
    if (course.jxb_id && String(arr[i].jxb_id).toUpperCase() === String(course.jxb_id).toUpperCase()) return arr[i];
  }
  return arr[0];
}

async function submitSelect(rc, course, detail) {
  var p = params.buildSubmitParams(templates, course, detail, state.kklxdm);
  return await apiPost(rc, '/xsxk/zzxkyzbjk_xkBcZyZzxkYzb.html', p);
}

async function selectFlow(rc, course) {
  var kchKey = String(course.kch || course.kch_id);
  var desc = '[' + (course.kch || course.kch_id) + '] ' + course.kcmc;
  log('[选课] 开始处理: ' + desc, 'info');

  var detail;
  try {
    detail = await fetchJxb(rc, course);
  } catch (e) {
    if (e instanceof SessionError) throw e;
    if (e instanceof NoClassError) {
      log('[选课] ' + desc + '：' + e.message + '（名额满/限选/批次原因，已降频到 60s 自动重试）', 'warn');
      state.claim[kchKey] = false;
      markCooldown(course, 60000);
      return;
    }
    throw e;
  }
  if (!detail.do_jxb_id) {
    log('[选课] 详情无 do_jxb_id: ' + desc, 'warn');
    state.claim[kchKey] = false;
    markCooldown(course, 15000);
    return;
  }

  log('[选课] 拿到加密ID，提交: ' + desc + ' @ ' + (detail.sksj || '') + ' ' + (detail.jxdd || ''), 'info');
  var res = await submitSelect(rc, course, detail);
  await handleSubmitResult(rc, course, detail, res);
}

async function handleSubmitResult(rc, course, detail, res) {
  var kchKey = String(course.kch || course.kch_id);
  var desc = '[' + (course.kch || course.kch_id) + '] ' + course.kcmc;
  var flag = res && (res.flag != null ? String(res.flag) : '');
  var msg = res && res.msg ? String(res.msg) : '';
  if (flag === '1') {
    log('[成功] 抢课成功: ' + desc, 'ok');
    notify('抢课成功', course.kcmc + ' 已选上');
    beep();
    state.claim[kchKey] = true;
    state.cooldown[kchKey] = 0;
  } else {
    log('[失败] ' + desc + (msg ? ' - ' + msg : ' - flag=' + flag), 'err');
    if (/冲突/.test(msg)) {
      await conflictLib.resolveConflict(deps(rc), course, detail, msg);
    } else {
      markCooldown(course, 30000);
      state.claim[kchKey] = false;
      notify('选课失败', msg || ('flag=' + flag));
    }
  }
}

function deps(rc) {
  return {
    api: {
      post: function (pathname, obj) { return apiPost(rc, pathname, obj); },
      submit: function (course, detail) { return submitSelect(rc, course, detail); }
    },
    templates: templates,
    state: state,
    log: log,
    notify: notify,
    markCooldown: markCooldown,
    handleSubmitResult: function (c, d, r) { return handleSubmitResult(rc, c, d, r); },
    sleep: params.sleep
  };
}

function handleSessionExpired() {
  log('== 会话已过期 ==', 'err');
  log(cfg.headless
    ? '服务器场景：请在本机重跑一次登录生成新的 ' + (cfg.stateFile || 'state.json') + ' 后传回服务器。'
    : '请重新运行本工具并手动登录（会话会自动复用已保存模板）。', 'warn');
  notify('选课工具会话过期', '需要重新登录');
  process.exitCode = 2;
}

async function runLoop(rc) {
  var built = matchLib.buildTargets(cfg.targets || {});
  state.targets = built.list;
  state.njdm = built.njdm;
  if (!state.targets.length) {
    log('没有配置目标课程：请编辑 config.json 的 targets（kch 课程号 / jxb 教学班ID / kw 关键词，至少填一个；njdm_id 年级过滤可选）', 'err');
    process.exit(1);
  }
  log('======================================', 'info');
  log('开始' + (state.dryRun ? '干跑' : '实跑') + '：间隔 ' + state.interval + 's | 类别 kklxdm=' + state.kklxdm + ' | 目标 ' + state.targets.length + ' 条' + (state.dryRun ? '（只监控，不提交）' : ''), 'info');

  while (true) {
    try {
      await scanOnce(rc);
    } catch (e) {
      if (e instanceof SessionError) { handleSessionExpired(); break; }
      log('[循环] 异常: ' + e.message, 'err');
    }
    await params.sleep(Math.round(state.interval * 1000));
  }
}

async function main() {
  var rc = await ensureLogin();
  await runLoop(rc);
}

main().catch(function (e) {
  log('致命错误: ' + e.message, 'err');
  if (e.stack) log(e.stack.split('\n').slice(0, 3).join(' | '), 'dim');
  process.exit(1);
});
