#!/usr/bin/env node
// Losslessly recompresses the PNGs under assets/ (docs/ASSETS.md, rule 4): every decoded pixel stays identical.
//
//   node tools/optimize-pngs.js           dry run: print what each file would save
//   node tools/optimize-pngs.js --apply   rewrite files that get smaller
//   node tools/optimize-pngs.js --out dir write the smaller files to a mirror of assets/ under dir instead
//
// For each image it tries every colour type that holds the exact pixels (palette with the smallest bit depth,
// grey, grey + alpha, RGB, RGBA), five fixed filters plus a per-row adaptive choice, and several zlib settings,
// keeps the smallest result, then decodes it again and compares every RGBA value with the original before
// writing. Colour-management chunks (gAMA, cHRM, sRGB, iCCP) are kept as they are, so browsers show the same
// colours; text, time, background and resolution chunks are dropped. 16-bit images are left alone.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const KEEP_CHUNKS = new Set(['gAMA', 'cHRM', 'sRGB', 'iCCP']);
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

// Decodes any 8-bit or lower PNG (all colour types, interlaced or not) to RGBA.
function decode(buffer) {
  const chunks = readChunks(buffer);
  const header = chunks.find((chunk) => chunk.type === 'IHDR').data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colorType = header[9];
  const interlaced = header[12] === 1;
  if (depth === 16) return { width, height, depth, chunks, pixels: null };
  const palette = chunks.find((chunk) => chunk.type === 'PLTE')?.data;
  const transparency = chunks.find((chunk) => chunk.type === 'tRNS')?.data;
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const pixels = Buffer.alloc(width * height * 4);
  const passes = interlaced
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
    : [[0, 0, 1, 1]];
  const maxValue = (1 << depth) - 1;
  let offset = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const passWidth = Math.ceil((width - x0) / dx);
    const passHeight = Math.ceil((height - y0) / dy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    const stride = Math.ceil((passWidth * channels * depth) / 8);
    const bpp = Math.max(1, (channels * depth) / 8);
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < passHeight; y += 1) {
      const filter = raw[offset];
      const line = Buffer.from(raw.subarray(offset + 1, offset + 1 + stride));
      offset += 1 + stride;
      unfilter(line, previous, filter, bpp);
      previous = line;
      for (let x = 0; x < passWidth; x += 1) {
        const sample = (channel) => {
          if (depth === 8) return line[x * channels + channel];
          const bit = (x * channels + channel) * depth;
          return (line[bit >> 3] >> (8 - depth - (bit & 7))) & maxValue;
        };
        let r; let g; let b; let a = 255;
        if (colorType === 3) {
          const index = sample(0);
          [r, g, b] = [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
          if (transparency && index < transparency.length) a = transparency[index];
        } else if (colorType === 0 || colorType === 4) {
          const raw0 = sample(0);
          r = g = b = depth === 8 ? raw0 : Math.round((raw0 * 255) / maxValue);
          if (colorType === 4) a = sample(1);
          else if (transparency && raw0 === transparency.readUInt16BE(0)) a = 0;
        } else {
          [r, g, b] = [sample(0), sample(1), sample(2)];
          if (colorType === 6) a = sample(3);
          else if (transparency && r === transparency.readUInt16BE(0) && g === transparency.readUInt16BE(2) &&
            b === transparency.readUInt16BE(4)) a = 0;
        }
        const target = ((y0 + y * dy) * width + x0 + x * dx) * 4;
        pixels[target] = r;
        pixels[target + 1] = g;
        pixels[target + 2] = b;
        pixels[target + 3] = a;
      }
    }
  }
  return { width, height, depth, chunks, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(line, previous, filter, bpp) {
  for (let i = 0; i < line.length; i += 1) {
    const a = i >= bpp ? line[i - bpp] : 0;
    const b = previous[i];
    const c = i >= bpp ? previous[i - bpp] : 0;
    const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
    line[i] = (line[i] + predictor) & 255;
  }
}

function filterLine(line, previous, filter, bpp) {
  const out = Buffer.alloc(line.length);
  for (let i = 0; i < line.length; i += 1) {
    const a = i >= bpp ? line[i - bpp] : 0;
    const b = previous[i];
    const c = i >= bpp ? previous[i - bpp] : 0;
    out[i] = (line[i] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]) & 255;
  }
  return out;
}

// The encodings that hold these exact pixels, each as { colorType, depth, rows (unfiltered), bpp, extra chunks }.
function candidates({ width, height, pixels }) {
  const count = width * height;
  let grey = true;
  let opaque = true;
  const colors = new Map();
  for (let i = 0; i < count; i += 1) {
    const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
    if (r !== g || g !== b) grey = false;
    if (a !== 255) opaque = false;
    if (colors.size <= 256) {
      const key = pixels.readUInt32BE(i * 4);
      colors.set(key, (colors.get(key) || 0) + 1);
    }
  }
  const pack = (bytesPerPixel, write) => {
    const rows = [];
    for (let y = 0; y < height; y += 1) {
      const row = Buffer.alloc(width * bytesPerPixel);
      for (let x = 0; x < width; x += 1) write(row, x, (y * width + x) * 4);
      rows.push(row);
    }
    return rows;
  };
  const list = [];
  if (colors.size <= 256) {
    // Opaque-alpha entries go last so tRNS can stop at the last translucent one.
    const entries = [...colors.entries()].sort((first, second) => {
      const alpha = (key) => key & 255;
      return (alpha(first[0]) === 255) - (alpha(second[0]) === 255) || second[1] - first[1];
    });
    const index = new Map(entries.map(([key], position) => [key, position]));
    const depth = colors.size <= 2 ? 1 : colors.size <= 4 ? 2 : colors.size <= 16 ? 4 : 8;
    const perByte = 8 / depth;
    const rows = [];
    for (let y = 0; y < height; y += 1) {
      const row = Buffer.alloc(Math.ceil(width / perByte));
      for (let x = 0; x < width; x += 1) {
        const value = index.get(pixels.readUInt32BE((y * width + x) * 4));
        row[Math.floor(x / perByte)] |= value << (8 - depth * (1 + (x % perByte)));
      }
      rows.push(row);
    }
    const palette = Buffer.alloc(entries.length * 3);
    entries.forEach(([key], position) => palette.writeUIntBE(key >>> 8, position * 3, 3));
    const translucent = entries.filter(([key]) => (key & 255) !== 255).length;
    const extra = [{ type: 'PLTE', data: palette }];
    if (translucent) extra.push({ type: 'tRNS', data: Buffer.from(entries.slice(0, translucent).map(([key]) => key & 255)) });
    list.push({ colorType: 3, depth, rows, bpp: 1, extra });
  }
  if (grey && opaque) list.push({ colorType: 0, depth: 8, rows: pack(1, (row, x, i) => { row[x] = pixels[i]; }), bpp: 1, extra: [] });
  if (grey) list.push({ colorType: 4, depth: 8, rows: pack(2, (row, x, i) => { row[x * 2] = pixels[i]; row[x * 2 + 1] = pixels[i + 3]; }), bpp: 2, extra: [] });
  if (opaque) list.push({ colorType: 2, depth: 8, rows: pack(3, (row, x, i) => pixels.copy(row, x * 3, i, i + 3)), bpp: 3, extra: [] });
  list.push({ colorType: 6, depth: 8, rows: pack(4, (row, x, i) => pixels.copy(row, x * 4, i, i + 4)), bpp: 4, extra: [] });
  return list;
}

function compressed({ rows, bpp, colorType }) {
  let best = null;
  const strategies = colorType === 3 ? [0] : [0, 1, 2, 3, 4, 'adaptive'];
  for (const strategy of strategies) {
    const parts = [];
    let previous = Buffer.alloc(rows[0].length);
    for (const row of rows) {
      let filter = strategy;
      let filtered;
      if (strategy === 'adaptive') {
        let lowest = Infinity;
        for (let option = 0; option < 5; option += 1) {
          const attempt = filterLine(row, previous, option, bpp);
          const cost = attempt.reduce((sum, value) => sum + (value < 128 ? value : 256 - value), 0);
          if (cost < lowest) [lowest, filter, filtered] = [cost, option, attempt];
        }
      } else {
        filtered = filterLine(row, previous, filter, bpp);
      }
      parts.push(Buffer.from([filter]), filtered);
      previous = row;
    }
    const data = Buffer.concat(parts);
    for (const zlibStrategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED]) {
      const deflated = zlib.deflateSync(data, { level: 9, memLevel: 9, strategy: zlibStrategy });
      if (!best || deflated.length < best.length) best = deflated;
    }
  }
  return best;
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function optimize(buffer) {
  const image = decode(buffer);
  if (!image.pixels) return null;
  const kept = image.chunks.filter((entry) => KEEP_CHUNKS.has(entry.type));
  let best = buffer;
  for (const candidate of candidates(image)) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(image.width, 0);
    header.writeUInt32BE(image.height, 4);
    header[8] = candidate.depth;
    header[9] = candidate.colorType;
    const file = Buffer.concat([SIGNATURE, chunk('IHDR', header), ...kept.map((entry) => chunk(entry.type, entry.data)),
      ...candidate.extra.map((entry) => chunk(entry.type, entry.data)), chunk('IDAT', compressed(candidate)),
      chunk('IEND', Buffer.alloc(0))]);
    if (file.length < best.length) best = file;
  }
  if (best === buffer) return null;
  const check = decode(best);
  if (check.width !== image.width || check.height !== image.height || !check.pixels.equals(image.pixels)) {
    throw new Error('re-encoded pixels differ; file left unchanged');
  }
  return best;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.toLowerCase().endsWith('.png') ? [full] : [];
  });
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  // --out <dir> writes the smaller files to a mirror of assets/ instead, for checking them elsewhere first.
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex > 0 ? path.resolve(process.argv[outIndex + 1]) : null;
  let before = 0;
  let after = 0;
  let changed = 0;
  for (const file of walk(path.join(ROOT, 'assets'))) {
    const original = fs.readFileSync(file);
    before += original.length;
    let result = null;
    try {
      result = optimize(original);
    } catch (error) {
      console.error(`${path.relative(ROOT, file)}: ${error.message}`);
    }
    after += result ? result.length : original.length;
    if (!result) continue;
    changed += 1;
    if (out) {
      const target = path.join(out, path.relative(path.join(ROOT, 'assets'), file));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, result);
    } else if (apply) {
      fs.writeFileSync(file, result);
    }
  }
  console.log(`${changed} files smaller; ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB` +
    (apply ? ' (written)' : ' (dry run; pass --apply to write)'));
}

module.exports = { decode, optimize };
