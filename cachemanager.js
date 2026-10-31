let gameAssetVersions = null;

function validateAssetManifest(manifest) {
  if (!manifest || manifest.version !== 1 || !manifest.files || typeof manifest.files !== 'object' ||
      Array.isArray(manifest.files)) throw new Error('Invalid game file manifest.');
  for (const [file, entry] of Object.entries(manifest.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(file) || file.startsWith('/') || file.split('/').includes('..') ||
        !entry || !Number.isSafeInteger(entry.size) || entry.size < 0 ||
        typeof entry.hash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.hash)) {
      throw new Error(`Invalid game file metadata: ${file}`);
    }
  }
  for (const file of ['style.css', 'gameui.js', 'desertart.js', 'shopart.js', 'mobmanager.js', 'playermanager.js',
    'dbmanager.js', 'worldmanager.js', 'controllermanager.js', 'game.js']) {
    if (!manifest.files[file]) throw new Error(`Missing game file metadata: ${file}`);
  }
  return manifest.files;
}

function versionedAssetUrl(file) {
  if (!gameAssetVersions) return file;
  const entry = gameAssetVersions[file];
  if (!entry) throw new Error(`Missing game file metadata: ${file}`);
  return `${file}?v=${entry.hash}-${entry.size}`;
}

async function readAssetManifest() {
  if (location.protocol === 'file:') {
    console.warn('Automatic cache updates require an HTTP server; local files use their current contents.');
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('asset-manifest.json', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Game update check failed: HTTP ${response.status}`);
    return validateAssetManifest(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function loadGameFile(file, stylesheet = false) {
  return new Promise((resolve, reject) => {
    const element = document.createElement(stylesheet ? 'link' : 'script');
    element.onload = resolve;
    element.onerror = () => reject(new Error(`Could not load game file: ${file}`));
    if (stylesheet) {
      element.rel = 'stylesheet';
      element.href = versionedAssetUrl(file);
    } else {
      element.src = versionedAssetUrl(file);
      element.async = false;
    }
    document.head.appendChild(element);
  });
}

async function startCachedGame() {
  try {
    gameAssetVersions = await readAssetManifest();
    await loadGameFile('style.css', true);
    // Classic managers must execute in order before game state starts.
    for (const file of ['gameui.js', 'desertart.js', 'shopart.js', 'mobmanager.js', 'playermanager.js',
      'dbmanager.js', 'worldmanager.js', 'controllermanager.js', 'game.js']) {
      await loadGameFile(file);
    }
  } catch (error) {
    console.error('Could not start the current game version.', error);
    document.getElementById('artwork-status').textContent =
      'Could not check or load the current game files. Check your connection and retry.';
    const retry = document.getElementById('artwork-retry');
    retry.textContent = 'Retry game loading';
    retry.hidden = false;
    retry.onclick = () => location.reload();
  }
}

startCachedGame();
