const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function inputContext({ touch = true, coarse = true, userAgent = 'Android' } = {}) {
  const context = vm.createContext({
    navigator: { maxTouchPoints: touch ? 5 : 0, userAgent },
    window: { matchMedia: () => ({ matches: coarse }) },
    touchControlsEl: { hidden: true },
    touchInput: { moveX: 1, moveY: 1, attack: true, stickPointer: 1, attackPointer: 2 },
    stickKnobEl: { style: {} },
    touchAttackEl: { classList: { add() {}, remove() {} } },
    gamepadInput: { connected: false },
    lastInputMode: 'touch', mode: 'playing',
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function isTouchDevice()'), source.indexOf("let mode = 'prologue'")), context);
  return context;
}

test('phone touch controls hide for keyboard and return for touch', () => {
  const context = inputContext();
  context.updateTouchControls();
  assert.equal(context.touchControlsEl.hidden, false);
  context.setInputMode('keyboard');
  assert.equal(context.touchControlsEl.hidden, true);
  assert.equal(context.touchInput.moveX, 0);
  assert.equal(context.touchInput.attack, false);
  context.setInputMode('touch');
  assert.equal(context.touchControlsEl.hidden, false);
});

test('a connected controller suppresses phone controls until disconnect', () => {
  const context = inputContext();
  context.gamepadInput.connected = true;
  context.updateTouchControls();
  assert.equal(context.touchControlsEl.hidden, true);
  context.gamepadInput.connected = false;
  context.updateTouchControls();
  assert.equal(context.touchControlsEl.hidden, false);
});

test('small keyboard-only screens and fine-pointer laptops do not show controls', () => {
  for (const settings of [{ touch: false }, { coarse: false, userAgent: 'Desktop' }]) {
    const context = inputContext(settings);
    context.updateTouchControls();
    assert.equal(context.touchControlsEl.hidden, true);
  }
});

test('touch overlays stay out of menus and release held inputs', () => {
  const context = inputContext();
  context.mode = 'paused';
  context.updateTouchControls();
  assert.equal(context.touchControlsEl.hidden, true);
  assert.equal(context.touchInput.attackPointer, null);
  assert.equal(context.touchInput.stickPointer, null);
});

function touchHarness() {
  const context = inputContext();
  const elements = new Map();
  const makeElement = (id) => {
    const listeners = new Map();
    const element = {
      style: {}, dataset: {}, classList: { add() {}, remove() {} },
      addEventListener(type, handler) { listeners.set(type, handler); },
      setPointerCapture() {},
      fire(type, pointerId, clientX = 0, clientY = 0) {
        listeners.get(type)?.({ pointerType: 'touch', pointerId, clientX, clientY, preventDefault() {}, stopPropagation() {} });
      },
    };
    elements.set(id, element);
    return element;
  };
  makeElement('touch-move-zone');
  makeElement('touch-aim-zone');
  const dash = makeElement('dash');
  dash.dataset.touchAction = 'dash';
  context.touchControlsEl.querySelectorAll = () => [dash];
  context.document = { getElementById: (id) => elements.get(id) };
  context.startGameMusic = context.releaseAttackInputSuppressionIfIdle = () => {};
  context.actions = [];
  context.runAction = (action) => context.actions.push(action);
  context.resetTouchInput();
  context.setupTouchControls();
  return { context, elements };
}

test('independent fingers move and fire, and releasing one leaves the other active', () => {
  const { context, elements } = touchHarness();
  const move = elements.get('touch-move-zone');
  const aim = elements.get('touch-aim-zone');
  move.fire('pointerdown', 1, 50, 50);
  move.fire('pointermove', 1, 90, 50);
  aim.fire('pointerdown', 2, 200, 50);
  aim.fire('pointermove', 2, 200, 90);
  assert.equal(context.touchInput.moveX, 1);
  assert.equal(context.touchInput.attack, true);
  assert.equal(context.touchInput.aimActive, true);
  assert.equal(context.touchInput.aimY, 1);
  move.fire('pointerup', 1);
  assert.equal(context.touchInput.moveX, 0);
  assert.equal(context.touchInput.attack, true);
  aim.fire('pointercancel', 2);
  assert.equal(context.touchInput.attack, false);
  assert.equal(context.touchInput.aimActive, false);
});

test('movement is clamped and a second finger cannot steal a held movement zone', () => {
  const { context, elements } = touchHarness();
  const move = elements.get('touch-move-zone');
  move.fire('pointerdown', 1);
  move.fire('pointerdown', 3);
  move.fire('pointermove', 3, 100, 100);
  assert.equal(context.touchInput.moveX, 0);
  move.fire('pointermove', 1, 100, 100);
  assert.ok(Math.abs(Math.hypot(context.touchInput.moveX, context.touchInput.moveY) - 1) < 1e-10);
  move.fire('lostpointercapture', 1);
  assert.equal(context.touchInput.moveY, 0);
});

test('utility buttons trigger gameplay actions without stopping movement', () => {
  const { context, elements } = touchHarness();
  elements.get('touch-move-zone').fire('pointerdown', 1);
  elements.get('touch-move-zone').fire('pointermove', 1, 40, 0);
  elements.get('dash').fire('pointerdown', 2);
  assert.deepEqual(context.actions, ['dash']);
  assert.equal(context.touchInput.moveX, 1);
});