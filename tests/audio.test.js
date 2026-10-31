const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/load');

function audioContext({ contextState = 'running', fetchOk = true, decodeFails = false } = {}) {
  const log = { buffers: [], elements: [], fetches: [] };
  const fakeContext = {
    state: contextState,
    destination: {},
    createGain() { return { gain: { value: 1 }, connect() {} }; },
    createBufferSource() {
      const source = { buffer: null, connect() {}, start() { log.buffers.push({ buffer: source.buffer, gain: source.gainValue }); } };
      return source;
    },
    decodeAudioData(data, ok, fail) { (decodeFails ? fail : ok)(decodeFails ? new Error('decode') : { decoded: data }); },
  };
  const sandbox = {
    audioSettings: { sfxVolume: 0.5 },
    soundRoot: 'sfx',
    somSoundRoot: 'som',
    soundPools: new Map(),
    soundBuffers: new Map(),
    gameMusic: { context: fakeContext },
    fetch: async (url) => {
      log.fetches.push(url);
      return { ok: fetchOk, status: fetchOk ? 200 : 404, arrayBuffer: async () => url };
    },
    Audio: class {
      constructor(url) { this.url = url; this.paused = true; log.elements.push(this); }
      play() { this.paused = false; return Promise.resolve(); }
    },
  };
  const context = vm.createContext(sandbox);
  context.gameAssetVersions = null;
  loadFunctions(context, 'cachemanager.js', ['versionedAssetUrl']);
  loadFunctions(context, 'gameui.js', ['soundUrl', 'loadSoundBuffer', 'preloadSounds', 'playSoundBuffer', 'playSound']);
  return { context, log, fakeContext };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('first play uses a throwaway element while the buffer decodes, then reuses the buffer', async () => {
  const { context, log } = audioContext();
  context.playSound('system/click.ogg', 0.4);
  assert.equal(log.elements.length, 1);
  assert.equal(log.elements[0].url, 'sfx/system/click.ogg');
  assert.equal(log.elements[0].volume, 0.2);
  assert.equal(context.soundPools.size, 0);
  await settle();
  context.playSound('system/click.ogg', 0.4);
  context.playSound('system/click.ogg', 0.4);
  assert.equal(log.buffers.length, 2);
  assert.equal(log.fetches.length, 1);
  assert.equal(log.elements.length, 1);
});

test('som: paths resolve to the Source of Mana sound root', async () => {
  const { context, log } = audioContext();
  context.preloadSounds(['som:alteration/levelup.ogg']);
  await settle();
  assert.deepEqual(log.fetches, ['som/alteration/levelup.ogg']);
});

test('a failed fetch falls back to the pooled audio elements', async () => {
  const { context, log } = audioContext({ fetchOk: false });
  context.playSound('punch.ogg');
  await settle();
  context.playSound('punch.ogg');
  assert.equal(context.soundBuffers.get('punch.ogg'), 'failed');
  assert.equal(context.soundPools.get('punch.ogg').length, 4);
  assert.equal(log.buffers.length, 0);
  assert.equal(log.fetches.length, 1);
});

test('a failed decode falls back to the pooled audio elements', async () => {
  const { context } = audioContext({ decodeFails: true });
  context.playSound('punch.ogg');
  await settle();
  context.playSound('punch.ogg');
  assert.equal(context.soundBuffers.get('punch.ogg'), 'failed');
  assert.ok(context.soundPools.has('punch.ogg'));
});

test('without a running audio context sounds use the pool and nothing is fetched', () => {
  const { context, log } = audioContext({ contextState: 'suspended' });
  context.playSound('punch.ogg');
  assert.equal(log.fetches.length, 0);
  assert.ok(context.soundPools.has('punch.ogg'));
});

test('a muted sound effect volume plays nothing', () => {
  const { context, log } = audioContext();
  context.audioSettings.sfxVolume = 0;
  context.playSound('punch.ogg');
  assert.equal(log.elements.length, 0);
  assert.equal(log.fetches.length, 0);
});
