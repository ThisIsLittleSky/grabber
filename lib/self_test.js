// lib/self_test.js — 纯逻辑单元测试（match / schedule / params），不依赖网络
'use strict';
var match = require('./match');
var schedule = require('./schedule');
var params = require('./params');

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}
function eq(a, b, name) { ok(a === b, name + '  [' + a + '] === [' + b + ']'); }

console.log('--- match ---');
(function () {
  eq(match.isKch('207786'), true, 'isKch 纯数字');
  eq(match.isKch('20x786'), false, 'isKch 非数字');
  eq(match.isJxb('5706B5A0B5F80E52E0630B02FD0A792D'), true, 'isJxb 32位hex');
  eq(match.isJxb('5706'), false, 'isJxb 长度不足');
  var b1 = match.buildTargets({ kch: '207786', jxb: '5706b5a0b5f80e52e0630b02fd0a792d', kw: '摄影', njdm_id: '2025' });
  eq(b1.list.length, 3, 'buildTargets 三字段');
  eq(b1.njdm.join(','), '2025', 'njdm_id 解析');
  eq(b1.list[0].type, 'kch', '字段1=kch');
  eq(b1.list[1].type, 'jxb', '字段2=jxb');
  eq(b1.list[1].value, '5706B5A0B5F80E52E0630B02FD0A792D', 'jxb 转大写');
  eq(b1.list[2].type, 'kw', '字段3=关键词');
  eq(match.buildTargets({ kw: '摄影' }).list.length, 1, '只填关键词也生效');
  eq(match.buildTargets({ kw: '摄影' }).njdm.length, 0, '不填 njdm_id 则不过滤');
  eq(match.buildTargets({ kch: '207786,207787' }).list.length, 2, 'kch 逗号多值');
  eq(match.buildTargets({ kch: '207786\n207787' }).list.length, 2, 'kch 换行多值');
  eq(match.buildTargets({ jxb: ['A'.repeat(32), 'B'.repeat(32)] }).list.length, 2, 'jxb 数组多值');
  eq(match.buildTargets({}).list.length, 0, '全空=0');
  eq(match.splitList('  a ，b, c ').length, 3, 'splitList 中英逗号+空格');
  ok(match.matchTarget([{ type: 'kch', value: '207786' }], { kch: '207786', kcmc: '风光摄影' }), 'kch 命中');
  ok(!match.matchTarget([{ type: 'kch', value: '207786' }], { kch: '207787', kcmc: '风光摄影' }), 'kch 未命中');
  ok(match.matchTarget([{ type: 'jxb', value: 'A'.repeat(32) }], { jxb_id: 'a'.repeat(32), kcmc: 'x' }), 'jxb 命中(忽略大小写)');
  ok(match.matchTarget([{ type: 'kw', value: '摄影' }], { jxbmc: '摄影一班' }), '关键词命中 jxbmc');
  ok(match.matchTarget([{ type: 'kw', value: '摄影' }], { kcmc: '风光摄影' }), '关键词命中 kcmc');
  ok(!match.matchTarget([{ type: 'kw', value: '摄影' }], { kcmc: '数据结构' }), '关键词未命中');
  // 年级过滤（宽松：课程无年级字段时不挡）
  var tg = [{ type: 'kch', value: '207786' }];
  ok(match.matchTarget(tg, { kch: '207786', njdm_id: '2025' }, ['2025']), '年级命中');
  ok(!match.matchTarget(tg, { kch: '207786', njdm_id: '2024' }, ['2025']), '年级不匹配');
  ok(match.matchTarget(tg, { kch: '207786' }, ['2025']), '课程无年级字段则不过滤');
  ok(match.matchTarget(tg, { kch: '207786', njdm_id: '2024' }, []), '未配置年级过滤则不过滤');
})();

console.log('--- schedule ---');
(function () {
  var w = schedule.parseWeeks('1-16');
  eq(w.has(1) && w.has(16) && w.has(8), true, 'parseWeeks 1-16');
  eq(w.has(17), false, '1-16 不含17');
  var odd = schedule.parseWeeks('1-15(单)');
  eq(odd.has(1) && odd.has(3) && odd.has(15), true, '单周');
  eq(odd.has(2), false, '单周不含2');
  var even = schedule.parseWeeks('2-16(双)');
  eq(even.has(2) && even.has(16), true, '双周');
  var every = schedule.parseWeeks('1-16(1-16)');
  eq(every.has(7), true, '每周');
  var s = schedule.parseSchedule('星期一第3-4节{1-8}<br/>星期三第5-6节{1-16}');
  ok(s && s.length === 2, 'parseSchedule 两段');
  eq(s[0].day, 1, '周一');
  eq(s[0].start, 3, 'start=3');
  eq(s[0].end, 4, 'end=4');
  var a = schedule.parseSchedule('星期一第3-4节{1-8}');
  var b = schedule.parseSchedule('星期一第1-4节{1-8}');
  var c = schedule.parseSchedule('星期一第7-8节{1-8}');
  var d = schedule.parseSchedule('星期二第3-4节{1-8}');
  ok(schedule.schedulesOverlap(a, b), '重叠(区间相交)');
  ok(!schedule.schedulesOverlap(a, c), '不重叠(区间分离)');
  ok(!schedule.schedulesOverlap(a, d), '不重叠(不同天)');
  var oddA = schedule.parseSchedule('星期一第3-4节{1-15(单)}');
  var evenB = schedule.parseSchedule('星期一第3-4节{2-16(双)}');
  ok(!schedule.schedulesOverlap(oddA, evenB), '不重叠(单双周交错)');
})();

console.log('--- params ---');
(function () {
  var q = params.qsParse('njdm_id_list[0]=2023&njdm_id_list[1]=2022&bh_id=01&kklxdm=10');
  eq(q.bh_id, '01', 'qsParse 普通键');
  ok(Array.isArray(q.njdm_id_list) && q.njdm_id_list[0] === '2023' && q.njdm_id_list[1] === '2022', 'qsParse 数组键');
  var flat = params.flatten({ a: '1', arr: ['x', 'y'], nested: { b: '2' } });
  eq(flat['a'], '1', 'flatten 普通');
  eq(flat['arr[0]'], 'x', 'flatten 数组[0]');
  eq(flat['arr[1]'], 'y', 'flatten 数组[1]');
  eq(flat['nested[b]'], '2', 'flatten 嵌套对象');
  var f2 = params.flatten({ njdm_id_list: ['2023', '2022'] });
  eq(f2['njdm_id_list[0]'], '2023', 'flatten 学生列表[0]');

  var tpl = {
    ctx: { jg_id: '1', zyh_id: '2', bh_id: '01', njdm_id: '2023', xkxnm: '2023', xkxqm: '12', njdm_id_list: ['2023'], jg_id_list: ['1'] },
    query: { kklxdm: '10', rwlx: '2', xkly: '0', kspage: '1', jspage: '20' },
    submit: null,
    xkkz: 'XKZ123'
  };
  var qp = params.buildQueryParams(tpl, '10');
  eq(qp.bh_id, '01', 'buildQueryParams 用 query 模板');
  eq(qp.jspage, '50', 'buildQueryParams 覆盖分页 jspage=50');
  eq(qp.kklxdm, '10', 'buildQueryParams 覆盖类别');

  var course = { kch: '207786', kch_id: '207786', kcmc: '风光摄影', xf: '2.0', jxb_id: 'A'.repeat(32) };
  var detail = { do_jxb_id: '0b0771813105bb91168840266facf99a'.padEnd(128, '0'), sksj: '星期一第3-4节{1-8}', xf: '2' };
  var jp = params.fetchJxbParams(tpl, course, '10');
  eq(jp.xkkz_id, 'XKZ123', 'fetchJxbParams 带 xkkz_id');
  eq(jp.kch_id, '207786', 'fetchJxbParams kch_id');
  var sp = params.buildSubmitParams(tpl, course, detail, '10');
  eq(sp.jxb_ids, detail.do_jxb_id, 'buildSubmitParams jxb_ids=加密串');
  eq(sp.kcmc, '(207786)风光摄影 - 2 学分', 'buildSubmitParams kcmc 格式');
  eq(sp.xkkz_id, 'XKZ123', 'buildSubmitParams xkkz_id');
  eq(sp.xkxnm, '2023', 'buildSubmitParams ctx 补齐 xkxnm');
  // 兜底字段（无 submit 模板时）
  ok(sp.rwlx === '2' && sp.sxbj === '0' && sp.xklc === '2', 'buildSubmitParams 兜底字段');

  eq(params.pickXkkzFromObj({ xkkz_id: 'X1' }), 'X1', 'pickXkkz 直取');
  eq(params.pickXkkzFromObj({ xkgz: '1~0~0~1~X2~0~0' }), 'X2', 'pickXkkz 从 xkgz');
  eq(params.pickXkkzFromObj({}), null, 'pickXkkz 无');
})();

console.log('--- conflict.isDroppable ---');
(function () {
  var c = require('./conflict');
  ok(c.isDroppable({ kklxdm: '10', rwlx: '2' }), '可退：通识选修');
  ok(!c.isDroppable({ kklxdm: '10', rwlx: '1' }), '不可退：rwlx=1');
  ok(!c.isDroppable({ kklxdm: '3', rwlx: '2' }), '不可退：kklxdm=3');
})();

console.log('');
console.log('通过 ' + passed + '，失败 ' + failed);
process.exit(failed ? 1 : 0);
