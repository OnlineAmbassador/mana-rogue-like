const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function generateAssetManifest(root) {
  const files = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.(png|ogg)$/i.test(entry.name)) add(absolute);
    }
  }
  function add(absolute) {
    const data = fs.readFileSync(absolute);
    files[path.relative(root, absolute).split(path.sep).join('/')] = {
      size: data.length,
      hash: createHash('sha256').update(data).digest('hex'),
    };
  }
  for (const name of fs.readdirSync(root).sort()) {
    if (/\.(js|css|html)$/.test(name)) add(path.join(root, name));
  }
  visit(path.join(root, 'assets'));
  return { version: 1, files };
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const manifest = generateAssetManifest(root);
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated hashes and sizes for ${Object.keys(manifest.files).length} runtime files.`);
}

module.exports = { generateAssetManifest };
