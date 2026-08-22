// lib/conflict.js — 冲突源定位 + 可退判定 + 退选重选（从 选课助手.user.js 移植）
//
// 安全铁律：只退"可退的选修课"（kklxdm=10 且 rwlx=2），其余一律只告警不动手。
// 依赖通过 deps 注入：{ api, templates, state, log, notify, markCooldown, handleSubmitResult, sleep }

var schedule = require('./schedule');
var params = require('./params');

function isDroppable(c) {
  var kl = String(c.kklxdm || '');
  var rw = String(c.rwlx || '');
  return kl === '10' && rw === '2';
}

async function fetchChoosed(deps) {
  if (!deps.templates.ctx) return [];
  var p = params.fetchChoosedParams(deps.templates);
  return await deps.api.post('/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html', p);
}

async function dropCourse(deps, c) {
  var doJxb = c.do_jxb_id;
  if (!doJxb) {
    deps.log('[退选] 已选课缺少 do_jxb_id，无法退选: [' + c.kch + '] ' + c.kcmc, 'err');
    return false;
  }
  var p = params.dropCourseParams(deps.templates, c);
  deps.log('[退选] 提交退选: [' + c.kch + '] ' + c.kcmc + ' @ ' + (c.sksj || ''), 'warn');
  var res = await deps.api.post('/xsxk/zzxkyzb_tuikBcZzxkYzb.html', p);
  var ok = String(res) === '1' || res === 1;
  deps.log('[退选] ' + (ok ? '成功' : '失败(' + String(res) + ')'), ok ? 'ok' : 'err');
  return ok;
}

async function resolveConflict(deps, course, detail, msg) {
  var state = deps.state;
  var kchKey = String(course.kch || course.kch_id);
  var desc = '[' + (course.kch || course.kch_id) + '] ' + course.kcmc;
  deps.log('[冲突] ' + desc + ' 时间冲突，尝试定位冲突源', 'warn');

  var tgtSched = schedule.parseSchedule(detail.sksj || course.sksj || '');
  if (!tgtSched) {
    deps.log('[冲突] 无法解析目标课时间，安全放弃', 'warn');
    state.claim[kchKey] = false;
    deps.markCooldown(course, 60000);
    return;
  }

  var choosed = await fetchChoosed(deps);
  var conflicts = choosed.filter(function (c) {
    if (String(c.kch_id || c.kch) === String(course.kch_id || course.kch)) return false;
    var s = schedule.parseSchedule(c.sksj || '');
    return s && schedule.schedulesOverlap(tgtSched, s);
  });

  if (!conflicts.length) {
    deps.log('[冲突] 未定位到重叠课程，安全放弃（可能服务端规则不同）', 'warn');
    deps.notify('选课冲突', desc + ' 无法自动解决');
    state.claim[kchKey] = false;
    deps.markCooldown(course, 60000);
    return;
  }

  deps.log('[冲突] 定位到重叠课程: ' + conflicts.map(function (c) { return '[' + c.kch + ']' + c.kcmc; }).join(' / '), 'warn');
  var droppable = conflicts.filter(isDroppable);
  if (!droppable.length) {
    deps.log('[冲突] 重叠课程均为必修/不可退，安全放弃，请手动处理', 'warn');
    deps.notify('选课冲突', desc + ' 与必修课冲突，无法自动退选');
    state.claim[kchKey] = false;
    deps.markCooldown(course, 120000);
    return;
  }

  var victim = droppable[0];
  deps.log('[冲突] 自动退选冲突源: [' + victim.kch + '] ' + victim.kcmc + '，随后重选 ' + desc, 'warn');
  deps.notify('自动退选冲突课', '[' + victim.kch + '] ' + victim.kcmc);
  var ok = await dropCourse(deps, victim);
  if (!ok) {
    state.claim[kchKey] = false;
    deps.markCooldown(course, 60000);
    return;
  }
  await deps.sleep(500);
  deps.log('[冲突] 重试提交: ' + desc, 'info');
  var res2 = await deps.api.submit(course, detail);
  await deps.handleSubmitResult(course, detail, res2);
}

module.exports = { isDroppable: isDroppable, fetchChoosed: fetchChoosed, dropCourse: dropCourse, resolveConflict: resolveConflict };
