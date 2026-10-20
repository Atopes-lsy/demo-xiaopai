const test = require('node:test');
const assert = require('node:assert');
const { main } = require('./deadline_guard.js');

const ID7 = `❗️「常规通道」作品提交【倒计时 3天】‼️

📌 「常规通道」时间节点
- 提交截止：10月20日 23:59
- 入围名额：9 个决赛席位
- 完整晋级名单公布：11月7日

⚠请注意提交作品将 所有想提交的文件打包 一次性提交 ，若文件较大可使用「上传超大文件」

✨还在打磨作品的同学，记得在截止时间前完成提交～`;

const ID8 = '需要订购教材的同学请在8月4日至8月11日内完成预订操作，具体内容详见通知及操作说明';

test('id 7：公告型提交截止触发', async () => {
  const r = await main({ params: { notification_text: ID7 } });
  assert.strictEqual(r.deadline_cue, true);
  assert.strictEqual(r.force_extract, true);
  assert.strictEqual(r.info_date_only, false);
  assert.match(r.evidence, /提交截止/);
});

test('id 8：订购窗口触发', async () => {
  const r = await main({ params: { notification_text: ID8 } });
  assert.strictEqual(r.deadline_cue, true);
  assert.match(r.evidence, /预订/);
});

test('名单公布单独出现不触发', async () => {
  const r = await main({ params: { notification_text: '完整晋级名单公布：11月7日' } });
  assert.strictEqual(r.deadline_cue, false);
  assert.strictEqual(r.info_date_only, true);
});

test('结果公布单独出现不触发', async () => {
  const r = await main({ params: { notification_text: '评选结果公布：10月30日' } });
  assert.strictEqual(r.deadline_cue, false);
  assert.strictEqual(r.info_date_only, true);
});

test('活动开始单独出现不触发', async () => {
  const r = await main({ params: { notification_text: '活动开始：10月20日' } });
  assert.strictEqual(r.deadline_cue, false);
  assert.strictEqual(r.info_date_only, true);
});

test('提交截止与名单公布同段：仍触发', async () => {
  const r = await main({ params: { notification_text: '名单公布 11月7日，提交截止 10月20日' } });
  assert.strictEqual(r.deadline_cue, true);
  assert.strictEqual(r.info_date_only, false);
});

test('报名截止本周五触发', async () => {
  const r = await main({ params: { notification_text: '报名截止本周五' } });
  assert.strictEqual(r.deadline_cue, true);
});

test('下周三前提交课程报告触发', async () => {
  const r = await main({ params: { notification_text: '下周三前提交课程报告' } });
  assert.strictEqual(r.deadline_cue, true);
});

test('有截止线索但没有日期不触发', async () => {
  const r = await main({ params: { notification_text: '提交截止，具体时间另行通知' } });
  assert.strictEqual(r.deadline_cue, false);
  assert.strictEqual(r.reason, 'action_without_date');
});

test('只有动作、没有截止线索不触发', async () => {
  const r = await main({ params: { notification_text: '请尽快提交材料' } });
  assert.strictEqual(r.deadline_cue, false);
  assert.strictEqual(r.reason, 'no_cue');
});

test('只有日期没有用户动作不触发', async () => {
  const r = await main({ params: { notification_text: '10月20日开班会' } });
  assert.strictEqual(r.deadline_cue, false);
  assert.strictEqual(r.reason, 'date_without_action');
});

test('“前完成作品打磨”不因完成二字误触发', async () => {
  const r = await main({ params: { notification_text: '请于10月20日前完成作品打磨' } });
  assert.strictEqual(r.deadline_cue, false);
});

test('纯闲聊不触发', async () => {
  const r = await main({ params: { notification_text: '收到，谢谢老师！' } });
  assert.strictEqual(r.deadline_cue, false);
  assert.strictEqual(r.reason, 'no_cue');
});

test('空输入不触发', async () => {
  const r = await main({ params: {} });
  assert.strictEqual(r.deadline_cue, false);
  assert.strictEqual(r.reason, 'empty_input');
});

test('兼容 raw_text 变量', async () => {
  const r = await main({ params: { raw_text: '缴费截止 10月30日 17:00' } });
  assert.strictEqual(r.deadline_cue, true);
});
