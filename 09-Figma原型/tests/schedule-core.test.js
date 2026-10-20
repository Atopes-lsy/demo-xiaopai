const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', '小排-首页.html');

function loadScheduleCore() {
  const html = fs.existsSync(htmlPath)
    ? fs.readFileSync(htmlPath, 'utf8')
    : '';
  const match = html.match(/<script id="schedule-core">([\s\S]*?)<\/script>/);
  if (!match) return {};

  const context = {};
  vm.createContext(context);
  vm.runInContext(match[1], context);
  return context;
}

function requireFunction(core, name) {
  assert.equal(
    typeof core[name],
    'function',
    `${name}() should be defined in <script id="schedule-core">`,
  );
}

const core = loadScheduleCore();

test('parses UTC-style clock times into minutes after midnight', () => {
  requireFunction(core, 'parseTimeToMinutes');
  assert.equal(core.parseTimeToMinutes('08:20'), 500);
  assert.equal(core.parseTimeToMinutes('21:00'), 1260);
});

test('rejects malformed clock times', () => {
  requireFunction(core, 'parseTimeToMinutes');
  assert.throws(() => core.parseTimeToMinutes('8:5'), /Invalid time/);
  assert.throws(() => core.parseTimeToMinutes('24:00'), /Invalid time/);
});

test('places an 08:20–09:55 block by duration, across the 09:00 hour line', () => {
  requireFunction(core, 'getBlockLayout');
  const layout = core.getBlockLayout('08:20', '09:55');

  assert.equal(layout.top, 14.67);
  assert.equal(layout.height, 67.67);
  assert.equal(layout.durationMinutes, 95);
  assert.ok(layout.top < 44, 'the block should not snap to 08:00');
  assert.ok(
    layout.top + layout.height > 44,
    'the block should cross the 09:00 hour line',
  );
});

test('rejects blocks whose end is not after their start', () => {
  requireFunction(core, 'getBlockLayout');
  assert.throws(
    () => core.getBlockLayout('10:00', '10:00'),
    /End time must be after start time/,
  );
  assert.throws(
    () => core.getBlockLayout('10:00', '09:00'),
    /End time must be after start time/,
  );
});

test('chooses content density from the block duration', () => {
  requireFunction(core, 'getBlockDensity');
  assert.equal(core.getBlockDensity(30), 'short');
  assert.equal(core.getBlockDensity(45), 'medium');
  assert.equal(core.getBlockDensity(60), 'medium');
  assert.equal(core.getBlockDensity(75), 'full');
  assert.equal(core.getBlockDensity(95), 'full');
});
