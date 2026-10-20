const test = require('node:test');
const assert = require('node:assert');
const { main } = require('./validate_input.js');

test('正常文本通过并去掉首尾空白', async () => {
  const r = await main({ params: { notification_text: '  下周三交报告  ' } });
  assert.strictEqual(r.input_ok, true);
  assert.strictEqual(r.notification_text, '下周三交报告');
  assert.strictEqual(r.error, null);
});

test('空字符串被拦截', async () => {
  const r = await main({ params: { notification_text: '' } });
  assert.strictEqual(r.input_ok, false);
  assert.match(r.error, /empty_input/);
});

test('纯空白被拦截', async () => {
  const r = await main({ params: { notification_text: ' \n\t ' } });
  assert.strictEqual(r.input_ok, false);
});

test('兼容测试脚本的 raw_text 变量', async () => {
  const r = await main({ params: { raw_text: '收到，周四开会' } });
  assert.strictEqual(r.input_ok, true);
  assert.strictEqual(r.notification_text, '收到，周四开会');
});

test('notification_text 为空时回退到 raw_text', async () => {
  const r = await main({ params: { notification_text: '', raw_text: '明天交作业' } });
  assert.strictEqual(r.input_ok, true);
  assert.strictEqual(r.notification_text, '明天交作业');
});

test('完全缺失参数被拦截', async () => {
  const r = await main({ params: {} });
  assert.strictEqual(r.input_ok, false);
  assert.match(r.error, /empty_input/);
});

test('非字符串输入被拦截', async () => {
  const r = await main({ params: { notification_text: 123 } });
  assert.strictEqual(r.input_ok, false);
});
