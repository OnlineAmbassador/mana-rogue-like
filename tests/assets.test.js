const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GRAPHICS = path.join(ROOT, 'assets', 'tmw', 'clientdata', 'graphics');
const SFX = path.join(ROOT, 'assets', 'tmw', 'clientdata', 'sfx');
const SOM_SOUNDS = path.join(ROOT, 'assets', 'som', 'sounds');
const SOM_GRAPHICS = path.join(ROOT, 'assets', 'som', 'graphics');

const scripts = fs.readdirSync(ROOT).filter((name) => name.endsWith('.js'));
const sources = scripts.map((name) => ({ name, text: fs.readFileSync(path.join(ROOT, name), 'utf8') }));

function literalCalls(pattern) {
  const found = [];
  for (const { name, text } of sources) {
    for (const match of text.matchAll(pattern)) found.push({ file: name, value: match[1] });
  }
  return found;
}

// The root passed as a second argument decides where a loadAsset path lives; calls without one use graphics/.
function loadAssetCalls() {
  const found = [];
  for (const { name, text } of sources) {
    for (const match of text.matchAll(/loadAsset\('([^']+)'(?:,\s*([A-Za-z.]+))?\)/g)) {
      found.push({ file: name, value: match[1], root: match[2] || null });
    }
  }
  return found;
}

test('every literal graphics path passed to loadAsset exists on disk', () => {
  const calls = loadAssetCalls();
  assert.ok(calls.length > 50, 'expected to find the loadAsset calls');
  const missing = [];
  for (const { file, value, root } of calls) {
    const base = root && /som/i.test(root) ? SOM_GRAPHICS : GRAPHICS;
    if (!fs.existsSync(path.join(base, value))) missing.push(`${file}: ${value}`);
  }
  assert.deepEqual(missing, []);
});

test('every literal sound path passed to playSound exists on disk', () => {
  const calls = literalCalls(/playSound\('([^']+)'/g);
  assert.ok(calls.length > 20, 'expected to find the playSound calls');
  const missing = [];
  for (const { file, value } of calls) {
    const full = value.startsWith('som:') ? path.join(SOM_SOUNDS, value.slice(4)) : path.join(SFX, value);
    if (!fs.existsSync(full)) missing.push(`${file}: ${value}`);
  }
  assert.deepEqual(missing, []);
});

test('the preloaded common sound effects exist', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const block = game.match(/const commonSoundEffects = \[([\s\S]*?)\];/);
  assert.ok(block, 'commonSoundEffects must be declared');
  const paths = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(paths.length > 0);
  for (const value of paths) {
    const full = value.startsWith('som:') ? path.join(SOM_SOUNDS, value.slice(4)) : path.join(SFX, value);
    assert.ok(fs.existsSync(full), `${value} must exist`);
  }
});

test('the retained TMW client data keeps its license records', () => {
  const data = path.join(ROOT, 'assets', 'tmw', 'clientdata');
  for (const name of ['LICENSE', 'license.md', 'COPYING', 'ART_LICENSE', 'CC BY-SA 3.0']) {
    assert.ok(fs.existsSync(path.join(data, name)), `${name} must be kept`);
  }
});
