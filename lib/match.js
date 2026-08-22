// lib/match.js — 目标解析与模糊匹配（逻辑源自 选课助手.user.js，纯逻辑无副作用）
//
// config.targets 用字段分别声明类型，kch/jxb/kw 至少填一个：
//   kch     = 课程号（与列表 kch 完全相等）
//   jxb     = 教学班 ID（32位十六进制，与列表 jxb_id 完全相等，忽略大小写）
//   kw      = 关键词（课程名 kcmc 或 教学班名 jxbmc 包含该词）
//   njdm_id = 年级过滤（可选，作用于所有目标，默认 2025；留空则不按年级过滤）
// 每个字段支持：单个字符串 / 逗号或换行分隔的多个值 / 数组。

function isKch(v) { return /^\d+$/.test(String(v)); }

function isJxb(v) { return /^[0-9A-Fa-f]{32}$/.test(String(v)); }

// 字段值（字符串 / 数组）拆成条目列表，逗号、中文逗号、换行皆可分隔
function splitList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return String(v).split(/[,，\r\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

// 从 config.targets = {kch, jxb, kw, njdm_id} 生成目标列表
// 返回 { list: [目标...], njdm: [年级过滤值...] }
function buildTargets(fields) {
  fields = fields || {};
  var out = [];
  splitList(fields.kch).forEach(function (v) { out.push({ type: 'kch', value: String(v) }); });
  splitList(fields.jxb).forEach(function (v) { out.push({ type: 'jxb', value: String(v).toUpperCase() }); });
  splitList(fields.kw).forEach(function (v) { out.push({ type: 'kw', value: v }); });
  return { list: out, njdm: splitList(fields.njdm_id) };
}

// 任一目标命中即返回 true；配置了年级过滤 njdm 时，课程须属于该年级。
// 宽松处理：课程无年级字段时不过滤（部分学校列表不带 njdm_id，避免误挡全部）
function matchTarget(targets, course, njdm) {
  if (njdm && njdm.length) {
    var cg = String(course.njdm_id || '');
    if (cg && njdm.indexOf(cg) === -1) return false;
  }
  var kcmc = String(course.kcmc || '');
  var jxbmc = String(course.jxbmc || '');
  var kch = String(course.kch || course.kch_id || '');
  var jxb = String(course.jxb_id || '').toUpperCase();
  return targets.some(function (t) {
    if (t.type === 'kch') return kch === t.value;
    if (t.type === 'jxb') return jxb === t.value;
    return kcmc.indexOf(t.value) > -1 || jxbmc.indexOf(t.value) > -1;
  });
}

module.exports = { isKch: isKch, isJxb: isJxb, splitList: splitList, buildTargets: buildTargets, matchTarget: matchTarget };
