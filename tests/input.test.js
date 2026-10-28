const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function inputContext({ touch = true, coarse = true, userAgent = 'Android' } = {}) {
  const classes = new Set();
  const buttons = new Map(['bomb', 'item'].map((action) => [action, {
    disabled: false, badge: { textContent: '' },
    querySelector() { return this.badge; },
  }]));
  const context = vm.createContext({
    navigator: { maxTouchPoints: touch ? 5 : 0, userAgent },
    window: { matchMedia: () => ({ matches: coarse }) },
    document: { body: { classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    } } },
    touchControlsEl: {
      hidden: true,
      querySelector(selector) { return buttons.get(selector.includes('"bomb"') ? 'bomb' : 'item'); },
    },
    bombsHeld: 2, consumables: [],
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

test('touch input activates controls even without coarse-pointer or phone user-agent detection', () => {
  const context = inputContext({ touch: false, coarse: false, userAgent: 'Desktop' });
  context.setInputMode('keyboard');
  assert.equal(context.touchControlsEl.hidden, true);
  context.setInputMode('touch');
  assert.equal(context.touchControlsEl.hidden, false);
  assert.equal(context.document.body.classList.contains('mobile-layout'), true);
});

test('touch-capable fine-pointer devices get the mobile layout and touch controls', () => {
  const context = inputContext({ coarse: false, userAgent: 'Desktop' });
  context.updateTouchControls();
  assert.equal(context.touchControlsEl.hidden, false);
  assert.equal(context.document.body.classList.contains('mobile-layout'), true);
});

test('large quick actions display inventory counts and disable empty supplies', () => {
  const context = inputContext();
  context.updateTouchControls();
  const bomb = context.touchControlsEl.querySelector('[data-touch-action="bomb"]');
  const item = context.touchControlsEl.querySelector('[data-touch-action="item"]');
  assert.equal(bomb.badge.textContent, '2');
  assert.equal(bomb.disabled, false);
  assert.equal(item.disabled, true);
  context.bombsHeld = 0;
  context.consumables.push({ id: 'mana-tonic', count: 3 });
  context.updateTouchControls();
  assert.equal(bomb.disabled, true);
  assert.equal(item.disabled, false);
  assert.equal(item.badge.textContent, '3');
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
  context.document.getElementById = (id) => elements.get(id);
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

test('Dash triggers without firing or releasing a held attack', () => {
  const { context, elements } = touchHarness();
  const dash = elements.get('dash');
  dash.fire('pointerdown', 1);
  assert.equal(context.touchInput.attack, false);
  elements.get('touch-aim-zone').fire('pointerdown', 2, 200, 50);
  dash.fire('pointerdown', 3);
  assert.deepEqual(context.actions, ['dash', 'dash']);
  assert.equal(context.touchInput.attack, true);
  assert.equal(context.touchInput.attackPointer, 2);
});