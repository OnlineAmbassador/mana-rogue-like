const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { loadBetween, loadFunctions } = require('./helpers/load');

function settingsContext(from = 'select') {
  const text = [];
  const storage = new Map([
    ['profile', 'progress'], ['bank', '100'], ['run', 'saved run'],
    ['audio', 'audio preferences'], ['controls', 'custom controls'], ['help', 'false'],
  ]);
  const c = vm.createContext({
    mode: from, audioFocus: null, audioSliderDragging: null, resetConfirmTimer: 0,
    controlsHelpVisible: false, pointer: { x: 0, y: 0, down: true },
    AUDIO_FOCUS_ORDER: ['music', 'sfx'], audioSettings: { volume: 0.7, sfxVolume: 0.8 },
    lastInputMode: 'keyboard', messageTimer: 0, messageEl: { textContent: '' },
    updateHud() {}, showMessage(message) { c.messageEl.textContent = message; },
    toggleControlsHelp() { c.controlsHelpVisible = !c.controlsHelpVisible; },
    adjustAudioVolume(which, amount) { c.audioSettings[which === 'music' ? 'volume' : 'sfxVolume'] += amount; },
    pointInBounds(b, x = c.pointer.x, y = c.pointer.y) {
      return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
    },
    VIEW_W: 960, VIEW_H: 540,
    ctx: new Proxy({ fillText: value => text.push(value) }, {
      get: (target, key) => target[key] || (() => {}), set(target, key, value) { target[key] = value; return true; },
    }),
    drawManaPanel() {}, drawAudioPanel() { text.push('audio panel'); },
    controlsReturnMode: 'select', controlsTab: 'key', controlsRow: 0, controlsCapture: false,
    PROFILE_STORAGE_KEY: 'profile', BANK_STORAGE_KEY: 'bank', RUN_STORAGE_KEY: 'run',
    localStorage: { removeItem: key => storage.delete(key) },
    save: { unlockedCharacters: ['advanced'], bankedZeny: 100 },
    getSave: () => ({ unlockedCharacters: [], bankedZeny: 0 }), persistSave() {},
    chapterQueue: [], activeChapter: null, runProgressionSnapshot: null, storyLog: [],
    coins: 5, character: {}, selectedIndex: 2, prologuePage: 0,
    stopChapterNarration() {}, startPrologueNarration() {},
  });
  loadBetween(c, 'gameui.js', "let settingsReturnMode = 'select';", 'function codexButtonBounds(');
  loadFunctions(c, 'gameui.js', ['requestProgressReset', 'openControls', 'closeControls']);
  loadFunctions(c, 'dbmanager.js', ['resetAllProgress']);
  return { c, text, storage };
}

test('Settings returns to its origin, with keyboard, pointer, Help and nested Controls support', () => {
  for (const origin of ['select', 'paused']) {
    const { c } = settingsContext(origin);
    c.openSettings();
    assert.equal(c.mode, 'settings');
    assert.equal(c.pointer.down, false);
    c.handleSettingsKey({}, 'arrowright');
    assert.ok(c.audioSettings.volume > 0.7);
    c.handleSettingsKey({}, 'arrowdown');
    c.handleSettingsKey({}, 'arrowleft');
    assert.ok(c.audioSettings.sfxVolume < 0.8);
    c.activateSettingsEntry('help');
    assert.equal(c.controlsHelpVisible, true);
    c.activateSettingsEntry('controls');
    assert.equal(c.mode, 'controls');
    c.closeControls();
    assert.equal(c.mode, 'settings');
    assert.equal(vm.runInContext('settingsFocus', c), 'controls');
    const back = c.settingsButtonBounds('back');
    Object.assign(c.pointer, { x: back.x + 10, y: back.y + 10 });
    c.handleSettingsPointer();
    assert.equal(c.mode, origin);
    assert.equal(c.audioFocus, null);
    assert.equal(c.resetConfirmTimer, 0);
  }
});

test('reset is shown only in title-origin Settings and requires a second explicit confirmation', () => {
  const { c, text, storage } = settingsContext();
  c.openSettings();
  c.drawSettings();
  assert.ok(text.includes('Reset all progress'));
  c.activateSettingsEntry('reset');
  assert.equal(c.mode, 'settings');
  assert.equal(storage.get('run'), 'saved run');
  c.closeSettings();
  c.openSettings();
  c.activateSettingsEntry('reset');
  assert.equal(c.mode, 'settings', 'leaving Settings cancels the previous confirmation');
  c.activateSettingsEntry('reset');
  assert.equal(c.mode, 'prologue');
  for (const key of ['profile', 'bank', 'run']) assert.equal(storage.has(key), false);
  assert.equal(storage.get('audio'), 'audio preferences');
  assert.equal(storage.get('controls'), 'custom controls');
  assert.equal(storage.get('help'), 'false');
  assert.equal(c.save.bankedZeny, 0);
  assert.deepEqual([...c.save.unlockedCharacters], []);

  const paused = settingsContext('paused');
  paused.c.openSettings();
  paused.c.drawSettings();
  assert.ok(!paused.c.settingsEntries().includes('reset'));
  assert.ok(!paused.text.includes('Reset all progress'));
  paused.c.activateSettingsEntry('reset');
  paused.c.requestProgressReset();
  assert.equal(paused.c.resetConfirmTimer, 0);
  assert.equal(paused.storage.get('run'), 'saved run');
});

test('reset storage failures surface an error instead of announcing success', () => {
  const { c } = settingsContext();
  c.localStorage.removeItem = () => { throw new Error('Storage unavailable'); };
  assert.equal(c.resetAllProgress(), false);
  assert.match(c.messageEl.textContent, /could not be cleared/);
  assert.equal(c.mode, 'select');
});

test('audio navigation never focuses narration when its control is hidden', () => {
  for (const enabled of [false, true]) {
    const c = vm.createContext({ NARRATION_ENABLED: enabled, audioFocus: null });
    loadBetween(c, 'game.js', 'const AUDIO_FOCUS_ORDER =', 'const prologueNarrations =');
    loadFunctions(c, 'gameui.js', ['stepAudioFocus']);
    const order = [...vm.runInContext('AUDIO_FOCUS_ORDER', c)];
    assert.deepEqual(order, enabled ? ['music', 'sfx', 'tts'] : ['music', 'sfx']);
    c.stepAudioFocus(-1);
    assert.equal(c.audioFocus, enabled ? 'tts' : 'sfx');
    c.stepAudioFocus(1);
    assert.equal(c.audioFocus, null);
  }
});

test('controller focus has a contrasting fill, thick bright border and pointer marker', () => {
  const calls = [];
  const c = vm.createContext({
    ctx: new Proxy({}, {
      get: (target, key) => target[key] || ((...args) => calls.push([key, ...args])),
      set(target, key, value) { target[key] = value; calls.push([key, value]); return true; },
    }),
  });
  loadFunctions(c, 'gameui.js', ['drawControllerFocus']);
  c.drawControllerFocus({ x: 100, y: 200, width: 180, height: 36 });
  assert.ok(calls.some(([op, value]) => op === 'fillStyle' && value === 'rgba(255, 218, 112, 0.22)'));
  assert.ok(calls.some(([op, value]) => op === 'strokeStyle' && value === '#fff2ad'));
  assert.ok(calls.some(([op, value]) => op === 'lineWidth' && value === 7));
  assert.equal(calls.filter(([op]) => op === 'strokeRect').length, 2);
  assert.equal(calls.filter(([op]) => op === 'lineTo').length, 2);
});

test('controller Settings visibly focuses audio even with narration disabled and only the active button', () => {
  const { c } = settingsContext();
  const focus = [];
  Object.assign(c, {
    NARRATION_ENABLED: false, lastInputMode: 'controller', gamepadInput: { family: 'xbox' },
    drawControllerFocus(bounds) { focus.push(bounds); },
  });
  loadFunctions(c, 'gameui.js', [
    'drawAudioPanel', 'volumeSliderBounds', 'sfxSliderBounds', 'ttsButtonBounds', 'sliderHitBounds',
  ]);
  c.openSettings();
  c.drawSettings();
  assert.equal(focus.length, 1);
  assert.equal(focus[0].y, c.sliderHitBounds(c.volumeSliderBounds()).y);
  focus.length = 0;
  c.moveSettingsFocus(1);
  c.drawSettings();
  assert.equal(focus.length, 1);
  assert.equal(focus[0].y, c.sliderHitBounds(c.sfxSliderBounds()).y);
  focus.length = 0;
  c.moveSettingsFocus(1);
  c.drawSettings();
  assert.equal(focus.length, 1);
  assert.equal(focus[0].y, c.settingsButtonBounds('help').y);
});

test('mouse and touch audio selection cancel reset confirmation and move keyboard focus', () => {
  for (const pointerType of ['mouse', 'touch']) {
    for (const which of ['music', 'sfx']) {
      const { c, storage } = settingsContext();
      let pointerDown;
      Object.assign(c, {
        NARRATION_ENABLED: false,
        canvas: {
          addEventListener(type, handler) { if (type === 'pointerdown') pointerDown = handler; },
          setPointerCapture() {},
        },
        setInputMode() {}, updateControlsHint() {}, startGameMusic() {}, applyAudioSettings() {},
        ttsPromptActive: () => false,
        updatePointerPosition(event) { c.pointer.x = event.clientX; c.pointer.y = event.clientY; },
      });
      loadFunctions(c, 'gameui.js', [
        'volumeSliderBounds', 'sfxSliderBounds', 'sliderHitBounds',
        'setVolumeFromPointer', 'handleAudioPanelPointerDown',
      ]);
      loadBetween(c, 'game.js', "canvas.addEventListener('pointerdown',", 'function endBranchPointer(');
      c.openSettings();
      const reset = c.settingsButtonBounds('reset');
      Object.assign(c.pointer, { x: reset.x + 10, y: reset.y + 10 });
      c.handleSettingsPointer();
      assert.equal(c.resetConfirmTimer, 5);
      pointerDown({
        button: 0, isPrimary: true, pointerId: 1, pointerType,
        clientX: 100, clientY: which === 'music' ? 45 : 80,
      });
      assert.equal(c.resetConfirmTimer, 0);
      assert.equal(vm.runInContext('settingsFocus', c), which);
      assert.equal(c.audioFocus, which);
      c.handleSettingsKey({}, 'enter');
      assert.equal(c.mode, 'settings');
      assert.equal(storage.get('run'), 'saved run');
    }
  }
});

test('character selection only presents Settings, and menu button targets do not overlap', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'gameui.js'), 'utf8');
  const select = source.slice(source.indexOf('function drawCharacterSelect('), source.indexOf('function drawCodex('));
  assert.ok(select.includes('SETTINGS'));
  for (const removed of ['drawAudioPanel(', 'HELP:', 'CONTROLS ', 'RESET ALL PROGRESS']) assert.ok(!select.includes(removed), removed);
  const { c } = settingsContext();
  const entries = ['help', 'controls', 'reset', 'back'];
  for (let i = 0; i < entries.length - 1; i++) {
    const a = c.settingsButtonBounds(entries[i]);
    const b = c.settingsButtonBounds(entries[i + 1]);
    assert.ok(a.y + a.height < b.y);
    assert.ok(a.height >= 44);
  }
});
