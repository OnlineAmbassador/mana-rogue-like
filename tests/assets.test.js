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
    // The root is either an identifier or a quoted path, e.g. loadAsset('wall.png', 'assets/som/graphics').
    for (const match of text.matchAll(/load(?:Dyed|Deferred)?Asset\('([^']+)'(?:,\s*(?:\[[^\]]*\]|'([^']+)'|([A-Za-z.]+)))*\)/g)) {
      found.push({ file: name, value: match[1], root: match[2] || match[3] || null });
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

test('every catalogue icon path in uniqueItemIconPaths exists on disk', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const block = game.match(/const uniqueItemIconPaths = \{([\s\S]*?)\n\};/)[1];
  const missing = [];
  for (const match of block.matchAll(/'[^']+':\s*'([^']+)'|[a-z-]+:\s*'([^']+)'/g)) {
    const value = match[1] || match[2];
    const folder = value.startsWith('generic/') ? 'items' : path.join('items', 'equipment');
    if (!fs.existsSync(path.join(GRAPHICS, folder, `${value}.png`))) missing.push(value);
  }
  assert.deepEqual(missing, []);
});

test('every new asset is credited in the docs', () => {
  const credits = fs.readFileSync(path.join(ROOT, 'docs', 'CREDITS.md'), 'utf8');
  const somCredits = fs.readFileSync(path.join(ROOT, 'assets', 'som', 'CREDITS.md'), 'utf8');
  for (const file of ['gemstone-a.png', 'crystal.png', 'ironore.png']) {
    assert.ok(credits.includes(`graphics/items/generic/${file}`), `${file} needs a credit line`);
    assert.ok(fs.existsSync(path.join(GRAPHICS, 'items', 'generic', file)), `${file} is missing`);
  }
  assert.ok(somCredits.includes('artis-market.png') && somCredits.includes('EJlol'));
  assert.ok(fs.existsSync(path.join(SOM_GRAPHICS, 'artis-market.png')));
});

test('every effect image is credited with its source path', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const block = game.match(/const effectArt = \{([\s\S]*?)\n\};/)[1];
  const credits = fs.readFileSync(path.join(ROOT, 'docs', 'CREDITS.md'), 'utf8');
  const somCredits = fs.readFileSync(path.join(ROOT, 'assets', 'som', 'CREDITS.md'), 'utf8');
  const missing = [];
  for (const [, file, root] of block.matchAll(/load(?:Deferred)?Asset\('([^']+)'(?:, '([^']+)')?\)/g)) {
    // The TMW credit list names several runestones on one line, so match each file by its own name.
    const credited = root ? somCredits.includes(`graphics/${file}`)
      : credits.includes(`graphics/${file}`) || credits.includes(`\`${path.basename(file)}\``);
    if (!credited) missing.push(file);
  }
  assert.deepEqual(missing, []);
});

test('the PNG optimiser keeps every decoded pixel of real game art', () => {
  const zlib = require('node:zlib');
  const { decode, optimize } = require('../tools/optimize-pngs');
  // Re-encode real art as plain RGBA with no compression, so the optimiser always has work to do.
  const crc = (buffer) => {
    let value = ~0;
    for (const byte of buffer) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    return ~value >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const plain = ({ width, height, pixels }) => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const rows = [];
    for (let y = 0; y < height; y += 1) rows.push(Buffer.from([0]), pixels.subarray(y * width * 4, (y + 1) * width * 4));
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
      chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
  };
  // A small palette sheet, a soft shadow and a soft glow cover the colour types the tool chooses between.
  for (const file of ['particles/sparkles.png', 'sprites/monsters/accessories/mediumcircleshadow.png', 'particles/glow-medium.png']) {
    const image = decode(fs.readFileSync(path.join(GRAPHICS, file)));
    const loose = plain(image);
    const result = optimize(loose);
    assert.ok(result && result.length < loose.length, `${file} gets smaller`);
    assert.ok(decode(result).pixels.equals(image.pixels), `${file} pixels changed`);
  }
});
