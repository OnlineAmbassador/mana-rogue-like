const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/load');

function assets() {
  const timers = [];
  const warnings = [];
  const errors = [];
  const c = vm.createContext({
    artwork: { images: new Map(), pending: new Set(), failed: new Set(), deferred: new Set(), queue: [] },
    assetRoot: 'graphics', timers, warnings, errors,
    Image: class {
      set src(value) {
        assert.equal(typeof this.onload, 'function');
        assert.equal(typeof this.onerror, 'function');
        this.url = value;
      }
    },
    setTimeout: (fn) => timers.push(fn),
    console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
  });
  c.gameAssetVersions = null;
  loadFunctions(c, 'cachemanager.js', ['versionedAssetUrl']);
  loadFunctions(c, 'gameui.js', ['loadAsset', 'loadDeferredAsset', 'retryFailedArtwork', 'artworkBlocking', 'updateArtworkLoading']);
  return c;
}

test('artwork requests share an image and install handlers before starting the request', () => {
  const c = assets();
  const image = c.loadAsset('rock.png');
  assert.equal(image, c.loadAsset('rock.png'));
  assert.notEqual(image, c.loadAsset('rock.png', 'other'));
  assert.equal(c.artwork.images.size, 2);
  assert.equal(c.artwork.pending.size, 2);
  image.onload();
  assert.equal(c.artwork.pending.size, 1);
});

test('artwork stays pending until asynchronous decoding finishes', async () => {
  const c = assets();
  const image = c.loadAsset('rock.png');
  let ready;
  image.decode = () => new Promise((resolve) => { ready = resolve; });
  image.onload();
  assert.equal(c.artwork.pending.size, 1);
  ready();
  await Promise.resolve();
  assert.equal(c.artwork.pending.size, 0);
});

test('failed artwork retries once, reports failure and supports explicit retry', () => {
  const c = assets();
  const image = c.loadAsset('rock.png');
  image.onerror(new Error('network'));
  assert.equal(c.timers.length, 1);
  assert.equal(c.artwork.pending.size, 1);
  assert.equal(c.warnings.length, 1);
  c.timers[0]();
  image.onerror(new Error('HTTP 404'));
  assert.equal(c.artwork.pending.size, 0);
  assert.equal(c.artwork.failed.size, 1);
  assert.equal(c.errors.length, 1);
  c.retryFailedArtwork();
  assert.equal(c.artwork.failed.size, 0);
  assert.equal(c.artwork.pending.size, 1);
  image.onload();
  assert.equal(c.artwork.pending.size, 0);
});

test('decode failures follow the same bounded retry and visible error path', async () => {
  const c = assets();
  const image = c.loadAsset('rock.png');
  image.decode = () => Promise.reject(new Error('decode failed'));
  image.onload();
  await Promise.resolve();
  c.timers[0]();
  image.onload();
  await Promise.resolve();
  assert.equal(c.artwork.failed.size, 1);
  assert.equal(c.errors.length, 1);
});

test('loading overlay reports missing paths, clears held input and exposes retry', () => {
  const c = assets();
  const elements = {
    'artwork-loading': { hidden: true },
    'artwork-status': { textContent: '' },
    'artwork-retry': { hidden: true },
  };
  c.document = { getElementById: (id) => elements[id] };
  c.keys = { w: true };
  c.pointer = { down: true };
  let resets = 0;
  c.resetTouchInput = () => { resets++; };
  const image = c.loadAsset('rock.png');
  assert.equal(c.updateArtworkLoading(), true);
  assert.equal(c.keys.w, false);
  assert.equal(c.pointer.down, false);
  assert.equal(resets, 1);
  image.onerror('offline');
  c.timers[0]();
  image.onerror('offline');
  assert.equal(c.updateArtworkLoading(), true);
  assert.match(elements['artwork-status'].textContent, /graphics\/rock.png/);
  assert.equal(elements['artwork-retry'].hidden, false);
  c.retryFailedArtwork();
  image.onload();
  assert.equal(c.updateArtworkLoading(), false);
  assert.equal(elements['artwork-loading'].hidden, true);
});

function qualityContext() {
  const c = vm.createContext({
    quality: { low: false, avgMs: 16.7, slowFor: 0, fastFor: 0, recoverySeconds: 10 },
    resizes: 0,
  });
  c.resizeCanvas = () => { c.resizes++; };
  loadFunctions(c, 'game.js', ['updateQuality']);
  return c;
}

test('fast machines keep full quality, sustained slow frames lower it', () => {
  const c = qualityContext();
  for (let frame = 0; frame < 600; frame++) c.updateQuality(1 / 60);
  assert.equal(c.quality.low, false);
  assert.equal(c.resizes, 0);
  for (let frame = 0; frame < 120; frame++) c.updateQuality(1 / 30);
  assert.equal(c.quality.low, true);
  assert.equal(c.resizes, 1);
});

test('neutral frames interrupt quality timers and background gaps are ignored', () => {
  const c = qualityContext();
  Object.assign(c.quality, { avgMs: 22, slowFor: 1.9, fastFor: 9 });
  c.updateQuality(0.022);
  assert.equal(c.quality.slowFor, 0);
  assert.equal(c.quality.fastFor, 0);
  const previous = JSON.stringify(c.quality);
  c.updateQuality(4);
  assert.equal(JSON.stringify(c.quality), previous);
});

test('quality recovery backs off to avoid repeatedly resizing an overloaded device', () => {
  const c = qualityContext();
  Object.assign(c.quality, { low: true, fastFor: 10 });
  c.updateQuality(1 / 60);
  assert.equal(c.quality.low, false);
  assert.equal(c.quality.recoverySeconds, 20);
  Object.assign(c.quality, { low: true, fastFor: 11 });
  c.updateQuality(1 / 60);
  assert.equal(c.quality.low, true);
});

test('artwork that finishes loading mid-run never blocks play, but a failed download still does', () => {
  const c = assets();
  const elements = {
    'artwork-loading': { hidden: true },
    'artwork-status': { textContent: '' },
    'artwork-retry': { hidden: true },
  };
  c.document = { getElementById: (id) => elements[id] };
  c.keys = {};
  c.pointer = { down: false };
  c.resetTouchInput = () => {};
  const first = c.loadAsset('first.png');
  assert.equal(c.artworkBlocking(), true, 'startup waits for the initial artwork');
  first.onload();
  assert.equal(c.updateArtworkLoading(), false);
  const late = c.loadAsset('late.png');
  assert.equal(c.artwork.pending.size, 1);
  assert.equal(c.artworkBlocking(), false, 'a late image just appears when ready');
  assert.equal(c.updateArtworkLoading(), false);
  late.onerror('offline');
  c.timers[0]();
  late.onerror('offline');
  assert.equal(c.artworkBlocking(), true, 'a failed download offers Retry');
});

test('deferred artwork waits for the startup art, then downloads without blocking play', () => {
  const c = assets();
  const status = { textContent: '' };
  const elements = {
    'artwork-loading': { hidden: true }, 'artwork-status': status, 'artwork-retry': { hidden: true },
  };
  c.document = { getElementById: (id) => elements[id] };
  c.keys = {};
  c.pointer = { down: false };
  c.resetTouchInput = () => {};
  const boss = c.loadDeferredAsset('boss.png');
  const floor = c.loadAsset('floor.png');
  assert.equal(boss.url, undefined, 'the deferred download has not started');
  assert.equal(c.updateArtworkLoading(), true);
  assert.equal(status.textContent, 'Loading artwork: 0 / 1', 'the counter leaves deferred art out');
  floor.onload();
  assert.equal(c.updateArtworkLoading(), false, 'startup does not wait for deferred art');
  assert.equal(boss.url, 'graphics/boss.png', 'the queue starts once the startup art is in');
  assert.equal(c.artwork.pending.size, 0);
  assert.equal(c.loadDeferredAsset('boss.png'), boss, 'a deferred image is shared like any other');
});

test('the game loop does not advance combat while artwork is pending or the tab is hidden', () => {
  for (const visibilityState of ['visible', 'hidden']) {
    const calls = [];
    const c = vm.createContext({
      lastTime: 0, document: { visibilityState },
      updateArtworkLoading: () => true,
      requestAnimationFrame: () => calls.push('scheduled'),
      updateQuality: () => assert.fail('quality must not sample a loading frame'),
      update: () => assert.fail('combat must not advance'),
      draw: () => assert.fail('placeholder frame must not be drawn'),
    });
    loadFunctions(c, 'game.js', ['loop']);
    c.loop(16);
    assert.deepEqual(calls, ['scheduled']);
    assert.equal(c.lastTime, 16);
  }
});

test('breakable tinting is baked once per image, frame and type without pixel readback', () => {
  const draws = [];
  const c = vm.createContext({
    document: { createElement: () => ({ getContext: () => ({
      drawImage: (...args) => draws.push(args),
    }) }) },
  });
  loadFunctions(c, 'gameui.js', ['getBreakableFrame']);
  const sprite = { image: { naturalWidth: 128 }, frameWidth: 32, frameHeight: 32 };
  const first = c.getBreakableFrame(sprite, 5, 'solid');
  assert.equal(c.getBreakableFrame(sprite, 5, 'solid'), first);
  assert.equal(draws.length, 1);
  assert.deepEqual(draws[0].slice(1), [32, 32, 32, 32, 0, 0, 32, 32]);
  assert.notEqual(c.getBreakableFrame(sprite, 5, 'bomb-only'), first);
  assert.notEqual(c.getBreakableFrame(sprite, 6, 'solid'), first);
  assert.equal(draws.length, 3);
});
