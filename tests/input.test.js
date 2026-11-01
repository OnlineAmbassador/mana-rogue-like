const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceText } = require('./helpers/load');

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
      querySelector(selector) {
        if (selector.includes('"bomb"')) return buttons.get('bomb');
        if (selector.includes('"item"')) return buttons.get('item');
        return null;
      },
    },
    bombsHeld: 2, consumables: [],
    touchInput: { moveX: 1, moveY: 1, attack: true, stickPointer: 1, attackPointer: 2 },
    stickKnobEl: { style: {} },
    touchAttackEl: { classList: { add() {}, remove() {} } },
    gamepadInput: { connected: false },
    lastInputMode: 'touch', lastNonControllerInputMode: 'touch', mode: 'playing', showMap: false,
    resizeCanvas() {}, VIEW_W: 960, VIEW_H: 540,
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function isTouchDevice()', "let mode = 'prologue'", 'source'), context);
  return context;
}

function controllerContext() {
  const gamepad = {
    connected: true,
    mapping: 'standard',
    id: 'Xbox Wireless Controller',
    index: 0,
    axes: [0, 0, 0.8, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  const context = vm.createContext({
    navigator: { getGamepads: () => [gamepad] },
    player: { lookX: 1, lookY: 0 },
    camera: { x: 0, y: 0 },
    canvas: { width: 960, height: 540 },
    pointer: { x: 0, y: 0, down: false },
    touchInput: { attack: false },
    mode: 'playing',
    showMap: false,
    lastInputMode: 'keyboard',
    lastNonControllerInputMode: 'keyboard',
    mouseAimActive: true,
    attackInputSuppressed: false,
    audioFocus: null,
    menuFocus: '',
    previousMenuVertical: 0,
    AUDIO_FOCUS_ORDER: [],
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    showMessage() {},
    setInputMode(inputMode) {
      this.lastInputMode = inputMode;
      if (inputMode !== 'controller') this.lastNonControllerInputMode = inputMode;
      this.mouseAimActive = false;
    },
    updateControlsHint() {},
    startGameMusic() {},
    ttsPromptActive: () => false,
    handleAudioPanelPad() { return false; },
    isTouchDevice: () => true,
    actionForPad: () => null,
  });
  context.gamepad = gamepad;
  const source = fs.readFileSync(path.join(__dirname, '..', 'controllermanager.js'), 'utf8');
  vm.runInContext(source, context);
  context.setInputMode = (inputMode) => {
    context.lastInputMode = inputMode;
    if (inputMode !== 'controller') context.lastNonControllerInputMode = inputMode;
    context.mouseAimActive = false;
  };
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

test('touchscreen press selects touch mode and shows the controls', () => {
  const { context, elements } = touchHarness();
  context.setInputMode('keyboard');
  elements.get('touch-move-zone').fire('pointerdown', 1, 50, 50);
  assert.equal(context.lastInputMode, 'touch');
  assert.equal(context.touchControlsEl.hidden, false);
});

test('controller right stick sets player facing and projectile aim direction', () => {
  const context = controllerContext();
  context.pollGamepad();
  assert.equal(context.lastInputMode, 'controller');
  assert.equal(vm.runInContext('gamepadInput.shoot', context), true);
  assert.equal(vm.runInContext('gamepadInput.aimActive', context), true);
  assert.ok(Math.abs(context.player.lookY) < 1e-10);
  assert.ok(context.player.lookX > 0);
  assert.ok(vm.runInContext('gamepadInput.aimX', context) > 0.99);
});

test('controller left stick moves without changing facing', () => {
  const context = controllerContext();
  context.gamepad.axes = [0.8, 0, 0, 0];
  context.player.lookX = 0;
  context.player.lookY = 1;
  context.pollGamepad();
  assert.ok(vm.runInContext('gamepadInput.moveX', context) > 0);
  assert.equal(vm.runInContext('gamepadInput.aimActive', context), false);
  assert.equal(context.player.lookX, 0);
  assert.equal(context.player.lookY, 1);
});

test('keyboard and mouse mode aims from the cursor even while buttons are released', () => {
  const context = vm.createContext({
    monsterSprites: {},
    lastInputMode: 'keyboard',
    pointer: { x: 200, y: 100, down: false },
    camera: { x: 0, y: 0 },
    player: { x: 100, y: 100 },
    attackOriginY: () => 100,
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'playermanager.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function currentAimAngle()', 'function updateTouchAimFacing()', 'source'), context);
  assert.equal(context.currentAimAngle(), 0);
});

test('controller mode always aims from the right stick, not cursor or movement facing', () => {
  const context = vm.createContext({
    monsterSprites: {},
    lastInputMode: 'controller',
    pointer: { x: 0, y: 0, down: true },
    camera: { x: 0, y: 0 },
    player: { x: 100, y: 100, lookX: 0, lookY: -1 },
    gamepadInput: { aimX: 0, aimY: 1, aimActive: false },
    attackOriginY: () => 100,
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'playermanager.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function attackOriginY()', 'function updateTouchAimFacing()', 'source'), context);
  assert.equal(context.currentAimAngle(), Math.PI / 2);
});

test('controller disconnect restores touch mode and clears held controls', () => {
  const context = controllerContext();
  context.setInputMode('touch');
  context.pollGamepad();
  context.navigator.getGamepads = () => [];
  context.pollGamepad();
  assert.equal(context.lastInputMode, 'touch');
  assert.equal(vm.runInContext('gamepadInput.connected', context), false);
  assert.equal(vm.runInContext('gamepadInput.shoot', context), false);
  assert.equal(vm.runInContext('gamepadInput.aimActive', context), false);
});

test('right-stick motion selects controller mode and button presses select controller mode', () => {
  const context = controllerContext();
  context.pollGamepad();
  assert.equal(context.lastInputMode, 'controller');

  context.setInputMode('keyboard');
  context.gamepad.axes[2] = 0;
  context.gamepad.axes[0] = 0;
  context.gamepad.axes[1] = 0;
  context.gamepad.buttons[0] = { pressed: true, value: 1 };
  context.pollGamepad();
  assert.equal(context.lastInputMode, 'controller');
  context.setInputMode('keyboard');
  context.pollGamepad();
  assert.equal(context.lastInputMode, 'keyboard');
});

test('touch input takes over even while a controller remains connected', () => {
  const context = inputContext();
  context.gamepadInput.connected = true;
  context.setInputMode('controller');
  context.setInputMode('touch');
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

test('keyboard movement does not override the mouse-selected facing direction', () => {
  const { context } = touchHarness();
  const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function shouldKeyboardMovementSetFacing', 'function update(dt)', 'source'), context);
  context.lastInputMode = 'keyboard';
  Object.assign(context.gamepadInput, { dpadFacing: false, aimActive: false, shoot: false });
  context.pointer = { down: false };
  context.mouseAimActive = true;
  assert.equal(context.shouldKeyboardMovementSetFacing(1), false);
  context.mouseAimActive = false;
  assert.equal(context.shouldKeyboardMovementSetFacing(1), true);
  context.touchInput.attack = true;
  assert.equal(context.shouldKeyboardMovementSetFacing(1), false);
  context.lastInputMode = 'touch';
  context.touchInput.attack = false;
  assert.equal(context.shouldKeyboardMovementSetFacing(1), false);
});

function facingHoldContext() {
  const context = vm.createContext({
    MOUSE_AIM_HOLD: 1,
    mouseAimActive: true,
    mouseAimIdleTimer: 0,
    lastInputMode: 'keyboard',
    pointer: { down: false },
    player: { attackAnimationTimer: 0 },
    gamepadInput: { aimActive: false, shoot: false },
    touchInput: { attack: false, aimActive: false },
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function shouldKeyboardMovementSetFacing', 'function update(dt)', 'source'), context);
  return context;
}

test('mouse facing hands back to walking after the mouse has been idle', () => {
  const context = facingHoldContext();
  context.updateMouseAimHold(0.5);
  assert.equal(context.mouseAimActive, true);
  assert.equal(context.shouldMovementSetFacing(1), false);
  context.updateMouseAimHold(0.5);
  assert.equal(context.mouseAimActive, false);
  assert.equal(context.shouldMovementSetFacing(1), true);
});

test('mouse facing is held while a button is down or an attack is animating', () => {
  const context = facingHoldContext();
  context.pointer.down = true;
  context.updateMouseAimHold(5);
  assert.equal(context.mouseAimActive, true);
  context.pointer.down = false;
  context.player.attackAnimationTimer = 0.2;
  context.updateMouseAimHold(5);
  assert.equal(context.mouseAimActive, true);
  assert.equal(context.mouseAimIdleTimer, 0);
});

test('walking sets facing on controller and touch only when not aiming or attacking', () => {
  const context = facingHoldContext();
  assert.equal(context.shouldMovementSetFacing(0), false);
  context.lastInputMode = 'controller';
  assert.equal(context.shouldMovementSetFacing(1), true);
  context.gamepadInput.aimActive = true;
  assert.equal(context.shouldMovementSetFacing(1), false);
  context.gamepadInput.aimActive = false;
  context.gamepadInput.shoot = true;
  assert.equal(context.shouldMovementSetFacing(1), false);
  context.lastInputMode = 'touch';
  assert.equal(context.shouldMovementSetFacing(1), true);
  context.touchInput.attack = true;
  assert.equal(context.shouldMovementSetFacing(1), false);
  context.touchInput.attack = false;
  context.touchInput.aimActive = true;
  assert.equal(context.shouldMovementSetFacing(1), false);
});

test('mouse movement updates player facing toward the pointer before firing', () => {
  const { context } = touchHarness();
  context.mode = 'playing';
  context.showMap = false;
  context.pointer = { x: 0, y: 0, down: false };
  context.player = { x: 480, y: 270, lookX: 1, lookY: 0 };
  context.camera = { x: 0, y: 0 };
  context.audioSliderDragging = null;
  context.canvas = {
    width: 960,
    height: 540,
    clientLeft: 0, clientTop: 0, clientWidth: 960, clientHeight: 540,
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
  };
  context.updateControlsHint = () => {};
  context.ttsPromptActive = () => false;
  const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function canvasPointFromEvent(event)', "canvas.addEventListener('pointermove'", 'source'), context);
  vm.runInContext(sliceText(source, 'function shouldKeyboardMovementSetFacing', 'function update(dt)', 'source'), context);

  context.updatePointerPosition({ pointerType: 'mouse', clientX: 120, clientY: 260 });
  assert.equal(context.lastInputMode, 'touch');
  assert.ok(context.player.lookX < 0);
  assert.ok(Math.abs(context.player.lookY) < 0.1);
  assert.equal(context.mouseAimActive, true);
  assert.equal(context.shouldKeyboardMovementSetFacing(1), false);
});

function touchAimContext() {
  const context = vm.createContext({
    monsterSprites: {},
    player: { x: 100, y: 134, lookX: 1, lookY: 0 },
    touchInput: { attack: true, aimActive: true, aimX: 1, aimY: 0 },
    lastInputMode: 'touch',
    camera: { x: 0, y: 0 },
    pointer: { down: false },
    enemies: [
      { x: 200, y: 30, radius: 12, hp: 5 },
      { x: 115, y: 90, radius: 12, hp: 0 },
    ],
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    distanceBetween: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'playermanager.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function enemyAttackTarget(', 'function meleeInputHeld()', 'source'), context);
  return context;
}

test('touch mode always aims at the nearest live mob, regardless of movement or dragged aim', () => {
  const context = touchAimContext();
  const aimAngle = context.currentAimAngle();
  const targetAngle = Math.atan2(30 - (134 - 34), 200 - 100);
  assert.ok(Math.abs(aimAngle - targetAngle) < 1e-10,
    `touch aim should lock directly to the nearest target: ${aimAngle} vs ${targetAngle}`);

  context.enemies = [{ x: 100, y: 400, radius: 12, hp: 5 }];
  assert.equal(context.currentAimAngle(), Math.PI / 2);
});

test('enemy-free touch aim follows the attack drag in every direction', () => {
  const context = touchAimContext();
  context.enemies = [];
  for (const [x, y] of [[1, 0], [-1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) {
    Object.assign(context.touchInput, { aimX: x, aimY: y });
    const expected = Math.atan2(y, x);
    assert.equal(context.currentAimAngle(), expected);
    context.updateTouchAimFacing();
    assert.ok(Math.abs(context.player.lookX - Math.cos(expected)) < 1e-10);
    assert.ok(Math.abs(context.player.lookY - Math.sin(expected)) < 1e-10);
  }
});

test('enemy-free touch hold uses facing, not a stale drag or an eastward fallback', () => {
  const context = touchAimContext();
  context.enemies = [];
  context.touchInput.aimActive = false;
  for (const [x, y] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
    Object.assign(context.player, { lookX: x, lookY: y });
    assert.equal(context.currentAimAngle(), Math.atan2(y, x));
  }
});

test('touch aim switches from enemy lock to manual aim on death and back for a new enemy', () => {
  const context = touchAimContext();
  context.enemies = [{ x: 200, y: 100, hp: 1 }];
  Object.assign(context.touchInput, { aimX: 0, aimY: -1 });
  assert.equal(context.currentAimAngle(), 0);
  context.enemies[0].hp = 0;
  assert.equal(context.currentAimAngle(), -Math.PI / 2);
  context.enemies.push({ x: 100, y: 200, hp: 1 });
  assert.equal(context.currentAimAngle(), Math.PI / 2);
});

test('touch attack aim sets facing while touch movement alone does not', () => {
  const context = vm.createContext({
    monsterSprites: {},
    player: { lookX: 0, lookY: 1 },
    touchInput: { attack: true },
    currentAimAngle: () => 0,
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'playermanager.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function updateTouchAimFacing()', 'function meleeInputHeld()', 'source'), context);
  context.updateTouchAimFacing();
  assert.equal(context.player.lookX, 1);
  assert.equal(context.player.lookY, 0);
  context.touchInput.attack = false;
  context.player.lookY = 1;
  context.updateTouchAimFacing();
  assert.equal(context.player.lookY, 1);
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
      contains(target) { return target === this; },
      fire(type, pointerId, clientX = 0, clientY = 0, target = this) {
        listeners.get(type)?.({ pointerType: 'touch', pointerId, clientX, clientY, target, preventDefault() {}, stopPropagation() {} });
      },
    };
    elements.set(id, element);
    return element;
  };
  makeElement('touch-move-zone');
  makeElement('touch-aim-zone');
  context.touchAttackEl = makeElement('touch-attack');
  const dash = makeElement('dash');
  dash.dataset.touchAction = 'dash';
  context.touchControlsEl.querySelectorAll = () => [dash];
  context.document.getElementById = (id) => elements.get(id);
  context.startGameMusic = context.releaseAttackInputSuppressionIfIdle = () => {};
  context.canInteract = () => false;
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

test('touch drag and release keep enemy-free aim aligned with the last shot', () => {
  const { context, elements } = touchHarness();
  Object.assign(context, {
    player: { x: 100, y: 134, lookX: 0, lookY: -1 },
    enemies: [], lastInputMode: 'touch',
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'playermanager.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function attackOriginY()', 'function meleeInputHeld()', 'source'), context);
  const aim = elements.get('touch-aim-zone');
  aim.fire('pointerdown', 1, 200, 50);
  assert.equal(context.currentAimAngle(), -Math.PI / 2);
  aim.fire('pointermove', 1, 160, 50);
  assert.equal(context.currentAimAngle(), Math.PI);
  context.updateTouchAimFacing();
  aim.fire('pointerup', 1);
  aim.fire('pointerdown', 2, 200, 50);
  assert.equal(context.touchInput.aimActive, false);
  assert.equal(context.currentAimAngle(), Math.PI);
  aim.fire('pointercancel', 2);
});

test('touch Attack becomes Use beside a shop or menhir once no enemies live, but never for doors', () => {
  const { context, elements } = touchHarness();
  const aim = elements.get('touch-aim-zone');
  const attack = elements.get('touch-attack');
  let used = 0;
  let doorsAsked = null;
  context.interact = () => { used += 1; };
  context.canInteract = (includeDoors = true) => { doorsAsked = includeDoors; return true; };
  context.enemies = [];
  aim.fire('pointerdown', 1, 200, 50, attack);
  assert.equal(used, 1, 'a tap with something in reach interacts');
  assert.equal(doorsAsked, false, 'doors are left to walking through the doorway');
  assert.equal(context.touchInput.attack, false);
  assert.equal(context.touchInput.attackPointer, null);
  context.enemies = [{ hp: 3 }];
  aim.fire('pointerdown', 2, 200, 50, attack);
  assert.equal(used, 1, 'with live enemies Attack always attacks');
  assert.equal(context.touchInput.attack, true);
  aim.fire('pointercancel', 2);
  context.enemies = [];
  context.canInteract = () => false;
  aim.fire('pointerdown', 3, 200, 50, attack);
  assert.equal(used, 1);
  assert.equal(context.touchInput.attack, true);
});

test('touch Attack glows and reads Use when a tap would interact, and Skill shows only for active class skills', () => {
  const context = inputContext();
  const classes = new Set();
  const attackLabel = { textContent: 'Attack' };
  context.touchAttackEl = {
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, remove() {} },
    querySelector: () => attackLabel,
  };
  const label = { textContent: 'Skill' };
  const skill = { hidden: true, disabled: false, title: '', querySelector: () => label, setAttribute() {} };
  const original = context.touchControlsEl.querySelector;
  context.touchControlsEl.querySelector = (selector) => (selector.includes('"ability"') ? skill
    : original.call(context.touchControlsEl, selector));
  context.player = { signatureCooldown: 0 };
  context.enemies = [];
  context.canInteract = () => false;
  context.classSignature = () => ({ label: 'Steady Magic', desc: 'Balanced casting' });
  context.updateTouchControls();
  assert.equal(classes.has('is-ready'), false);
  assert.equal(attackLabel.textContent, 'Attack');
  assert.equal(skill.hidden, true, 'classes without an active skill get no Skill button');
  context.canInteract = () => true;
  context.classSignature = () => ({ label: 'Laser Quill', short: 'Laser', desc: 'Key 4: fire a piercing laser beam', active: true });
  context.updateTouchControls();
  assert.equal(classes.has('is-ready'), true);
  assert.equal(attackLabel.textContent, 'Use');
  context.enemies = [{ hp: 1 }];
  context.updateTouchControls();
  assert.equal(attackLabel.textContent, 'Attack', 'live enemies keep it an attack button');
  assert.equal(skill.hidden, false);
  assert.equal(label.textContent, 'Laser');
  assert.equal(skill.title, 'Laser Quill: fire a piercing laser beam');
  context.player.signatureCooldown = 2.2;
  context.updateTouchControls();
  assert.equal(label.textContent, '3s');
  assert.equal(skill.disabled, true);
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
test('the touch Swap button counts down the weapon swap cooldown and disables itself', () => {
  const context = inputContext();
  const label = { textContent: 'Swap' };
  const button = { disabled: false, querySelector: () => label };
  const original = context.touchControlsEl.querySelector;
  context.touchControlsEl.querySelector = (selector) =>
    (selector.includes('nextWeapon') ? button : original.call(context.touchControlsEl, selector));
  context.weaponSwapCooldown = 3.2;
  context.updateTouchControls();
  assert.equal(label.textContent, '4s');
  assert.equal(button.disabled, true);
  context.weaponSwapCooldown = 0;
  context.updateTouchControls();
  assert.equal(label.textContent, 'Swap');
  assert.equal(button.disabled, false);
});
