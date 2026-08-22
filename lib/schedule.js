// lib/schedule.js — 上课时间/周次解析与冲突判定（从 选课助手.user.js 移植，纯逻辑）

var DAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };

// 周次规格串 -> Set<周数>，支持：1-16 / 1-16(单) / 2-16(双) / 1-16(1-16)
function parseWeeks(spec) {
  var weeks = new Set();
  var tokens = String(spec || '').split(',');
  tokens.forEach(function (t) {
    t = t.trim().replace('周', '');
    if (!t) return;
    var m = t.match(/^(\d+)(?:-(\d+))?$/);
    if (m) {
      var a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
      for (var w = a; w <= b; w++) weeks.add(w);
      return;
    }
    var single = t.match(/^(\d+)-(\d+)\(单\)$/);
    var dual = t.match(/^(\d+)-(\d+)\(双\)$/);
    var every = t.match(/^(\d+)-(\d+)\((\d+)-(\d+)\)$/);
    if (single) {
      for (var i1 = parseInt(single[1], 10); i1 <= parseInt(single[2], 10); i1 += 2) weeks.add(i1);
    } else if (dual) {
      for (var i2 = parseInt(dual[1], 10); i2 <= parseInt(dual[2], 10); i2 += 2) weeks.add(i2);
    } else if (every) {
      for (var i3 = parseInt(every[3], 10); i3 <= parseInt(every[4], 10); i3++) weeks.add(i3);
    }
  });
  return weeks;
}

// 教学班时间串（可含多个 <br>）-> [{day,start,end,weeks}]，解析不出返回 null
function parseSchedule(str) {
  if (!str) return null;
  var parts = String(str).split(/<br\s*\/?>/i);
  var segs = [];
  parts.forEach(function (part) {
    var m = part.match(/星期([一二三四五六日天])第(\d+)(?:-(\d+))?节\{([^}]*)\}/);
    if (!m) return;
    segs.push({
      day: DAY_MAP[m[1]],
      start: parseInt(m[2], 10),
      end: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10),
      weeks: parseWeeks(m[4])
    });
  });
  return segs.length ? segs : null;
}

// 两段课表是否时间重叠（同天 + 节次区间相交 + 周次有交集）
function schedulesOverlap(a, b) {
  for (var i = 0; i < a.length; i++) {
    for (var j = 0; j < b.length; j++) {
      var x = a[i], y = b[j];
      if (x.day !== y.day) continue;
      if (!(x.start <= y.end && y.start <= x.end)) continue;
      var has = false;
      x.weeks.forEach(function (w) { if (y.weeks.has(w)) has = true; });
      if (has) return true;
    }
  }
  return false;
}

module.exports = { DAY_MAP: DAY_MAP, parseWeeks: parseWeeks, parseSchedule: parseSchedule, schedulesOverlap: schedulesOverlap };
