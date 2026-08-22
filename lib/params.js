// lib/params.js — 参数解析/序列化/模板拼装（从 选课助手.user.js 移植，纯逻辑）
//
// 正方系统数组参数用 key[0]=x 格式（不是 key[]=x）。本文件提供 flatten() 把对象
// 拍平成 {'njdm_id_list[0]': '..', ...} 交给 Playwright 的 form 选项编码提交。

function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 解析 application/x-www-form-urlencoded 字符串为对象（支持 key[0] 数组键）
function qsParse(str) {
  var obj = {};
  if (!str) return obj;
  var pairs = String(str).split('&');
  for (var i = 0; i < pairs.length; i++) {
    if (!pairs[i]) continue;
    var eq = pairs[i].indexOf('=');
    var k = eq < 0 ? pairs[i] : pairs[i].slice(0, eq);
    var v = eq < 0 ? '' : pairs[i].slice(eq + 1);
    try { k = decodeURIComponent(k); v = decodeURIComponent(v); } catch (e) {}
    var m = k.match(/^([^\[]+)\[(\d+)\]$/);
    if (m) {
      var arr = obj[m[1]] || (obj[m[1]] = []);
      arr[Number(m[2])] = v;
    } else {
      obj[k] = v;
    }
  }
  return obj;
}

// 把对象拍平成 {'key[0]': val, 'key[1]': val, 'obj[sub]': val} 的扁平 form
function flatten(o) {
  var out = {};
  function walk(v, prefix) {
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach(function (x, i) { walk(x, prefix + '[' + i + ']'); });
    } else if (typeof v === 'object') {
      Object.keys(v).forEach(function (k) {
        var key = prefix ? prefix + '[' + k + ']' : k;
        walk(v[k], key);
      });
    } else {
      out[prefix] = v;
    }
  }
  walk(o, '');
  return out;
}

function val() {
  for (var i = 0; i < arguments.length - 1; i++) { if (arguments[i] != null) return arguments[i]; }
  return arguments[arguments.length - 1];
}

function fmtXf(xf) { return String(xf == null ? '' : xf).replace(/\.0+$/, ''); }

// 从列表/详情对象里取 xkkz_id（直取，或从 xkgz 规则串第5段取）
function pickXkkzFromObj(obj) {
  if (!obj) return null;
  if (obj.xkkz_id) return String(obj.xkkz_id);
  if (typeof obj.xkgz === 'string' && obj.xkgz.indexOf('~') > -1) {
    var parts = obj.xkgz.split('~');
    if (parts.length >= 5) return parts[4];
  }
  return null;
}

// PartDisplay 查询参数：query 模板为准，缺的用 ctx 兜底，覆盖类别/分页
function buildQueryParams(templates, kklxdm) {
  var store = templates || {};
  var base = store.query ? deepCopy(store.query) : (store.ctx ? deepCopy(store.ctx) : {});
  var ctx = store.ctx;
  if (ctx) {
    var need = ['jg_id', 'zyh_id', 'zyfx_id', 'bh_id', 'njdm_id', 'xz', 'ccdm', 'xbm', 'mzm', 'xslbdm', 'xsbj', 'xkxnm', 'xkxqm'];
    for (var i = 0; i < need.length; i++) {
      if (base[need[i]] == null && ctx[need[i]] != null) base[need[i]] = ctx[need[i]];
    }
    if (base.njdm_id_list == null && ctx.njdm_id_list) base.njdm_id_list = ctx.njdm_id_list;
    if (base.jg_id_list == null && ctx.jg_id_list) base.jg_id_list = ctx.jg_id_list;
  }
  if (kklxdm) base.kklxdm = kklxdm;
  if (base.rwlx == null) base.rwlx = '2';
  if (base.xkly == null) base.xkly = '0';
  base.kspage = '1';
  base.jspage = '50';
  if (base.jxbzb == null) base.jxbzb = '';
  return base;
}

// 展开教学班详情（拿 do_jxb_id）的参数
// 服务端做全上下文校验：参数不全就返回 "0"（无可用教学班）。必须带完整学生上下文
// （query 模板最全），只去掉查询专用的分页字段。已由 diag3 实测验证。
function fetchJxbParams(templates, course, kklxdm) {
  var store = templates || {};
  var base = store.query ? deepCopy(store.query) : (store.ctx ? deepCopy(store.ctx) : {});
  ['kspage', 'jspage', 'jxbzb', 'bhjzckb'].forEach(function (k) { delete base[k]; });
  Object.assign(base, {
    xkxskcgskg: '1',
    kklxdm: course.kklxdm || kklxdm || base.kklxdm || '10',
    kch_id: course.kch_id || course.kch,
    jxbzcxskg: '0',
    xkkz_id: store.xkkz || '',
    cxbj: '0',
    fxbj: '0'
  });
  return base;
}

// 提交选课参数：优先用真实提交模板 submit，缺的字段用兜底逻辑
function buildSubmitParams(templates, course, detail, kklxdm) {
  var store = templates || {};
  var p = store.submit ? deepCopy(store.submit) : {};
  p.jxb_ids = detail.do_jxb_id;
  p.kch_id = course.kch_id || course.kch;
  var xf = fmtXf(course.xf != null ? course.xf : detail.xf);
  p.kcmc = '(' + (course.kch || course.kch_id) + ')' + course.kcmc + ' - ' + xf + ' 学分';
  if (store.xkkz) p.xkkz_id = store.xkkz;
  var ctx = store.ctx;
  if (ctx) {
    if (ctx.xkxnm) p.xkxnm = ctx.xkxnm;
    if (ctx.xkxqm) p.xkxqm = ctx.xkxqm;
    if (ctx.njdm_id) p.njdm_id = ctx.njdm_id;
    if (ctx.zyh_id) p.zyh_id = ctx.zyh_id;
  }
  p.kklxdm = course.kklxdm || p.kklxdm || kklxdm || '10';
  if (!store.submit) {
    // 没有真实提交模板时的兜底字段（尽力而为）
    p.rwlx = val(course.rwlx, detail.rwlx, '2');
    p.rlkz = val(course.rlkz, detail.rlkz, '0');
    p.rlzlkz = val(course.rlzlkz, detail.rlzlkz, '1');
    p.sxbj = val(course.sxbj, detail.sxbj, '0');
    p.xxkbj = val(course.xxkbj, detail.xxkbj, '0');
    p.qz = val(course.qz, detail.qz, '0');
    p.cxbj = '0';
    p.xklc = '2';
    p.xkly = val(ctx && ctx.xkly, '0');
  }
  return p;
}

function fetchChoosedParams(templates) {
  return deepCopy(templates.ctx || {});
}

function dropCourseParams(templates, c) {
  return {
    kch_id: c.kch_id || c.kch,
    jxb_ids: c.do_jxb_id,
    xkxnm: templates.ctx && templates.ctx.xkxnm,
    xkxqm: templates.ctx && templates.ctx.xkxqm,
    txbsfrl: '0'
  };
}

module.exports = {
  deepCopy: deepCopy,
  sleep: sleep,
  qsParse: qsParse,
  flatten: flatten,
  val: val,
  fmtXf: fmtXf,
  pickXkkzFromObj: pickXkkzFromObj,
  buildQueryParams: buildQueryParams,
  fetchJxbParams: fetchJxbParams,
  buildSubmitParams: buildSubmitParams,
  fetchChoosedParams: fetchChoosedParams,
  dropCourseParams: dropCourseParams
};
