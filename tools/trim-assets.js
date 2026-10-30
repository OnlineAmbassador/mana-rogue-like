#!/usr/bin/env node
// Lists, and with --apply deletes, the files under assets/tmw/clientdata that the game never references.
//
//   node tools/trim-assets.js           dry run: print what is kept and removed
//   node tools/trim-assets.js --apply   delete the unreferenced files
//
// A file under graphics/ or sfx/ is kept when a string literal in a root script names it (with or without
// its extension) or when it matches one of the template-built paths in DYNAMIC_PREFIXES. The TMX maps cited
// by README.md and the tests are kept together with the tilesets they load. License files are always kept.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'assets', 'tmw', 'clientdata');
const KEEP_ROOT_FILES = new Set([
  'ART_LICENSE', 'CC BY 4.0', 'CC BY-SA 3.0', 'COPYING', 'GPL', 'LICENSE', 'MIT', 'README.md',
  'license-missing', 'license.md',
]);
// Template literals whose variable part comes from a table of literal ids: the id is matched after the prefix.
const DYNAMIC_PREFIXES = [
  { root: 'graphics', prefix: 'items/equipment/' },
  { root: 'graphics', prefix: 'items/' },
  { root: 'graphics', prefix: 'sprites/equipment/head/' },
];
// Template literals the script knows how to handle; any other `${` path passed to a loader is reported.
const KNOWN_DYNAMIC = [/^items\//, /^sprites\/equipment\/head\//, /^som:/, /^assets\/audio\//];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function scriptStrings() {
  const strings = new Set();
  const dynamic = new Set();
  const files = fs.readdirSync(ROOT).filter((name) => name.endsWith('.js'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const match of text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      const value = match[1] ?? match[2] ?? match[3];
      if (value === undefined || value.length < 2) continue;
      if (match[3] !== undefined && value.includes('${')) {
        dynamic.add(value);
        for (const part of value.split(/\$\{[^}]*\}/)) if (part.length > 1) strings.add(part);
      } else {
        strings.add(value);
      }
    }
  }
  return { strings, dynamic };
}

function stripExtension(rel) {
  return rel.replace(/\.[^./]+$/, '');
}

// Maps cited in README.md or the tests, with the tileset files and images they pull in.
function documentedMapFiles() {
  const cited = new Set();
  const sources = ['README.md', ...fs.readdirSync(path.join(ROOT, 'tests')).filter((n) => n.endsWith('.js')).map((n) => `tests/${n}`)];
  for (const source of sources) {
    const text = fs.readFileSync(path.join(ROOT, source), 'utf8');
    for (const match of text.matchAll(/maps\/([A-Za-z0-9_.-]+\.tmx)/g)) cited.add(path.join(DATA, 'maps', match[1]));
    if (/clientdata', 'maps', file/.test(text)) {
      for (const match of text.matchAll(/mapPatch\('([^']+\.tmx)'/g)) cited.add(path.join(DATA, 'maps', match[1]));
    }
  }
  const keep = new Set();
  const visit = (file) => {
    if (keep.has(file) || !fs.existsSync(file)) return;
    keep.add(file);
    const text = fs.readFileSync(file, 'utf8');
    // Follow tileset files only. The tests read a map's tileset names as text and never open the images, so an
    // image is kept only when a script references it.
    for (const match of text.matchAll(/\bsource="([^"]+\.(?:tsx|tmx))"/g)) visit(path.resolve(path.dirname(file), match[1]));
  };
  for (const file of cited) visit(file);
  return keep;
}

function main() {
  const apply = process.argv.includes('--apply');
  const { strings, dynamic } = scriptStrings();
  const unknown = [...dynamic].filter((value) => !KNOWN_DYNAMIC.some((pattern) => pattern.test(value)) && /\.(png|ogg|jpg)/.test(value));
  if (unknown.length) {
    console.error('Unhandled template paths; extend KNOWN_DYNAMIC/DYNAMIC_PREFIXES before trimming:');
    for (const value of unknown) console.error(`  ${value}`);
    process.exit(1);
  }
  const mapFiles = documentedMapFiles();

  const keep = new Set();
  for (const file of walk(DATA)) {
    const rel = path.relative(DATA, file).split(path.sep).join('/');
    const [top, ...rest] = rel.split('/');
    const inner = rest.join('/');
    if (rest.length === 0) {
      if (KEEP_ROOT_FILES.has(top)) keep.add(file);
    } else if (top === 'graphics' || top === 'sfx') {
      const candidates = [inner, stripExtension(inner)];
      for (const dyn of DYNAMIC_PREFIXES) {
        if (dyn.root === top && inner.startsWith(dyn.prefix)) candidates.push(stripExtension(inner.slice(dyn.prefix.length)));
      }
      if (candidates.some((candidate) => strings.has(candidate))) keep.add(file);
    }
    if (mapFiles.has(file)) keep.add(file);
  }

  const all = walk(DATA);
  let keptBytes = 0;
  let removedBytes = 0;
  const removed = [];
  for (const file of all) {
    const size = fs.statSync(file).size;
    if (keep.has(file)) keptBytes += size;
    else {
      removedBytes += size;
      removed.push(file);
    }
  }
  const mb = (bytes) => (bytes / 1048576).toFixed(1);
  console.log(`keep ${keep.size} files (${mb(keptBytes)} MB), remove ${removed.length} files (${mb(removedBytes)} MB)`);
  if (!apply) {
    if (process.argv.includes('--list')) for (const file of removed) console.log(`  remove ${path.relative(DATA, file)}`);
    console.log('Dry run. Pass --apply to delete, --list to print every removed file.');
    return;
  }
  for (const file of removed) fs.rmSync(file);
  // Drop directories left empty by the deletions.
  const prune = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) prune(path.join(dir, entry.name));
    if (dir !== DATA && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  };
  prune(DATA);
  console.log('Trim applied.');
}

main();
