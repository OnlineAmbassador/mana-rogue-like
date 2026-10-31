const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { generateAssetManifest } = require('../tools/generate-asset-manifest');
const { loadFunctions, loadBetween } = require('./helpers/load');

const root = path.join(__dirname, '..');

function cacheContext() {
  const requests = [];
  const elements = [];
  const errors = [];
  const status = { textContent: '' };
  const retry = { hidden: true };
  const manifest = generateAssetManifest(root);
  const c = vm.createContext({
    gameAssetVersions: null,
    location: { protocol: 'https:', reload: () => requests.push('reload') },
    AbortController, setTimeout, clearTimeout,
    console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => manifest };
    },
    document: {
      createElement: (tag) => ({ tag }),
      head: { appendChild: (element) => { elements.push(element); element.onload(); } },
      getElementById: (id) => id === 'artwork-status' ? status : retry,
    },
  });
  loadBetween(c, 'cachemanager.js', 'const GAME_SCRIPTS', 'function validateAssetManifest');
  loadFunctions(c, 'cachemanager.js', [
    'validateAssetManifest', 'versionedAssetUrl', 'readAssetManifest', 'loadGameFile', 'preloadGameFile', 'showStartupFailure',
    'startCachedGame',
  ]);
  return { c, requests, elements, errors, status, retry, manifest };
}

test('same-size content changes alter hashes; size changes also invalidate file URLs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-cache-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'assets'));
    const file = path.join(directory, 'game.js');
    fs.writeFileSync(file, 'one');
    const first = generateAssetManifest(directory).files['game.js'];
    fs.writeFileSync(file, 'two');
    const second = generateAssetManifest(directory).files['game.js'];
    assert.equal(first.size, second.size);
    assert.notEqual(first.hash, second.hash);
    const { c } = cacheContext();
    c.gameAssetVersions = { 'game.js': first };
    const url = c.versionedAssetUrl('game.js');
    c.gameAssetVersions = { 'game.js': second };
    assert.notEqual(c.versionedAssetUrl('game.js'), url);
    c.gameAssetVersions = { 'game.js': { ...first, size: first.size + 1 } };
    assert.notEqual(c.versionedAssetUrl('game.js'), url);
  } finally {
    fs.rmSync(path.join(directory, 'game.js'));
    fs.rmdirSync(path.join(directory, 'assets'));
    fs.rmdirSync(directory);
  }
});

test('startup checks fresh metadata once and loads versioned CSS and managers in order', async () => {
  const { c, requests, elements, errors, manifest } = cacheContext();
  await c.startCachedGame();
  assert.equal(requests.length, 1, 'do not redownload artwork merely to hash it on the phone');
  assert.equal(requests[0].url, 'asset-manifest.json');
  assert.equal(requests[0].options.cache, 'no-store');
  const scripts = vm.runInContext('GAME_SCRIPTS', c);
  const preloads = elements.filter((element) => element.rel === 'preload');
  const loads = elements.filter((element) => element.rel !== 'preload');
  assert.deepEqual(preloads.map((element) => element.href.split('?')[0]), [...scripts],
    'every script starts downloading before any runs');
  assert.deepEqual(loads.map((element) => (element.href || element.src).split('?')[0]), ['style.css', ...scripts]);
  const entry = manifest.files['game.js'];
  assert.equal(elements.at(-1).src, `game.js?v=${entry.hash}-${entry.size}`);
  assert.equal(errors.length, 0);
  assert.equal(c.versionedAssetUrl('game.js'), c.versionedAssetUrl('game.js'), 'unchanged files reuse their URL');
});

test('artwork deduplication, retries, and both sound roots use versioned URLs', () => {
  const { c, manifest } = cacheContext();
  c.gameAssetVersions = manifest.files;
  c.artwork = { images: new Map(), pending: new Set(), failed: new Set() };
  c.Image = class { set src(value) { this.url = value; } };
  c.assetRoot = 'assets/tmw/clientdata/graphics';
  c.soundRoot = 'assets/tmw/clientdata/sfx';
  c.somSoundRoot = 'assets/som/sounds';
  loadFunctions(c, 'gameui.js', ['loadAsset', 'retryFailedArtwork', 'soundUrl']);
  const image = c.loadAsset('tilesets/castle1.png');
  assert.equal(c.loadAsset('tilesets/castle1.png'), image);
  assert.match(image.url, /castle1\.png\?v=[a-f0-9]{64}-\d+$/);
  c.artwork.failed.add(image.url);
  c.retryFailedArtwork();
  assert.ok(c.artwork.pending.has(image.url));
  assert.match(c.soundUrl('som:alteration/heal.ogg'), /heal\.ogg\?v=[a-f0-9]{64}-\d+$/);
  assert.match(c.soundUrl('system/click.ogg'), /click\.ogg\?v=[a-f0-9]{64}-\d+$/);
});

test('failed update checks block stale startup and offer retry without touching saves', async () => {
  const { c, elements, errors, status, retry, requests } = cacheContext();
  c.localStorage = new Proxy({}, { get: () => assert.fail('cache updates must not touch saves or settings') });
  c.fetch = async () => ({ ok: false, status: 503 });
  await c.startCachedGame();
  assert.equal(elements.length, 0);
  assert.equal(errors.length, 1);
  assert.match(status.textContent, /Could not check/);
  assert.equal(retry.hidden, false);
  retry.onclick();
  assert.deepEqual(requests, ['reload']);
});

test('script failures stop startup and offer a full reload rather than rerunning partial managers', async () => {
  const { c, elements, retry, errors, status } = cacheContext();
  c.document.head.appendChild = (element) => {
    elements.push(element);
    if (element.src?.startsWith('desertart.js')) element.onerror();
    else element.onload();
  };
  await c.startCachedGame();
  const loads = elements.filter((element) => element.rel !== 'preload');
  assert.equal(elements.length - loads.length, vm.runInContext('GAME_SCRIPTS.length', c), 'every script is preloaded up front');
  assert.equal(loads.length, 3, 'nothing runs after the failed script');
  assert.equal(errors.length, 1);
  assert.match(status.textContent, /Could not load a game file/);
  assert.equal(retry.hidden, false);
});

test('a missing manifest on plain static hosting runs the unversioned files', async () => {
  const { c, elements, errors } = cacheContext();
  c.fetch = async () => ({ ok: false, status: 404 });
  await c.startCachedGame();
  assert.equal(elements.at(-1).src, 'game.js');
  assert.match(errors[0][0], /No asset-manifest\.json/);
});

test('malformed or incomplete manifests are rejected explicitly', () => {
  const { c, manifest } = cacheContext();
  assert.throws(() => c.validateAssetManifest({ version: 2, files: {} }), /Invalid/);
  assert.throws(() => c.validateAssetManifest({ version: 1, files: {} }), /Missing/);
  for (const entry of [{ size: -1, hash: 'f'.repeat(64) }, { size: 1, hash: 'invalid' }]) {
    assert.throws(() => c.validateAssetManifest({ ...manifest, files: { ...manifest.files, 'game.js': entry } }), /Invalid/);
  }
});

test('an unlisted asset loads unversioned with a warning instead of stopping the game', () => {
  const { c, manifest, errors } = cacheContext();
  c.gameAssetVersions = manifest.files;
  assert.equal(c.versionedAssetUrl('missing.png'), 'missing.png');
  assert.match(errors[0][0], /No game file metadata for missing\.png/);
});

test('direct local-file play skips unsupported fetch with an explicit warning', async () => {
  const { c, requests, errors, elements } = cacheContext();
  c.location.protocol = 'file:';
  await c.startCachedGame();
  assert.equal(requests.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /require an HTTP server/);
  assert.equal(elements.at(-1).src, 'game.js');
});

test('the loader lists every root game script exactly once, and the manifest covers them', () => {
  const { c, manifest } = cacheContext();
  const roots = fs.readdirSync(root).filter((name) => name.endsWith('.js') && name !== 'cachemanager.js').sort();
  assert.deepEqual([...vm.runInContext('GAME_SCRIPTS', c)].sort(), roots, 'add new root scripts to GAME_SCRIPTS in cachemanager.js');
  for (const file of ['style.css', ...vm.runInContext('GAME_SCRIPTS', c)]) assert.ok(manifest.files[file], file);
  assert.equal(c.validateAssetManifest(manifest), manifest.files);
});

test('asset-manifest.json is generated, not committed', () => {
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^asset-manifest\.json$/m);
});
