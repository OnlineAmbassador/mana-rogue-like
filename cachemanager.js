let gameAssetVersions = null;

// Classic scripts in the order they must run; tests check this against the .js files in the project root.
const GAME_SCRIPTS = ['gameui.js', 'desertart.js', 'lightingmanager.js', 'shopart.js', 'effectart.js', 'mobmanager.js', 'playermanager.js',
  'dbmanager.js', 'worldmanager.js', 'controllermanager.js', 'game.js'];

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
  for (const file of ['style.css', ...GAME_SCRIPTS]) {
    if (!manifest.files[file]) throw new Error(`Missing game file metadata: ${file}`);
  }
  return manifest.files;
}

function versionedAssetUrl(file) {
  if (!gameAssetVersions) return file;
  const entry = gameAssetVersions[file];
  if (!entry) {
    // One unlisted artwork or sound file should not stop the game; it just loads without a version.
    console.warn(`No game file metadata for ${file}; loading it unversioned.`);
    return file;
  }
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
    if (response.status === 404) {
      // Plain static hosting without the generator step: run with the files as served.
      console.warn('No asset-manifest.json found; run tools/generate-asset-manifest.js to enable automatic cache updates.');
      return null;
    }
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

function showStartupFailure(message, error) {
  console.error('Could not start the current game version.', error);
  document.getElementById('artwork-status').textContent = message;
  const retry = document.getElementById('artwork-retry');
  retry.textContent = 'Retry game loading';
  retry.hidden = false;
  retry.onclick = () => location.reload();
}

async function startCachedGame() {
  try {
    gameAssetVersions = await readAssetManifest();
  } catch (error) {
    showStartupFailure('Could not check for updated game files. Check your connection and retry.', error);
    return;
  }
  try {
    await loadGameFile('style.css', true);
    // Classic managers must execute in order before game state starts.
    for (const file of GAME_SCRIPTS) await loadGameFile(file);
  } catch (error) {
    showStartupFailure('Could not load a game file. Retrying reloads the whole page.', error);
  }
}

startCachedGame();
