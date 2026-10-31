const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const stageEl = document.getElementById('stage');

// All drawing uses this fixed logical view; it is scaled to the window when drawn.
const VIEW_W = 960;

const VIEW_H = 540;

// Backing pixels per logical pixel are capped so very large screens don't redraw a huge bitmap.
const MAX_RENDER_SCALE = 3;

let renderScale = 1;

let pixelRatioQuery = null;

// Auto quality: when frames run slow, glow (shadowBlur) is switched off and particles are capped.
const quality = { low: false, avgMs: 16.7, slowFor: 0, fastFor: 0 };
const nativeShadowBlur = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
// shadowBlur is measured in backing pixels and ignores the transform, so it is scaled here.
Object.defineProperty(ctx, 'shadowBlur', {
  get() { return nativeShadowBlur.get.call(this) / renderScale; },
  set(value) { nativeShadowBlur.set.call(this, quality.low ? 0 : value * renderScale); },
});
const MAX_PARTICLES = 400;
const MAX_PARTICLES_LOW = 120;

function updateQuality(dtSeconds) {
  quality.avgMs += (dtSeconds * 1000 - quality.avgMs) * 0.08;
  if (quality.avgMs > 26) {
    quality.slowFor += dtSeconds;
    quality.fastFor = 0;
  } else if (quality.avgMs < 19) {
    quality.fastFor += dtSeconds;
    quality.slowFor = 0;
  }
  if (!quality.low && quality.slowFor > 2) {
    quality.low = true;
    resizeCanvas();
  } else if (quality.low && quality.fastFor > 10) {
    quality.low = false;
    quality.slowFor = 0;
    resizeCanvas();
  }
}
// Shows the view as the largest 16:9 box that fits the stage, drawn at device resolution
// (or at its CSS size in low quality). The backing store itself is resized in applyRenderScale.
function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const frame = canvas.offsetWidth - canvas.clientWidth;
  if (document.body.classList.contains('mobile-layout')) {
    // The mobile layout sizes the canvas in CSS; only the drawing resolution follows it here.
    canvas.style.width = '';
    canvas.style.height = '';
    document.documentElement.style.removeProperty('--stage-w');
    const cssWidth = canvas.clientWidth;
    if (cssWidth > 0) {
      renderScale = quality.low ? cssWidth / VIEW_W : Math.min(cssWidth * ratio / VIEW_W, MAX_RENDER_SCALE);
    }
  } else {
    const availableWidth = stageEl.clientWidth - frame;
    const availableHeight = stageEl.clientHeight - frame;
    if (availableWidth > 0 && availableHeight > 0) {
      const cssWidth = Math.floor(Math.min(availableWidth, availableHeight * VIEW_W / VIEW_H));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${Math.round(cssWidth * VIEW_H / VIEW_W)}px`;
      document.documentElement.style.setProperty('--stage-w', `${cssWidth + frame}px`);
      renderScale = quality.low ? cssWidth / VIEW_W : Math.min(cssWidth * ratio / VIEW_W, MAX_RENDER_SCALE);
    }
  }
  // Moving the window to a screen with a different pixel ratio doesn't resize the stage.
  if (!pixelRatioQuery || !pixelRatioQuery.matches) {
    pixelRatioQuery?.removeEventListener('change', resizeCanvas);
    pixelRatioQuery = window.matchMedia(`(resolution: ${ratio}dppx)`);
    pixelRatioQuery.addEventListener('change', resizeCanvas);
  }
}

// Runs at the start of every frame, so a resize never shows a cleared canvas.
function applyRenderScale() {
  const width = Math.round(VIEW_W * renderScale);
  const height = Math.round(VIEW_H * renderScale);
  if (canvas.width !== width || canvas.height !== height) {
    // Resizing the backing store clears it and resets the context state.
    canvas.width = width;
    canvas.height = height;
  }
  // Pixel-art sprites are drawn enlarged; nearest-neighbour keeps them sharp.
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
}

// The canvas is observed too: in the mobile layout its CSS size changes without the stage resizing.
const canvasResizeObserver = new ResizeObserver(resizeCanvas);
canvasResizeObserver.observe(stageEl);
canvasResizeObserver.observe(canvas);

resizeCanvas();

const statsEl = document.getElementById('stats');
const messageEl = document.getElementById('message');
const controlsEl = document.getElementById('controls');
const hudEl = document.querySelector('.hud');

// Rooms vary in size; wide and tall rooms keep the same area as large ones.
const ROOM_SIZES = {
  small: { w: 960, h: 540 },
  large: { w: 1504, h: 804 },
  wide: { w: 2000, h: 720 },
  tall: { w: 1000, h: 1440 },
};
const bossPhaseAttackSets = {
  jacko: [
    ['roll', 'jump', 'shot'],
    ['roll', 'jump', 'shot', 'ground-pound'],
    ['ground-pound', 'roll', 'shot', 'jump', 'ground-pound'],
  ],
  'spider-queen': [
    ['pounce', 'web'],
    ['web', 'pounce', 'pounce'],
    ['web', 'pounce', 'web', 'pounce'],
  ],
  golem: [
    ['slam', 'bomb', 'ring', 'charge'],
    ['charge', 'slam', 'bomb', 'ring'],
    ['ring', 'charge', 'slam', 'bomb', 'charge'],
  ],
  bosspinkie: [
    ['pinkie-leap', 'arrow-barrage'],
    ['pinkie-leap', 'fire-bottle', 'arrow-wheel'],
    ['blink-strike', 'pinkie-leap', 'arrow-wheel', 'fire-bottle'],
  ],
  scorpion: [
    ['venom-fan', 'venom-charge'],
    ['venom-bomb', 'venom-fan', 'gas-cloud'],
    ['gas-cloud', 'venom-charge', 'venom-bomb', 'venom-fan'],
  ],
  bandit: [
    ['arrow-barrage', 'hook-pull'],
    ['fire-bottle', 'arrow-wheel', 'arrow-barrage'],
    ['bandit-charge', 'hook-pull', 'arrow-wheel', 'fire-bottle'],
  ],
  mouboo: [
    ['reaper-charge', 'reaper-fan'],
    ['blink-strike', 'reaper-bomb', 'reaper-charge'],
    ['reaper-fan', 'reaper-charge', 'blink-strike', 'gas-cloud'],
  ],
  spider: [
    ['web-burst', 'spider-pounce'],
    ['web-snare', 'spider-pounce', 'web-burst'],
    ['spider-pounce', 'blink-strike', 'web-snare', 'web-burst'],
  ],
  bluepar: [
    ['arrow-barrage', 'arrow-wheel'],
    ['hook-pull', 'arrow-barrage', 'fire-bottle'],
    ['arrow-wheel', 'bandit-charge', 'arrow-barrage', 'hook-pull'],
  ],
  skeleton: [
    ['bone-bomb', 'grave-summon'],
    ['blink-strike', 'bone-bomb', 'grave-summon'],
    ['grave-summon', 'bone-bomb', 'reaper-fan', 'blink-strike'],
  ],
  zombie: [
    ['grave-summon', 'reaper-charge'],
    ['bone-bomb', 'gas-cloud', 'grave-summon'],
    ['reaper-charge', 'blink-strike', 'bone-bomb', 'grave-summon'],
  ],
  'spore-sower': [
    ['spore-burst', 'gas-cloud'],
    ['spore-bomb', 'spore-burst', 'fire-bottle'],
    ['gas-cloud', 'spore-bomb', 'spore-burst', 'blink-strike'],
  ],
  junglefowl: [
    ['pinkie-leap', 'fire-bottle'],
    ['bandit-charge', 'pinkie-leap', 'arrow-barrage'],
    ['fire-bottle', 'blink-strike', 'pinkie-leap', 'bandit-charge'],
  ],
  snowman: [
    ['ice-burst', 'ice-shot'],
    ['wind-gust', 'snow-charge', 'water-splash'],
    ['water-splash', 'ice-burst', 'snow-charge', 'wind-gust'],
  ],
  yeti: [
    ['yeti-slam', 'yeti-charge'],
    ['wind-gust', 'ice-burst', 'yeti-slam'],
    ['yeti-charge', 'water-splash', 'yeti-slam', 'ice-burst'],
  ],
  vampirebat: [
    ['void-cross', 'blink-strike'],
    ['void-laser', 'void-cross', 'lightning-strike'],
    ['blink-strike', 'void-charge', 'void-laser', 'void-cross'],
  ],
  frostiana: [
    ['ice-shot', 'ice-burst'],
    ['water-splash', 'snow-charge', 'wind-gust'],
    ['ice-burst', 'wind-gust', 'ice-shot', 'water-splash'],
  ],
  troll: [
    ['yeti-slam', 'rock-fall'],
    ['yeti-charge', 'wind-gust', 'yeti-slam'],
    ['rock-fall', 'yeti-charge', 'yeti-slam', 'wind-gust'],
  ],
  croc: [
    ['reaper-charge', 'venom-fan'],
    ['venom-charge', 'reaper-bomb', 'gas-cloud'],
    ['blink-strike', 'venom-fan', 'venom-charge', 'reaper-charge'],
  ],
  'slime-mother': [
    ['slime-trail', 'slime-shot', 'slime-crash'],
    ['slime-crash', 'slime-charge', 'slime-trail', 'spore-bomb'],
    ['slime-charge', 'slime-crash', 'slime-shot', 'spore-bomb', 'slime-trail'],
  ],
  reaper: [
    ['reaper-charge', 'reaper-fan', 'blink-strike'],
    ['gas-cloud', 'reaper-bomb', 'reaper-fan', 'reaper-charge'],
    ['blink-strike', 'reaper-charge', 'reaper-bomb', 'reaper-fan', 'gas-cloud'],
  ],
  serqet: [
    ['venom-fan', 'venom-charge', 'gas-cloud'],
    ['venom-bomb', 'venom-fan', 'venom-charge', 'gas-cloud'],
    ['venom-charge', 'venom-bomb', 'venom-fan', 'gas-cloud', 'venom-charge'],
  ],
  banditlord: [
    ['arrow-barrage', 'hook-pull', 'bandit-charge'],
    ['fire-bottle', 'arrow-wheel', 'hook-pull', 'arrow-barrage'],
    ['bandit-charge', 'hook-pull', 'arrow-wheel', 'fire-bottle', 'arrow-barrage'],
  ],
  'snowman-boss': [
    ['ice-burst', 'ice-shot', 'wind-gust'],
    ['snow-charge', 'water-splash', 'ice-burst', 'wind-gust'],
    ['water-splash', 'snow-charge', 'ice-shot', 'ice-burst', 'wind-gust'],
  ],
  yetiking: [
    ['yeti-slam', 'yeti-charge', 'wind-gust'],
    ['ice-burst', 'water-splash', 'yeti-charge', 'yeti-slam'],
    ['wind-gust', 'yeti-charge', 'ice-burst', 'yeti-slam', 'water-splash'],
  ],
  forestdragon: [
    ['forest-breath', 'forest-charge', 'forest-summon'],
    ['fire-breath', 'spore-bomb', 'wind-gust', 'forest-summon'],
    ['forest-charge', 'fire-breath', 'forest-breath', 'spore-bomb', 'forest-summon'],
  ],
  nightdragon: [
    ['void-cross', 'void-charge', 'lightning-strike'],
    ['void-laser', 'blink-strike', 'wind-gust', 'void-cross'],
    ['lightning-strike', 'void-charge', 'void-laser', 'blink-strike', 'void-cross'],
  ],
};
let ROOM_W = ROOM_SIZES.large.w;
let ROOM_H = ROOM_SIZES.large.h;
const camera = { x: 0, y: 0 };
const ROOM_WALL_THICKNESS = 64;
const DOORWAY_HALF_WIDTH = 64;
const PLAYER_VISUAL_HALF_WIDTH = 24;
const PLAYER_VISUAL_HEIGHT = 80;
const WALL_COLLISION_PADDING = 8;
const PROFILE_STORAGE_KEY = 'mana-hollow-sanctum-save';
const BANK_STORAGE_KEY = 'mana-hollow-sanctum-bank';
const RUN_STORAGE_KEY = 'mana-hollow-sanctum-run';
const assetRoot = 'assets/tmw/clientdata/graphics';
const soundRoot = 'assets/tmw/clientdata/sfx';
// Paths prefixed with 'som:' load from the Source of Mana sound set instead.
const somSoundRoot = 'assets/som/sounds';

const soundPools = new Map();
// Decoded sound effects keyed by path; 'loading' and 'failed' mark in-flight and unusable entries.
const soundBuffers = new Map();
// Cues played in nearly every run, decoded as soon as audio is unlocked.
const commonSoundEffects = [
  'weapons/axe/hit.ogg', 'weapons/barehands/hit1.ogg', 'weapons/bow/shoot.ogg', 'system/click.ogg',
  'system/boom.ogg', 'system/item.ogg', 'system/warp.ogg', 'punch.ogg',
  'som:alteration/quest-update.ogg', 'som:alteration/levelup.ogg', 'som:alteration/skillup.ogg',
];
const gameMusic = {
  enabled: true,
  context: null,
  gain: null,
  timer: null,
  starting: false,
  step: 0,
  nextBeat: 0,
};
const SETTINGS_STORAGE_KEY = 'mana-hollow-sanctum-settings';
const gameSettings = (() => {
  // adaptiveEnemies: enemies adapt to the active input method and use dash-check pulses (see docs/BALANCE.md).
  const defaults = { adaptiveEnemies: true };
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    return {
      adaptiveEnemies: typeof stored.adaptiveEnemies === 'boolean' ? stored.adaptiveEnemies : defaults.adaptiveEnemies,
    };
  } catch (error) {
    return defaults;
  }
})();
const AUDIO_STORAGE_KEY = 'mana-hollow-sanctum-audio';
const audioSettings = (() => {
  // volume = music, sfxVolume = shots/monsters, tts = null until the player is asked.
  const defaults = { volume: 0.7, sfxVolume: 0.8, tts: null };
  try {
    const stored = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) || '{}');
    const clamp01 = (value, fallback) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);
    return {
      volume: clamp01(stored.volume, defaults.volume),
      sfxVolume: stored.sfx === false && !Number.isFinite(stored.sfxVolume) ? 0 : clamp01(stored.sfxVolume, defaults.sfxVolume),
      tts: typeof stored.tts === 'boolean' ? stored.tts : null,
    };
  } catch (error) {
    return defaults;
  }
})();
let audioSliderDragging = null;
// Controller focus inside the audio panel: null | 'music' | 'sfx' | 'tts'.
let audioFocus = null;
let audioAdjustRepeatAt = 0;
const AUDIO_FOCUS_ORDER = ['music', 'sfx', 'tts'];









// Sliders are thin, so the clickable area also covers the label above and a little padding.


// Returns true when the click was consumed by the audio panel.


// D-pad/stick vertical step through the audio panel for screens without their own focus list
// (pause, prologue). Up from "nothing" enters at the bottom (TTS); down past TTS leaves the panel.

// Left/right on a focused slider adjusts it (with hold-to-repeat); confirm toggles TTS.
// Returns true when the input was consumed by the audio panel.
handleAudioPanelPad.previousHorizontal = 0;




const musicMelody = [57, 60, 64, 60, 55, 60, 64, 60, 57, 60, 65, 62, 55, 59, 62, 59];
const musicChords = [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]];
// Voice narration is off until the recordings are redone to match the current text.
const NARRATION_ENABLED = false;

const prologueNarrations = NARRATION_ENABLED ? [1, 2, 3].map((segment) => {
  const audio = new Audio(`assets/audio/prologue-0${segment}.ogg`);
  audio.preload = 'auto';
  audio.volume = 0.76;
  return audio;
}) : [];
// Narration speaks only when it is enabled in code and the player turned read-aloud on.
function narrationActive() {
  return NARRATION_ENABLED && audioSettings.tts === true;
}

let activePrologueNarration = -1;
let prologueNarrationNeedsGesture = true;
let activePrologueSpeech = null;
let prologueSpeechFallbackActive = false;
const campaignRegionIds = [
  'tulimshar', 'hurnscald', 'graveyard', 'artis', 'halinarzo', 'nivalis', 'frostia', 'candor', 'worldedge',
];
let mapOrder = [];
const directions = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'right', dx: 1, dy: 0 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
];
const oppositeDirection = { up: 'down', right: 'left', down: 'up', left: 'right' };






let narratorVoiceCache = null;

// Voices load asynchronously; picking once (and waiting for the list) keeps the speech fallback on one voice.





const heartImage =  loadAsset('items/equipment/charms/heartofisis.png');
const stoneImage = loadAsset('items/equipment/ammo/roundstone.png');
const eliteHatImage = loadAsset('items/equipment/head/wizardhat.png');
const linkedShieldImage = loadAsset('items/equipment/shields/steelshield.png');
const luckCharmImage = loadAsset('items/equipment/charms/fourleafclover.png');
const orbitGuardIcons = {
  arrow: loadAsset('items/equipment/ammo/arrow.png'),
  sword: loadAsset('items/equipment/weapons/sword.png'),
  mana: loadAsset('items/equipment/charms/spectralorb.png'),
};
const shopItemIconImages = {
  'frost-rune': loadAsset('items/generic/snowflake.png'),
  'spore-bloom': loadAsset('items/generic/mushroomspores.png'),
  'bonded-aegis': linkedShieldImage,
  'luck-up-i': luckCharmImage,
  'luck-up-ii': luckCharmImage,
  'heart-vessel-i': heartImage,
  'heart-vessel-ii': heartImage,
  'heart-vessel-iii': heartImage,
  'shop-heart': heartImage,
  'orbiting-projectiles': loadAsset('items/equipment/charms/spectralorb.png'),
  'element-fire': loadAsset('items/equipment/charms/firescroll.png'),
  'element-lightning': loadAsset('items/equipment/weapons/scepter.png'),
  'element-gas': loadAsset('items/generic/darkdesertmushroom.png'),
  'ammo-mana': loadAsset('items/equipment/charms/spectralorb.png'),
  'ammo-arrows': loadAsset('items/equipment/ammo/arrow.png'),
  'ammo-blows': loadAsset('items/equipment/ammo/arrow.png'),
  'curio-hot-take': loadAsset('items/equipment/weapons/kanabo.png'),
  'curio-sole': loadAsset('items/equipment/charms/heartofisis.png'),
  'curio-trigger': loadAsset('items/equipment/weapons/kunai.png'),
  'curio-heavy-metal': loadAsset('items/equipment/weapons/kanabo.png'),
  'curio-mana-cafe': loadAsset('items/equipment/charms/spectralorb.png'),
  'curio-dice': loadAsset('items/equipment/charms/astralcube.png'),
  'curio-wild-card': loadAsset('items/equipment/charms/firescroll.png'),
  'mod-windup': loadAsset('items/equipment/weapons/kanabo.png'),
  'mod-flurry': loadAsset('items/equipment/weapons/kunai.png'),
  'mod-cinder': loadAsset('items/equipment/charms/firescroll.png'),
  'mod-pierce': loadAsset('items/equipment/ammo/ironarrow.png'),
  'mod-draw': loadAsset('items/equipment/ammo/ironarrow.png'),
  'mod-quiver': loadAsset('items/equipment/ammo/arrow.png'),
  'mod-storm-arrows': loadAsset('items/equipment/ammo/tolchiarrow.png'),
  'mod-splash': loadAsset('items/equipment/charms/astralcube.png'),
  'mod-chain': loadAsset('items/equipment/weapons/legendwand.png'),
  'mod-lingering': loadAsset('items/equipment/charms/spectralorb.png'),
};
// One distinct client-data icon per catalogue entry (overrides the shared ones above).
const uniqueItemIconPaths = {
  pearl: 'generic/silvereasteregg', prism: 'generic/gempowder', feather: 'generic/butterfly',
  'heart-vessel-i': 'charms/heartofisis', 'heart-vessel-ii': 'generic/diseasedheart', 'heart-vessel-iii': 'generic/bloodstone',
  'luck-up-i': 'charms/fourleafclover', 'luck-up-ii': 'generic/brokenfourleafamulet',
  'range-lens': 'generic/flawedlens', 'range-lens-ii': 'generic/silvermirror', 'range-lens-iii': 'charms/treasuremap',
  'frost-rune': 'generic/snowflake', 'spore-bloom': 'generic/mushroomspores', 'bonded-aegis': 'shields/steelshield',
  'wild-magic-core': 'weapons/legendwand', 'iron-ore': 'generic/ironore',
  'element-fire': 'charms/firescroll', 'element-lightning': 'weapons/scepter', 'element-gas': 'generic/darkdesertmushroom',
  'iron-sword': 'weapons/sword', 'swift-daggers': 'weapons/dagger',
  'ammo-mana': 'charms/spectralorb', 'ammo-arrows': 'ammo/arrow', 'ammo-blows': 'generic/ironingot',
  'curio-hot-take': 'weapons/kanabo', 'curio-sole': 'charms/redstocking', 'curio-trigger': 'weapons/kunai',
  'curio-heavy-metal': 'weapons/blacksmithsaxe', 'curio-mana-cafe': 'generic/emptybottle',
  'curio-sweat': 'charms/oldtowel', 'curio-brain': 'generic/brain', 'curio-quiver-me': 'ammo/cursedarrow',
  'curio-shake': 'generic/mysteriousbottle', 'curio-mana-lisa': 'generic/spellbookpage',
  'curio-dice': 'charms/astralcube', 'curio-wild-card': 'generic/casinocoins', 'curio-run-on': 'generic/scroll',
  'mod-windup': 'weapons/halberd', 'mod-flurry': 'weapons/whip', 'mod-cinder': 'generic/coal',
  'mod-pierce': 'ammo/ironarrow', 'mod-draw': 'weapons/championshipbow', 'mod-quiver': 'ammo/trainingarrow',
  'mod-storm-arrows': 'ammo/tolchiarrow', 'mod-splash': 'ammo/mortararrow', 'mod-chain': 'weapons/legendwand',
  'mod-lingering': 'charms/snowmanglobe',
  'silk-shorts': 'legs/silkpants', 'leather-legguards': 'legs/chaps', 'leather-vest': 'chest/leathershirt',
  'ratto-companion': 'generic/rattotail', 'croc-companion': 'generic/crocclaw', 'wisp-companion': 'generic/ectoplasm',
  'jacko-companion': 'generic/jackolantern', 'bosspinkie-companion': 'generic/pinkantenna', 'bat-companion': 'generic/batwing',
  'bluepar-companion': 'generic/tentacles', 'frog-companion': 'generic/tongue', 'mouboo-companion': 'charms/plushmouboo',
  'skeleton-companion': 'generic/skull', 'slime-companion': 'generic/maggotslime', 'snake-companion': 'generic/hardspike',
  'spider-companion': 'generic/silkcocoon', 'spider-queen-companion': 'generic/crystallizedmaggot',
  'golem-companion': 'generic/ore', 'slime-mother-companion': 'generic/wumpus-egg', 'reaper-companion': 'weapons/scythe',
  'serqet-companion': 'generic/deserttablet', 'banditlord-companion': 'generic/bandithood', 'snowman-boss-companion': 'charms/santaglobe',
  'yetiking-companion': 'generic/frozenyetitear', 'forestdragon-companion': 'generic/dragonscales', 'nightdragon-companion': 'charms/dragonstar',
  'snowman-companion': 'generic/icecube', 'yeti-companion': 'generic/yeticlaw', 'vampirebat-companion': 'generic/vampirebatwing',
  'frostiana-companion': 'generic/icebottle', 'troll-companion': 'generic/warpedlog', 'junglefowl-companion': 'generic/halfeggshell',
  'fluffy-companion': 'generic/whitefur', 'snail-companion': 'generic/tortugashell', 'scorpion-companion': 'generic/squichyclaws',
  'bee-companion': 'generic/bentneedle', 'bandit-companion': 'generic/lockpicks', 'zombie-companion': 'generic/zombieear',
  'spore-sower-companion': 'generic/grassseeds',
  'mana-tonic': 'generic/fluopowder', 'bomb-bundle': 'generic/powder', 'mana-burst': 'generic/elemental',
};
for (const [id, path] of Object.entries(uniqueItemIconPaths)) {
  shopItemIconImages[id] = loadAsset(`items/${path.startsWith('generic/') ? '' : 'equipment/'}${path}.png`);
}
// Dye values come from the TMW item XML: Lifestone (item 730) and Dark Crystal (item 631).
shopItemIconImages.lifestone = loadDyedAsset('items/generic/gemstone-a.png', ['#a0a010', '#ffffa0']);
shopItemIconImages['dark-crystal'] = loadDyedAsset('items/generic/crystal.png',
  ['#252e6a', '#923eda', '#ba72ec', '#ffffff']);
const sacredRoomTiles = loadAsset('tilesets/desert_castle_interior.png');
const castleWallTiles = loadAsset('tilesets/desert_castle.png');
const sandstoneWallTiles = loadAsset('wall.png', 'assets/som/graphics');
const desertObstacleTiles = loadAsset('tilesets/desert1.png');
const desertGroundTiles = loadAsset('tilesets/desert2.png');
const desertSandstormImage = loadAsset('images/ambient/sandstorm.png');
const soulMenhirImage = loadAsset('soulmenhir.png', 'assets/som/graphics');
const sandFootprintImage = loadAsset('tilesets/footprints.png');
const sandFootprints = { room: null, marks: [], x: 0, y: 0, distance: 0 };
const sacredRoomFloorTileIds = [65, 49, 81];
const terrainTiles = {
  tulimshar: { image: desertGroundTiles, tileIds: [136, 137, 138, 139] },
  hurnscald: { image: loadAsset('tilesets/woodland_ground.png'), tileIds: [32] },
  graveyard: { image: loadAsset('tilesets/woodland_graveyard_ground.png'), tilePattern: [[36, 20], [6, 37]] },
  artis: { image: loadAsset('tilesets/evol/artis-pavement.png'), tilePattern: [[113, 114], [113, 114]] },
  halinarzo: { image: loadAsset('tilesets/savannah.png'), tileIds: [241] },
  nivalis: { image: loadAsset('tilesets/snow.png'), tileIds: [83] },
  frostia: { image: loadAsset('tilesets/icecave.png'), tileIds: [4] },
  candor: { image: loadAsset('tilesets/cave2.png'), tileIds: [4] },
  worldedge: { image: loadAsset('tilesets/stoneground.png'), tilePattern: [[32, 33], [47, 48]] },
};
const terrainBackgroundCache = new Map();
const humanoidSprites = {
  male: { image: loadAsset('sprites/races/human-male.png'), framesPerDirection: 16 },
  female: { image: loadAsset('sprites/races/human-female.png'), framesPerDirection: 16 },
  neutral: { image: loadAsset('sprites/races/human-male-medium.png'), framesPerDirection: 16 },
  elf: { image: loadAsset('sprites/races/elven-male.png'), framesPerDirection: 16 },
  elfFemale: { image: loadAsset('sprites/races/elven-female.png'), framesPerDirection: 16 },
  orc: { image: loadAsset('sprites/races/orc-male.png'), framesPerDirection: 16 },
  tritan: { image: loadAsset('sprites/races/tritan-male.png'), framesPerDirection: 16 },
  raijin: { image: loadAsset('sprites/races/raijin-female.png'), framesPerDirection: 16 },
};
const headSprites = {
  wanderer: { image: loadAsset('sprites/hairstyles/hairstyle01.png'), frameWidth: 40, frameHeight: 50 },
  arcanist: { image: loadAsset('sprites/hairstyles/hairstyle20.png'), frameWidth: 40, frameHeight: 50 },
  warden: { image: loadAsset('sprites/hairstyles/hairstyle02.png'), frameWidth: 40, frameHeight: 50 },
  keeper: { image: loadAsset('sprites/hairstyles/hairstyle03.png'), frameWidth: 40, frameHeight: 50 },
  candor: { image: loadAsset('sprites/hairstyles/hairstyle04.png'), frameWidth: 40, frameHeight: 50 },
  pilgrim: { image: loadAsset('sprites/hairstyles/hairstyle05.png'), frameWidth: 40, frameHeight: 50 },
  herbalist: { image: loadAsset('sprites/hairstyles/hairstyle06.png'), frameWidth: 40, frameHeight: 50 },
  ironbound: { image: loadAsset('sprites/hairstyles/hairstyle07.png'), frameWidth: 40, frameHeight: 50 },
  archivist: { image: loadAsset('sprites/hairstyles/hairstyle08.png'), frameWidth: 40, frameHeight: 50 },
  quill: { image: loadAsset('sprites/hairstyles/hairstyle09.png'), frameWidth: 40, frameHeight: 50 },
};
const clothingSprites = {
  silkShorts: {
    image: loadAsset('sprites/equipment/legs/shorts-male.png'),
    femaleImage: loadAsset('sprites/equipment/legs/shorts-female.png'),
    frameWidth: 64, frameHeight: 64,
  },
  leatherLegguards: {
    image: loadAsset('sprites/equipment/legs/assassinpants-male.png'),
    femaleImage: loadAsset('sprites/equipment/legs/assassinpants-female.png'),
    frameWidth: 64, frameHeight: 64,
  },
  leatherVest: {
    image: loadAsset('sprites/equipment/chest/leathershirt-male.png'),
    femaleImage: loadAsset('sprites/equipment/chest/leathershirt-female.png'),
    frameWidth: 64, frameHeight: 64,
  },
  ironSword: { image: loadAsset('sprites/equipment/weapons/sword-iron.png'), frameWidth: 64, frameHeight: 64 },
  daggers: { image: loadAsset('sprites/equipment/weapons/knife.png'), frameWidth: 64, frameHeight: 64 },
};
const monsterSprites = {
  piou: { image: loadAsset('sprites/monsters/piou.png'), frameWidth: 10, frameHeight: 9, scale: 3.2, frames: [0, 1, 2, 3] },
  maggot: { image: loadAsset('sprites/monsters/maggot.png'), frameWidth: 20, frameHeight: 15, scale: 1.5, frames: [0, 10, 20, 30] },
  tortuga: { image: loadAsset('sprites/monsters/tortuga.png'), frameWidth: 32, frameHeight: 32, scale: 1.15, frames: [32, 33, 34, 35] },
  ratto: { image: loadAsset('sprites/monsters/ratto.png'), frameWidth: 32, frameHeight: 32, scale: 1.35, frames: [22, 23, 24, 21] },
  croc: { image: loadAsset('sprites/monsters/croc.png'), frameWidth: 30, frameHeight: 22, scale: 1.65, frames: [1, 0, 2, 0] },
  wisp: { image: loadAsset('sprites/monsters/wisp.png'), frameWidth: 64, frameHeight: 64, scale: 1.1, frames: [0, 1, 2, 3, 4] },
  jacko: { image: loadAsset('sprites/monsters/jacko.png'), frameWidth: 60, frameHeight: 60, scale: 2, frames: [0, 1, 2, 12, 13, 14] },
  bosspinkie: { image: loadAsset('sprites/monsters/bosspinkie.png'), frameWidth: 50, frameHeight: 42, scale: 1.45, frames: [0, 10, 20, 30] },
  bat: { image: loadAsset('sprites/monsters/bat.png'), frameWidth: 37, frameHeight: 58, scale: 1.05, frames: [1, 2, 3, 4] },
  bluepar: { image: loadAsset('sprites/monsters/bluepar.png'), frameWidth: 50, frameHeight: 42, scale: 1.1, frames: [1, 2, 3, 4] },
  frog: { image: loadAsset('sprites/monsters/frog-small.png'), frameWidth: 32, frameHeight: 32, scale: 1.35, frames: [0, 1, 2, 3] },
  mouboo: { image: loadAsset('sprites/monsters/mouboo.png'), frameWidth: 80, frameHeight: 80, scale: 0.82, frames: [1, 2, 3, 4, 5, 6] },
  skeleton: { image: loadAsset('sprites/monsters/skeleton.png'), frameWidth: 64, frameHeight: 64, scale: 1, frames: [1, 2, 3, 4, 5, 6] },
  slime: { image: loadAsset('sprites/monsters/slime.png'), frameWidth: 52, frameHeight: 24, scale: 1.25, frames: [0, 1, 2, 3] },
  snake: { image: loadAsset('sprites/monsters/snake.png'), frameWidth: 48, frameHeight: 29, scale: 1.2, frames: [1, 2, 3, 4] },
  spider: { image: loadAsset('sprites/monsters/spider.png'), frameWidth: 35, frameHeight: 35, scale: 1.25, frames: [0, 2, 7, 9] },
  'spider-queen': { image: loadAsset('sprites/monsters/spider-queen.png'), frameWidth: 96, frameHeight: 96, scale: 1.05 },
  golem: { image: loadAsset('sprites/monsters/golem.png'), frameWidth: 128, frameHeight: 128, scale: 0.9 },
  'slime-mother': { image: loadAsset('sprites/monsters/slime-mother.png'), frameWidth: 64, frameHeight: 64, scale: 1.2, frames: [0, 18, 36, 54] },
  reaper: { image: loadAsset('sprites/monsters/reaper.png'), frameWidth: 100, frameHeight: 100, scale: 0.85, frames: [25, 29, 19, 23] },
  serqet: { image: loadAsset('sprites/monsters/serqet.png'), frameWidth: 60, frameHeight: 47, scale: 1.5, frames: [22, 11, 33, 0] },
  banditlord: { image: loadAsset('sprites/monsters/banditlord.png'), frameWidth: 64, frameHeight: 64, scale: 1.05, frames: [0, 18, 36, 54] },
  'snowman-boss': { image: loadAsset('sprites/monsters/snowman-boss.png'), frameWidth: 128, frameHeight: 128, scale: 0.72, frames: [0, 1, 2, 3, 4, 5, 6, 7] },
  yetiking: { image: loadAsset('sprites/monsters/yetiking.png'), frameWidth: 160, frameHeight: 160, scale: 0.55, frames: [3, 20, 31, 20] },
  forestdragon: { image: loadAsset('sprites/monsters/forestdragon.png'), frameWidth: 256, frameHeight: 128, scale: 0.45, frames: [0, 8, 16, 24] },
  nightdragon: { image: loadAsset('sprites/monsters/nightdragon.png'), frameWidth: 256, frameHeight: 128, scale: 0.45, frames: [0, 8, 16, 24] },
  snowman: { image: loadAsset('sprites/monsters/snowman.png'), frameWidth: 128, frameHeight: 128, scale: 0.55, frames: [0, 1, 2, 3, 4, 5, 6, 7] },
  yeti: { image: loadAsset('sprites/monsters/yeti.png'), frameWidth: 80, frameHeight: 80, scale: 0.9, frames: [3, 4, 5, 6] },
  vampirebat: { image: loadAsset('sprites/monsters/vampirebat.png'), frameWidth: 37, frameHeight: 58, scale: 1, frames: [1, 2, 3, 4] },
  frostiana: { image: loadAsset('sprites/monsters/frostiana.png'), frameWidth: 32, frameHeight: 32, scale: 1.4, frames: [4, 5, 6, 7] },
  troll: { image: loadAsset('sprites/monsters/troll.png'), frameWidth: 40, frameHeight: 40, scale: 1.3, frames: [0, 1, 2, 3, 4, 5] },
  junglefowl: { image: loadAsset('sprites/monsters/junglefowl.png'), frameWidth: 50, frameHeight: 50, scale: 1.1, frames: [0, 12, 24, 36] },
  fluffy: { image: loadAsset('sprites/monsters/fluffy.png'), frameWidth: 28, frameHeight: 32, scale: 1.35, frames: [0, 1, 2, 3] },
  snail: { image: loadAsset('sprites/monsters/snail.png'), frameWidth: 50, frameHeight: 50, scale: 0.95, frames: [0, 10, 20, 30] },
  scorpion: { image: loadAsset('sprites/monsters/scorpion.png'), frameWidth: 48, frameHeight: 45, scale: 1.15, frames: [1, 2, 3, 4] },
  bee: { image: loadAsset('sprites/monsters/bee.png'), frameWidth: 20, frameHeight: 19, scale: 1.8, frames: [8, 9, 10, 11] },
  bandit: { image: loadAsset('sprites/monsters/bandit.png'), frameWidth: 64, frameHeight: 64, scale: 1, frames: [1, 2, 3, 4, 5, 6] },
  zombie: { image: loadAsset('sprites/monsters/zombie.png'), frameWidth: 64, frameHeight: 64, scale: 0.95, frames: [1, 2, 3, 4, 5, 6] },
  'spore-sower': { image: loadAsset('sprites/monsters/mushroom-wicked.png'), frameWidth: 42, frameHeight: 40, scale: 1.25, frames: [0, 1, 2, 3] },
};
const banditBowImage = loadAsset('sprites/monsters/accessories/banditbow.png');
const obstacleSprites = [
  { image: loadAsset('sprites/monsters/loghead.png'), frameWidth: 45, frameHeight: 43, frames: [0], scale: 1.55, hp: 1, radius: 23, type: 'solid',
    sound: { hit: 'monsters/loghead/loghead-hurt1.ogg', break: 'monsters/loghead/loghead-die1.ogg' } },
  { image: loadAsset('sprites/monsters/redmushroom.png'), frameWidth: 42, frameHeight: 33, frames: [0, 10, 20, 30], scale: 1.55, hp: 2, radius: 18, type: 'bomb-only',
    sound: { hit: 'monsters/shroom/shroom-hurt1.ogg', break: 'monsters/shroom/shroom-die1.ogg' } },
  { image: loadAsset('sprites/monsters/forestmushroom.png'), frameWidth: 42, frameHeight: 40, frames: [0], scale: 1.35, hp: 3, radius: 15, type: 'regenerating', regenDelay: 4, regenCycles: 2, regenSteps: 3,
    sound: { hit: 'monsters/shroom/shroom-hurt1.ogg', break: 'monsters/shroom/shroom-die1.ogg' } },
  { image: desertObstacleTiles, frameWidth: 32, frameHeight: 32, frames: [27], scale: 1.6, hp: 2, radius: 18, type: 'bomb-only',
    sound: { hit: 'monsters/crocotree/hurt1.ogg', break: 'monsters/crocotree/die1.ogg' } },
  { image: loadAsset('sprites/monsters/plant.png'), frameWidth: 46, frameHeight: 42, frames: [0], scale: 1.3, hp: 3, radius: 18, type: 'regenerating', regenDelay: 4, regenCycles: 2, regenSteps: 3,
    sound: { hit: 'monsters/flower/flower-hit1.ogg', break: 'monsters/crocotree/die1.ogg' } },
];
// Obstacle sets follow the region's ground: desert cactus only in dry regions, plants in wooded ones.
const obstacleSpritesByRegion = {
  tulimshar: [obstacleSprites[1], obstacleSprites[2], obstacleSprites[3]],
  halinarzo: [obstacleSprites[0], obstacleSprites[2], obstacleSprites[3]],
  artis: [obstacleSprites[0], obstacleSprites[1], obstacleSprites[3]],
  hurnscald: [obstacleSprites[0], obstacleSprites[2], obstacleSprites[4]],
  candor: [obstacleSprites[0], obstacleSprites[2], obstacleSprites[4]],
  graveyard: [obstacleSprites[0], obstacleSprites[1], obstacleSprites[4]],
  nivalis: [obstacleSprites[0], obstacleSprites[1], obstacleSprites[4]],
  frostia: [obstacleSprites[0], obstacleSprites[1], obstacleSprites[4]],
  worldedge: [obstacleSprites[0], obstacleSprites[1], obstacleSprites[4]],
};

function regionObstacleSprites() {
  return obstacleSpritesByRegion[currentRegionId()] || obstacleSpritesByRegion.tulimshar;
}

const correctedHumanoidFrames = new WeakMap();
const correctedHeadFrames = new WeakMap();
let pixelCorrectionWarningShown = false;
const bossCompanionKinds = new Set([
  'jacko', 'spider-queen', 'golem', 'slime-mother', 'reaper', 'serqet', 'banditlord',
  'snowman-boss', 'yetiking', 'forestdragon', 'nightdragon',
]);
const MIN_ABILITY_COST = 3;
const shopItemCatalog = [
  { id: 'pearl', name: 'Mana Pearl', description: 'Larger, stronger tears', cost: 7, kind: 'passive' },
  { id: 'prism', name: 'Prism Shard', description: 'Fire a three-way burst', cost: 8, kind: 'passive' },
  { id: 'feather', name: 'Swift Feather', description: 'Fire tears faster', cost: 8, kind: 'passive' },
  { id: 'heart-vessel-i', name: 'Heart Vessel I', description: 'Gain one heart for this descent', cost: 8, kind: 'passive' },
  { id: 'heart-vessel-ii', name: 'Heart Vessel II', description: 'Gain one heart for this descent', cost: 11, kind: 'passive' },
  { id: 'heart-vessel-iii', name: 'Heart Vessel III', description: 'Gain one heart for this descent', cost: 14, kind: 'passive' },
  { id: 'lifestone', name: 'Lifestone', description: 'A boss drop: gain one heart container (below five extra hearts) and recover three hearts over 18 seconds', cost: 0, kind: 'boss-relic' },
  { id: 'luck-up-i', name: 'Luck Up I', description: 'Zeny can overflow a map’s budget more often', cost: 6, kind: 'passive' },
  { id: 'luck-up-ii', name: 'Luck Up II', description: 'Even better odds of a zeny windfall', cost: 9, kind: 'passive' },
  { id: 'range-lens', name: 'Far-Reach Lens I', description: 'Projectiles travel 35% farther; melee reach +10%', cost: 8, kind: 'passive' },
  { id: 'range-lens-ii', name: 'Far-Reach Lens II', description: 'Another 35% projectile range; melee reach +10%', cost: 11, kind: 'passive' },
  { id: 'range-lens-iii', name: 'Far-Reach Lens III', description: 'Maximum range and melee reach +10%; shots pierce solid barriers', cost: 14, kind: 'passive' },
  { id: 'frost-rune', name: 'Frost Rune', description: 'Auto-elemental: freezes nearby foes, slows bosses', cost: 9, kind: 'ability' },
  { id: 'orbiting-projectiles', name: 'Betsanc', description: 'Unlock orbiting weapon familiars; room clears charge the meter', cost: 10, kind: 'ability' },
  { id: 'spore-bloom', name: 'Spore Bloom', description: 'Magic shots split into slowing spores on impact; unlocks Sporeling', cost: 10, kind: 'ability', unlockAfterEnemyAbility: 'spore-burst' },
  { id: 'wild-magic-core', name: 'Wild Magic Core', description: 'Wild magic: lightning jumps to four foes, decay lasts four seconds, explosions reach farther', cost: 9, kind: 'passive', style: 'magic' },
  { id: 'bonded-aegis', name: 'Bonded Aegis', description: 'Block three hits with a TMW steel shield', cost: 11, kind: 'ability', unlockAfterEnemyAbility: 'twin-shield' },
  { id: 'element-fire', name: 'Ember Sigil', description: 'Fire attacks ignite gas clouds', cost: 7, kind: 'element', style: 'magic', element: 'fire', unlockAtSeconds: 300, unlockAfterEnemyAbility: 'fire-burst' },
  { id: 'element-lightning', name: 'Storm Sigil', description: 'Lightning chains through wet foes', cost: 7, kind: 'element', style: 'magic', element: 'lightning', unlockAtSeconds: 900, unlockAfterEnemyAbility: 'lightning-shot' },
  { id: 'element-gas', name: 'Miasma Sigil', description: 'Miasma attacks leave a harmful cloud', cost: 7, kind: 'element', style: 'magic', element: 'gas', unlockAtSeconds: 1800, unlockAfterEnemyAbility: 'spore-burst' },
  { id: 'iron-sword', name: 'Iron Sword', description: 'A longer, heavier melee strike', cost: 8, kind: 'weapon', style: 'melee', weapon: 'sword' },
  { id: 'swift-daggers', name: 'Swift Daggers', description: 'Quick, close twin strikes', cost: 7, kind: 'weapon', style: 'melee', weapon: 'daggers' },
  { id: 'curio-hot-take', name: 'Hot Take', description: 'Big attack up', cost: 8, kind: 'curio', quip: 'HOT TAKE! Your hits sting.', effects: { damage: 1.5 } },
  { id: 'curio-sole', name: 'Sole Survivor', description: 'Speed up, attack down', cost: 5, kind: 'curio', quip: 'SOLE SURVIVOR! Fleet of foot, soft of fist.', effects: { speed: 1.2, damage: 0.85 } },
  { id: 'curio-trigger', name: 'Trigger Happy', description: 'Fire rate up, attack down', cost: 5, kind: 'curio', quip: 'TRIGGER HAPPY! More swings, fewer bruises.', effects: { fire: 1.4, damage: 0.85 } },
  { id: 'curio-heavy-metal', name: 'Heavy Metal', description: 'Big attack up, fire rate down', cost: 6, kind: 'curio', quip: 'HEAVY METAL! It rocks. It is also slow.', effects: { damage: 1.6, fire: 0.75 } },
  { id: 'curio-mana-cafe', name: 'Mana-Cafe Latte', description: 'Small speed and fire rate up', cost: 6, kind: 'curio', quip: 'MANA-CAFE LATTE! Jittery, but in a good way.', effects: { speed: 1.12, fire: 1.15 } },
  { id: 'curio-shake', name: 'Protein Shake-Down', description: 'Attack up', cost: 7, kind: 'curio', quip: 'PROTEIN SHAKE-DOWN! Gains everywhere.', effects: { damage: 1.25 } },
  { id: 'curio-mana-lisa', name: 'Mana Lisa', description: 'Fire rate up', cost: 4, kind: 'curio', quip: 'MANA LISA! That smile is just a spell.', effects: { fire: 1.2 } },
  { id: 'curio-run-on', name: 'Run-On Sentence', description: 'Big speed up, slightly less attack', cost: 6, kind: 'curio', quip: 'RUN-ON SENTENCE! Fast, but light on punctuation.', effects: { speed: 1.35, damage: 0.95 } },
  { id: 'curio-dice', name: 'Roll With It', description: 'A random status change in every room', cost: 5, kind: 'curio', quip: 'ROLL WITH IT! Every room is a new gamble.', chaos: 'room' },
  { id: 'curio-wild-card', name: 'Wild Card', description: 'A random status change every few seconds', cost: 5, kind: 'curio', quip: 'WILD CARD! Fortune changes by the minute.', chaos: 'timed' },
  { id: 'mod-windup', name: 'Wind-Up Wraps', description: 'Melee: switches to charge mode, which builds faster', cost: 7, kind: 'mod', style: 'melee' },
  { id: 'mod-flurry', name: 'Flurry Gauntlets', description: 'Melee: lightning-fast jabs, lighter hits', cost: 7, kind: 'mod', style: 'melee' },
  { id: 'mod-cinder', name: 'Cinder Edge', description: 'Melee: swings leave a wall of fire', cost: 8, kind: 'mod', style: 'melee', unlockAfterEnemyAbility: 'fire-burst' },
  { id: 'mod-pierce', name: 'Piercing Heads', description: 'Bow: arrows fly through foes', cost: 8, kind: 'mod', style: 'bow' },
  { id: 'mod-draw', name: 'Longbow Draw', description: 'Bow: switches to charge mode, which draws faster', cost: 7, kind: 'mod', style: 'bow' },
  { id: 'mod-quiver', name: 'Rapid Quiver', description: 'Bow: rapid mode fires faster, lighter arrows', cost: 7, kind: 'mod', style: 'bow', unlockAfterEnemyAbility: 'arrow-shot' },
  { id: 'mod-storm-arrows', name: 'Storm Fletching', description: 'Bow: arrows chain lightning between foes', cost: 9, kind: 'mod', style: 'bow', unlockAfterEnemyAbility: 'lightning-shot' },
  { id: 'mod-splash', name: 'Impact Core', description: 'Magic: shots burst on hit or on the ground', cost: 8, kind: 'mod', style: 'magic' },
  { id: 'mod-chain', name: 'Storm Conduit', description: 'Magic: shots chain lightning between foes', cost: 9, kind: 'mod', style: 'magic', unlockAfterEnemyAbility: 'lightning-shot' },
  { id: 'mod-lingering', name: 'Lingering Mana', description: 'Magic: shots leave a damaging cloud', cost: 8, kind: 'mod', style: 'magic', unlockAfterEnemyAbility: 'spore-burst' },
  { id: 'silk-shorts', name: 'Silk Shorts', description: 'Light legs increase movement speed', cost: 6, kind: 'clothing', slot: 'legs', sprite: 'silkShorts', speedBonus: 32, armorBonus: 0 },
  { id: 'leather-legguards', name: 'Leather Legguards', description: 'Heavy legs slow you down but absorb two hits', cost: 8, kind: 'clothing', slot: 'legs', sprite: 'leatherLegguards', speedBonus: -18, armorBonus: 2 },
  { id: 'leather-vest', name: 'Leather Vest', description: 'A sturdy vest that absorbs one hit', cost: 7, kind: 'clothing', slot: 'chest', sprite: 'leatherVest', speedBonus: 0, armorBonus: 1 },
  ...Object.keys(monsterSprites).map((kind) => {
    const name = monsterDisplayName(kind);
    return {
      id: `${kind}-companion`,
      name: `${name} Familiar`,
      description: `${/^[AEIOU]/.test(name) ? 'An' : 'A'} ${name} fights beside you`,
      cost: 12,
      kind: 'companion',
      companion: kind,
    };
  }),
  { id: 'mana-tonic', name: 'Mana Tonic', description: 'Restore two health with Q', cost: 4, kind: 'consumable' },
  { id: 'bomb-bundle', name: 'Bomb Bundle', description: 'Gain two bombs with Q', cost: 4, kind: 'consumable' },
  { id: 'mana-burst', name: 'Mana Burst', description: 'Blast all foes with Q (8 damage, plus 4 per later floor)', cost: 6, kind: 'consumable' },
];

const characterRoster = [
  { id: 'wanderer', name: 'Mage', className: 'Mage', startingStyle: 'magic', styleLabel: 'Magic tears', hairStyle: 'wanderer', raceHead: 'humanMale', sprite: 'male', color: '#75d8ff', hue: 0, speed: 235, hp: 6, damage: 1, fireDelay: 0.23, trait: 'Balanced delver', unlock: 'Available' },
  { id: 'warden', name: 'Rogue', className: 'Rogue', startingStyle: 'bow', styleLabel: 'Rapid light arrows', hairStyle: 'warden', raceHead: 'humanMale', sprite: 'neutral', color: '#fbd96f', hue: 205, speed: 250, hp: 4, damage: 1, fireDelay: 0.23, trait: 'Fast bow, lighter hits', unlock: 'Clear floor 1' },
  { id: 'arcanist', name: 'Warrior', className: 'Warrior', startingStyle: 'melee', styleLabel: 'Heavy sword', hairStyle: 'arcanist', raceHead: 'humanFemale', sprite: 'female', color: '#d7a8ff', hue: 95, speed: 210, hp: 4, damage: 1, fireDelay: 0.28, trait: 'Heavy sword, slow recovery', unlock: 'Clear floor 2' },
  { id: 'candor-runner', name: 'Candor Runner', className: 'Scout', startingStyle: 'bow', styleLabel: 'Quick arrows', hairStyle: 'candor', raceHead: 'humanFemale', sprite: 'female', color: '#f5b86c', hue: 25, speed: 285, hp: 4, damage: 1, fireDelay: 0.34, trait: 'Very fast, slow draw', unlock: 'Defeat the Pinkie Matriarch' },
  { id: 'world-edge-pilgrim', name: 'World Edge Pilgrim', className: 'Pilgrim', startingStyle: 'magic', styleLabel: 'Patient casting', hairStyle: 'pilgrim', raceHead: 'elfMale', sprite: 'elf', color: '#b9d9a0', hue: 35, speed: 210, hp: 8, damage: 1, fireDelay: 0.3, trait: 'Patient casting, slower pace', unlock: 'Find a secret room' },
  { id: 'hurnscald-herbalist', name: 'Hurnscald Herbalist', className: 'Herbalist', startingStyle: 'magic', styleLabel: 'Frost magic', hairStyle: 'herbalist', raceHead: 'elfFemale', sprite: 'elfFemale', color: '#86d69c', hue: 65, speed: 200, hp: 7, damage: 1, fireDelay: 0.27, startingAbility: 'frost-rune', trait: 'Starts with Frost Rune', unlock: 'Reach Hurnscald' },
  { id: 'mycelia-sporeling', name: 'Hurnscald Sporeling', className: 'Sporeling', startingStyle: 'magic', styleLabel: 'Spore magic', hairStyle: 'herbalist', hat: 'shroomhat', raceHead: 'elfFemale', sprite: 'elfFemale', color: '#d78be7', hue: 300, speed: 205, hp: 6, damage: 1, fireDelay: 0.27, trait: 'Slowing spore clusters, slow travel', unlock: 'Collect Spore Bloom' },
  { id: 'ironbound', name: 'Ironbound', className: 'Sapper', startingStyle: 'melee', styleLabel: 'Heavy blows', hairStyle: 'ironbound', raceHead: 'orcMale', sprite: 'orc', color: '#c7b8a2', hue: 15, speed: 158, hp: 11, damage: 3, fireDelay: 0.4, startingBombs: 4, trait: 'Strong and slow', unlock: 'Defeat a sentinel' },
  { id: 'artis-archivist', name: 'Artis Archivist', className: 'Scholar', startingStyle: 'magic', styleLabel: 'Measured spells', hairStyle: 'archivist', raceHead: 'tritanMale', sprite: 'tritan', color: '#c4a6df', hue: 115, speed: 218, hp: 4, damage: 3, fireDelay: 0.32, trait: 'Heavy hits, fragile', unlock: 'Reach Artis' },
  { id: 'glass-quill', name: 'Glass Quill', className: 'Scribe', startingStyle: 'bow', styleLabel: 'Piercing shots', hairStyle: 'quill', raceHead: 'raijinFemale', sprite: 'raijin', color: '#f0a2a2', hue: 155, speed: 230, hp: 3, damage: 3, fireDelay: 0.36, projectileSpeed: 620, trait: 'High damage, very fragile', unlock: 'Defeat the Spider Queen' },
  { id: 'vault-delver', name: 'Vault Delver', className: 'Delver', startingStyle: 'melee', styleLabel: 'Rapid fists', hairStyle: 'wanderer', raceHead: 'humanMale', sprite: 'neutral', color: '#a9c1d7', hue: 220, speed: 180, hp: 6, damage: 1, fireDelay: 0.16, trait: 'Slow movement, fast attacks', unlock: 'Complete a descent' },
  { id: 'graveyard-keeper', name: 'Graveyard Keeper', className: 'Keeper', startingStyle: 'magic', styleLabel: 'Spirit pulse', hairStyle: 'warden', raceHead: 'humanMale', sprite: 'neutral', color: '#a5aa9b', hue: 235, speed: 175, hp: 10, damage: 2, fireDelay: 0.34, startingBombs: 2, trait: 'Strong spirit, few bombs', unlock: 'Defeat the Reaper' },
  { id: 'tulimshar-guard', name: 'Tulimshar Guard', className: 'Guard', startingStyle: 'melee', styleLabel: 'Measured strikes', hairStyle: 'candor', raceHead: 'humanMale', sprite: 'male', color: '#e1ad72', hue: 12, speed: 195, hp: 9, damage: 2, fireDelay: 0.31, startingBombs: 4, trait: 'Extra bombs, slow attacks', unlock: 'Defeat the Great Red Slime' },
  { id: 'halinarzo-ranger', name: 'Halinarzo Ranger', className: 'Ranger', startingStyle: 'bow', styleLabel: 'Long shots', hairStyle: 'quill', raceHead: 'elfFemale', sprite: 'elfFemale', color: '#c5d38b', hue: 45, speed: 255, hp: 4, damage: 2, fireDelay: 0.3, projectileSpeed: 580, trait: 'Quick and fragile', unlock: 'Defeat Bandit Lord' },
  { id: 'nivalis-oracle', name: 'Nivalis Oracle', className: 'Oracle', startingStyle: 'magic', styleLabel: 'Ice magic', hairStyle: 'pilgrim', raceHead: 'raijinFemale', sprite: 'raijin', color: '#a9dbed', hue: 185, speed: 195, hp: 7, damage: 1, fireDelay: 0.25, startingAbility: 'frost-rune', trait: 'Frost Rune, slow movement', unlock: 'Defeat Snowman Boss' },
  { id: 'frostia-reclaimer', name: 'Frostia Reclaimer', className: 'Reclaimer', startingStyle: 'melee', styleLabel: 'Heavy fists', hairStyle: 'ironbound', raceHead: 'tritanMale', sprite: 'tritan', color: '#88bdcf', hue: 205, speed: 170, hp: 10, damage: 2, fireDelay: 0.38, trait: 'High health, slow attacks', unlock: 'Defeat Yeti King' },
  { id: 'candor-keeper', name: 'Candor Keeper', className: 'Warden', startingStyle: 'magic', styleLabel: 'Rooted magic', hairStyle: 'herbalist', raceHead: 'elfMale', sprite: 'elf', color: '#99c98a', hue: 80, speed: 205, hp: 6, damage: 2, fireDelay: 0.27, trait: 'Steady, modest speed', unlock: 'Defeat Forest Dragon' },
  { id: 'world-edge-veteran', name: 'World Edge Veteran', className: 'Veteran', startingStyle: 'bow', styleLabel: 'Last light', hairStyle: 'archivist', raceHead: 'orcMale', sprite: 'orc', color: '#c0a1d4', hue: 260, speed: 155, hp: 12, damage: 3, fireDelay: 0.42, trait: 'Very tough, very slow', unlock: 'Defeat Night Dragon' },
  { id: 'random', name: 'Random Delver', className: '???', startingStyle: 'melee', styleLabel: 'Roll the dice', hairStyle: 'wanderer', raceHead: 'humanMale', sprite: 'neutral', color: '#ffffff', hue: 300, speed: 200, hp: 6, damage: 1, fireDelay: 0.25, trait: 'Surprise me!', unlock: 'Available', random: true },
  { id: 'echo-bound-delver', name: 'Echo-Bound Delver', className: 'Echo Warden', startingStyle: 'magic', styleLabel: 'Echoing magic', hairStyle: 'archivist', raceHead: 'elfMale', sprite: 'elf', color: '#a8e7d0', hue: 165, speed: 218, hp: 8, damage: 2, fireDelay: 0.29, trait: 'Carries the memories of every region', unlock: 'Find all nine Mana echoes' },
];
const manaLoreRelics = [
  { id: 'mana-echo-tulimshar', region: 'tulimshar', name: 'Desert Echo', description: 'A buried note tells of a seed drawn along Mana’s flow.' },
  { id: 'mana-echo-worldedge', region: 'worldedge', name: 'World Edge Echo', description: 'A final record names the Mana Tree, but leaves the seed’s origin unanswered.' },
  { id: 'mana-echo-hurnscald', region: 'hurnscald', name: 'Forest Echo', description: 'Roots beneath Hurnscald carry Mana’s flow toward the World Edge.' },
  { id: 'mana-echo-graveyard', region: 'graveyard', name: 'Grave Echo', description: 'The restless dead stir wherever Mana’s flow passes beneath the stones.' },
  { id: 'mana-echo-artis', region: 'artis', name: 'Artis Echo', description: 'A ruin inscription traces where Mana once flowed.' },
  { id: 'mana-echo-halinarzo', region: 'halinarzo', name: 'Savannah Echo', description: 'A route chart traces Mana’s flow beneath the savannah.' },
  { id: 'mana-echo-nivalis', region: 'nivalis', name: 'Nivalis Echo', description: 'Mana’s flow runs on beneath the ice, untouched by the cold.' },
  { id: 'mana-echo-frostia', region: 'frostia', name: 'Frostia Echo', description: 'A fading roar leaves a warning: the Kaore-touched cannot bear Mana’s flow.' },
  { id: 'mana-echo-candor', region: 'candor', name: 'Candor Echo', description: 'The seed strains toward a flow of Mana older than the island.' },
];
const rosterPageSize = 5;
const prologuePages = [
  {
    heading: 'TULIMSHAR',
    title: 'A Seed Beneath the Sand',
    text: 'Mana flows through every living thing. Left to stagnate, it decays into Kaore, a blight that turns gentle creatures savage. In the old mines beyond Tulimshar’s walls, a sealed passage has given up a Mana Seed, a kernel of pure Mana. Since it was unearthed, monsters across the desert have stirred out of season. It may be an echo of the distant Mana Tree, but no one yet knows.',
  },
  {
    heading: 'HURNSCALD',
    title: 'Through the Ancient Woodlands',
    text: 'In Hurnscald, travelers asking after the World Edge are sent to Mayor Rakinorf, and lately they all bring him the same story. Wherever Kaore has soaked into the land, the creatures grow wilder wherever Mana’s flow runs beneath them. The forest roads are familiar. What walks them is not.',
  },
  {
    heading: 'ARTIS',
    title: 'A Route off the Main Road',
    text: 'Trade brings people and rumors to Artis, and most of both pass straight through. One rumor lingers: beneath a forgotten route off the main road, sealed rooms show signs of the same disturbance. The great histories of these lands will not record what happens down there. This is a smaller tale, told by the delvers who go below.',
  },
  {
    heading: 'NINE ECHOES',
    title: 'The reason to descend',
    text: 'Each region tells a story of Aemil, a world where Mana is the lifeforce behind all living things; and Kaore its corrupted echo.',
  },
];
const regionChapters = {
  tulimshar: { heading: 'TULIMSHAR', title: 'The Desert Gate', text: 'Every descent begins in Tulimshar. Guards, citizens and traders crowd its sandstone streets, while beyond the walls the old mines lie open where the Mana Seed was found. Mana’s flow still rolls beneath the dunes, the seed straining toward it, and the Kaore-touched creatures of the desert rise against it. Follow it, and the sand will give up what it hides.' },
  hurnscald: { heading: 'HURNSCALD', title: 'Where the Forest Remembers', text: 'Hurnscald, Mayor Rakinorf’s town, sits among old woodland roads. The creatures along these roads have grown restless. Among the trees’ roots, the Mana flow runs strong, warding off the effects of Kaore as the forest stirs.' },
  graveyard: { heading: 'THE GRAVEYARD', title: 'The Quiet Stones', text: 'The graveyard beyond Hurnscald lies silent until Mana’s flow stirs beneath it. Then the stones shift, and the dead rise. They now dance to the song of Kaore. Walk softly here.' },
  artis: { heading: 'ARTIS RUINS', title: 'Elanore’s Ruins', text: 'Among the toppled stones of the Artis Ruins, Elanore tells of the last living Mana Tree, saddened by war, its roots hidden where no one has found them. The seed brightens each time she names it. A kinship, perhaps, but much remains unknown.' },
  halinarzo: { heading: 'HALINARZO', title: 'The Savannah Roads', text: 'Halinarzo’s library shelves and sun-baked savannah trails carry great knowledge for those who venture there. Bandits watch these roads as closely as the beasts do. Keep your guard up.' },
  nivalis: { heading: 'NIVALIS', title: 'Beneath the Snow', text: 'Nivalis lies buried under snow. The Blue Sage is said to know every northern trail, and here Mana’s flow runs through the ice itself, rousing the tainted creatures that shelter in the hills. Cold can slow it, but it cannot stop it.' },
  frostia: { heading: 'FROSTIA', title: 'The Ice Court', text: 'King Gelid rules Frostia from deep within its ice caves, where every sound comes back twice. The frozen halls magnify Mana’s pulse until the Kaore-touched creatures of the north follow it down the trail. Every footstep echoes here. Move with purpose.' },
  candor: { heading: 'CANDOR ISLAND', title: 'The Caves Below', text: 'Merchant ships put in at Candor Island, but few who come ashore venture into the caves beneath it. Mana’s flow runs strong in the dark below the island, and something old and tainted has made its lair there. Mind your footing.' },
  worldedge: { heading: 'THE WORLD EDGE', title: 'The Edge of the Map', text: 'Travelers in Hurnscald speak of the World Edge as the place where Aemil gives out. The land thins to bare stone and open sky, yet Mana’s flow runs clearer here than anywhere else, and the seed pulls hard toward it. Step carefully. The quiet here is not empty.' },
};
const characterChapters = {
  arcanist: { heading: 'THE WARRIOR', title: 'Strength Over Speed', text: 'Two floors cleared, and a Warrior steps forward, wielding their sword with strength and confidence. They have no need for spells or arrows.' },
  warden: { heading: 'THE ROGUE', title: 'Out of the Dark', text: 'The first floor is behind you. The Rogue joins the descent with rapid, light steps, barely visible as they come out of the shadows. One shot, one kill.' },
  'mycelia-sporeling': { heading: 'THE SPORELING', title: 'A Growing Discovery', text: 'Spore Bloom has taken root. A mushroom-capped caster joins the descent with slowing spore pods and creepy mycelium clusters. The growth can’t be stopped.' },
  'candor-runner': { heading: 'CANDOR RUNNER', title: 'The Open Road', text: 'The Pinkie Matriarch is down, and the road to Candor lies open. The Runner is the fastest delver alive: slow to draw the bow, but never caught standing still. For this one, speed is the only armor worth wearing.' },
  'world-edge-pilgrim': { heading: 'WORLD EDGE PILGRIM', title: 'A Patient Walker', text: 'Another secret lies open, and a patient traveler has followed it in. The Pilgrim casts slowly and carefully, with the endurance for a very long walk. The World Edge calls to them, and they mean to answer.' },
  'hurnscald-herbalist': { heading: 'HURNSCALD HERBALIST', title: 'Roots and Frost', text: 'Hurnscald’s forest paths taught her which roots heal and which ones freeze. She sets out with a Frost Rune already in hand and moves at an unhurried pace. Cold magic and patient hands carry her through.' },
  ironbound: { heading: 'IRONBOUND', title: 'Off the Post', text: 'A sentinel has fallen, and one of its watchers has left the post for good. Ironbound is heavy and slow, and hits like a collapsing wall. Four bombs hang ready at the belt.' },
  'artis-archivist': { heading: 'ARTIS ARCHIVIST', title: 'Measured Spells', text: 'The Ruins held more than rumors. A scholar of Artis now joins the descent, weighing every spell before it is cast. Those spells hit hard, but the Archivist cannot take many blows in return.' },
  'glass-quill': { heading: 'GLASS QUILL', title: 'Every Shot a Word', text: 'The Spider Queen’s web lies torn, and a scribe steps out of it with piercing shots and a fragile frame. Every word she writes is a risk, and every shot she looses is a decision.' },
  'vault-delver': { heading: 'VAULT DELVER', title: 'Fists and Patience', text: 'A descent is complete, and a sealed vault swings open. The Vault Delver is slow on foot but fast with the fists: a flurry of short strikes, and a stubborn habit of coming back for more.' },
  'graveyard-keeper': { heading: 'GRAVEYARD KEEPER', title: 'The Keeper’s Key', text: 'With the Reaper gone from the stones, the Keeper has taken up the key. A strong spirit pulse, a few bombs, and a long memory carry this delver through the dark.' },
  'tulimshar-guard': { heading: 'TULIMSHAR GUARD', title: 'Hold the Line', text: 'The Great Red Slime is gone, and Tulimshar sends one of its own after it. The Guard is slow to strike but sturdy, with extra bombs on hand. Hold the line, then break it.' },
  'halinarzo-ranger': { heading: 'HALINARZO RANGER', title: 'Long Shots', text: 'The Bandit Lord has fallen, and the savannah has a new watcher. The Ranger looses long shots from far away. Quick and fragile, she makes a habit of staying out of arm’s reach.' },
  'nivalis-oracle': { heading: 'NIVALIS ORACLE', title: 'The Snow Whispers', text: 'The Snowman Boss lies broken, and the snow whispers a name. The Oracle carries a Frost Rune and walks with slow, deliberate steps. Ice magic answers to those who are willing to wait.' },
  'frostia-reclaimer': { heading: 'FROSTIA RECLAIMER', title: 'Taking It Back', text: 'The Yeti King’s caves stand open again. The Reclaimer swings heavy fists and shrugs off punishment, slow but certain. Frostia’s ice is theirs to take back.' },
  'candor-keeper': { heading: 'CANDOR KEEPER', title: 'Rooted Ground', text: 'The Forest Dragon is beaten, and a warden of Candor Island steps forward. Rooted magic, steady footing, and an unhurried stride: the Candor Keeper does not give ground.' },
  'world-edge-veteran': { heading: 'WORLD EDGE VETERAN', title: 'The Last Light', text: 'The Night Dragon has fallen. At the very edge of the map, a veteran raises a bow against the last of the light. Very tough, very slow, and still standing when everyone else has gone.' },
};
const keys = {};
let attackInputSuppressed = false;
const touchInput = { moveX: 0, moveY: 0, attack: false, aimActive: false, aimX: 1, aimY: 0, stickPointer: null, attackPointer: null };
const touchControlsEl = document.getElementById('touch-controls');
const touchStickEl = document.getElementById('touch-stick');
const stickKnobEl = document.getElementById('stick-knob');
const touchAttackEl = document.getElementById('touch-attack');
const pointer = { x: VIEW_W / 2, y: VIEW_H / 2, down: false };
let mouseAimActive = false;
// Seconds of mouse inactivity before walking direction takes over facing again.
const MOUSE_AIM_HOLD = 1;
let mouseAimIdleTimer = 0;
let lastInputMode = 'keyboard';
let lastNonControllerInputMode = 'keyboard';

function isTouchDevice() {
  return navigator.maxTouchPoints > 0;
}

function resetTouchInput() {
  touchInput.moveX = 0;
  touchInput.moveY = 0;
  touchInput.attack = false;
  touchInput.aimActive = false;
  touchInput.stickPointer = null;
  touchInput.attackPointer = null;
  if (stickKnobEl) stickKnobEl.style.transform = 'translate(-50%, -50%)';
  if (touchAttackEl) touchAttackEl.classList.remove('is-pressed');
}

function updateTouchControls() {
  if (!touchControlsEl) return;
  const mobileLayout = isTouchDevice() || lastInputMode === 'touch';
  if (document.body.classList.contains('mobile-layout') !== mobileLayout) {
    document.body.classList.toggle('mobile-layout', mobileLayout);
    resizeCanvas();
  }
  const visible = lastInputMode === 'touch' && mode === 'playing';
  touchControlsEl.hidden = !visible;
  touchControlsEl.classList?.toggle('map-open', visible && showMap);
  if (!visible) resetTouchInput();
  if (visible) {
    const itemCount = consumables.reduce((total, item) => total + Math.max(0, item.count), 0);
    for (const [action, count] of [['bomb', bombsHeld], ['item', itemCount]]) {
      const button = touchControlsEl.querySelector(`[data-touch-action="${action}"]`);
      button.disabled = count === 0;
      const badge = button.querySelector('.touch-count');
      if (badge.textContent !== String(count)) badge.textContent = String(count);
    }
    const switchButton = touchControlsEl.querySelector('[data-touch-action="nextWeapon"]');
    const switchWait = typeof weaponSwapCooldown === 'number' ? Math.ceil(weaponSwapCooldown) : 0;
    const switchText = switchButton?.querySelector?.('span');
    if (switchButton && switchText) {
      switchButton.disabled = switchWait > 0;
      const switchLabel = switchWait > 0 ? `${switchWait}s` : 'Switch';
      if (switchText.textContent !== switchLabel) switchText.textContent = switchLabel;
    }
    const defenseButton = touchControlsEl.querySelector('[data-touch-action="shock"]');
    const hasFamiliarSigil = typeof ownedItems !== 'undefined' && ownedItems.has('orbiting-projectiles');
    const defenseLabel = hasFamiliarSigil ? 'Guard' : 'Wave';
    const defenseName = hasFamiliarSigil ? 'Mana guard' : 'Shockwave';
    if (defenseButton?.setAttribute) defenseButton.setAttribute('aria-label', defenseName);
    const defenseText = defenseButton?.querySelector?.('span');
    if (defenseText && defenseText.textContent !== defenseLabel) defenseText.textContent = defenseLabel;
  }
}

function setInputMode(inputMode) {
  lastInputMode = inputMode;
  if (inputMode !== 'controller') lastNonControllerInputMode = inputMode;
  if (inputMode !== 'keyboard') mouseAimActive = false;
  updateTouchControls();
}

function touchStickVector(deltaX, deltaY, radius) {
  const length = Math.hypot(deltaX, deltaY);
  const scale = length > radius ? radius / length : 1;
  return { x: deltaX * scale / radius, y: deltaY * scale / radius };
}

function setupTouchControls() {
  if (!touchControlsEl) return;
  const moveZone = document.getElementById('touch-move-zone');
  const aimZone = document.getElementById('touch-aim-zone');
  const origins = new Map();
  const updateStick = (event, moving) => {
    const origin = origins.get(event.pointerId);
    if (!origin) return;
    const vector = touchStickVector(event.clientX - origin.x, event.clientY - origin.y, 40);
    if (moving) {
      touchInput.moveX = vector.x;
      touchInput.moveY = vector.y;
      stickKnobEl.style.transform = `translate(calc(-50% + ${vector.x * 32}px), calc(-50% + ${vector.y * 32}px))`;
    } else {
      touchInput.aimActive = Math.hypot(vector.x, vector.y) > 0.18;
      touchInput.aimX = vector.x;
      touchInput.aimY = vector.y;
    }
  };
  const bindZone = (zone, moving) => {
    if (!zone) return;
    const pointerKey = moving ? 'stickPointer' : 'attackPointer';
    zone.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' || touchInput[pointerKey] !== null) return;
      event.preventDefault();
      setInputMode('touch');
      if (touchControlsEl.hidden) return;
      startGameMusic();
      const attackButton = !moving &&
        (event.target === touchAttackEl || touchAttackEl?.contains(event.target));
      if (attackButton && canInteract()) {
        runAction('interact');
        return;
      }
      touchInput[pointerKey] = event.pointerId;
      origins.set(event.pointerId, { x: event.clientX, y: event.clientY });
      zone.setPointerCapture(event.pointerId);
      if (!moving) {
        touchInput.attack = true;
        touchAttackEl.classList.add('is-pressed');
      }
      updateStick(event, moving);
    });
    zone.addEventListener('pointermove', (event) => {
      if (touchInput[pointerKey] !== event.pointerId) return;
      event.preventDefault();
      updateStick(event, moving);
    });
    const release = (event) => {
      origins.delete(event.pointerId);
      if (touchInput[pointerKey] !== event.pointerId) return;
      touchInput[pointerKey] = null;
      if (moving) {
        touchInput.moveX = 0;
        touchInput.moveY = 0;
        stickKnobEl.style.transform = 'translate(-50%, -50%)';
      } else {
        touchInput.attack = false;
        touchInput.aimActive = false;
        touchAttackEl.classList.remove('is-pressed');
        releaseAttackInputSuppressionIfIdle();
      }
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, release);
  };
  bindZone(moveZone, true);
  bindZone(aimZone, false);
  for (const button of touchControlsEl.querySelectorAll('[data-touch-action]')) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setInputMode('touch');
      if (touchControlsEl.hidden) return;
      startGameMusic();
      const action = button.dataset.touchAction;
      if (action === 'pause') pauseGame();
      else runAction(action, { shift: action === 'withdraw' });
      updateTouchControls();
    });
  }
}

let mode = 'prologue';
let prologuePage = 0;
let codexTab = 'items';
let codexScroll = 0;
let selectedIndex = 0;
let character;
let currentFloor = 1;
const playerVelocity = { x: 0, y: 0 };
const lastPlayerSample = { x: 0, y: 0 };
let dashTimer = 0;
let dashCooldown = 0;
let dashVector = { x: 0, y: 0 };
let blanksHeld = 1;
let orbitGuardChargeUps = 0;
const ORBIT_GUARD_CHARGE_REQUIREMENT = 5;
const ORBIT_GUARD_CHARGE_CAP = 8;
const ORBIT_GUARD_SUMMON_COUNT = 3;
const ORBIT_GUARD_MAX = 13;
const orbitGuards = [];
const runOfferedAbilityIds = new Set();
let nextOrbitGuardId = 1;
let xpPoints = 0;
let xpLevel = 1;
const XP_PER_LEVEL = (level) => 6 + level * 4;
const finalFloor = 9;
let score = 0;
let killStreak = 0;
let killStreakTimer = 0;
const streakCallout = { timer: 0, duration: 1.2, x: 0, y: 0, text: '' };
// Recent messages drawn on the canvas, newest first.
const messageToasts = [];

// Ignores input briefly when a run ends so a held or mashed key can't skip the summary.
let endScreenDelay = 0;

// Second press of Descend within this window replaces a saved run.
let newRunConfirmTimer = 0;

let coins = 0;
// Enemy drops that are only worth zeny at a shop's sell pad. Carried amounts are lost with the run, like zeny.
// Rates are per eligible kill: normal, elite and miniboss foes, never summoned, split-off or ambush foes.
const materialCatalog = {
  ironOre: { id: 'iron-ore', name: 'Iron Ore', price: 1 },
  darkCrystal: { id: 'dark-crystal', name: 'Dark Crystal', price: 3 },
};
const MATERIAL_DROP_TUNING = {
  rates: { ironOre: 0.06, darkCrystal: 0.02 },
  luckBonus: { ironOre: 0.01, darkCrystal: 0.005 },
  strongFoeMultiplier: 2,
};
const materials = { ironOre: 0, darkCrystal: 0 };
function resetMaterials() {
  for (const key of Object.keys(materialCatalog)) materials[key] = 0;
}
let keysHeld = 0;
let bombsHeld = 3;
let rooms = [];
let currentRoom;
let storyText = '';
const storyLog = [];
let showMap = false;
// The room highlighted on the full map, and when the map last opened (for its fade-in).
let mapCursor = null;
let mapOpenedAt = 0;
let showStoryJournal = false;
let lastTime = 0;
let elapsed = 0;
let messageTimer = 0;
let autosaveTimer = 0;
let frostNovaCooldown = 0;
let frostActive = false;
const cameraShakeProfiles = {
  bomb: { duration: 0.2, intensity: 4, frequency: 44, style: 'snap' },
  swordImpact: { duration: 0.22, intensity: 7, frequency: 40, style: 'snap' },
  playerHeavyHit: { duration: 0.24, intensity: 8, frequency: 34, style: 'snap' },
  jackoJumpLand: { duration: 0.2, intensity: 5, frequency: 24, style: 'rumble' },
  groundPound: { duration: 0.24, intensity: 6, frequency: 24, style: 'rumble' },
  spiderPounce: { duration: 0.3, intensity: 10, frequency: 28, style: 'rumble' },
  golemSlam: { duration: 0.22, intensity: 5, frequency: 22, style: 'rumble' },
  charge: { duration: 0.24, intensity: 5, frequency: 31, style: 'snap' },
  meleeImpact: { duration: 0.14, intensity: 3.5, frequency: 42, style: 'snap' },
  playerHurt: { duration: 0.2, intensity: 5, frequency: 38, style: 'snap' },
};
const cameraShake = { duration: 0, remaining: 0, intensity: 0, frequency: 0, style: 'snap', phase: 0 };
const combatPalette = {
  arcane: '#83e7ff',
  volley: '#a5f0ed',
  melee: '#ffc56b',
  sword: '#c4e8ff',
  daggers: '#fff0b0',
  impact: '#fff3d9',
};
const magicElementPalette = {
  bubble: '#62d9ee',
  fire: '#ff7043',
  lightning: '#ffe35a',
  gas: '#a5d64f',
  spore: '#d78be7',
  ice: '#9de9ff',
  wind: '#bcf5dc',
  earth: '#cda475',
};


let hitStopTimer = 0;
let hitStopReadyAt = 0;
// Freeze-frame on impact. `minGap` (seconds) throttles rapid sources such as projectile streams
// so they punctuate hits without slowing the whole fight down.
// Tunnel-vision vignette shown after the player takes a hit.
const HURT_VIGNETTE_DURATION = 0.85;
let hurtVignetteTimer = 0;
let hurtVignetteStrength = 0;
const weapon = {
  tearSize: 1,
  shotCount: 1,
  fireDelay: 0.23,
  projectileSpeed: 480,
  rangeMultiplier: 1,
  rangeLevel: 0,
  shotDamageMultiplier: 1,
  damageBonus: 0,
};
let activeCombatStyle = 'magic';
const ownedItems = new Set();
const magicElements = new Set(['bubble']);
let activeMagicElement = 'bubble';
const combatStyles = new Set();
const meleeWeapons = new Set(['hands']);
const reservedUpgradeIds = new Set();
const consumables = [];
const equippedClothing = { legs: null, chest: null };

const player = {
  x: ROOM_W / 2,
  y: ROOM_H / 2,
  radius: 12,
  speed: 235,
  hp: 6,
  maxHp: 6,
  damage: 1,
  armor: 0,
  aegisCharges: 0,
  luck: 0,
  damageFlashTimer: 0,
  groundSlowTimer: 0,
  fireCooldown: 0,
  invuln: 0,
  lookX: 1,
  lookY: 0,
  moving: false,
  attackPulse: 0,
  attackAnimationTimer: 0,
  attackAnimationStyle: 'hand',
  swordParryTimer: 0,
  swordParryDamage: 0,
  swordParryRewarded: false,
  swordParryRadius: 0,
  swordParryFlash: 0,
  meleeSwings: [],
  meleeCharge: 0,
  meleeBuffer: null,
  pendingSwing: null,
  characterUnlocksThisRun: 0,
};

const MELEE_CHARGE_TIME = 0.65;
const MELEE_BASE_SCALE = 2.6;
const BOW_TAP_WINDOW = 0.22;
const BOW_CHARGE_TIME = 0.75;
const MAX_CHARGE_SHOTS = 4;

// Rapid/triple modes stay per-weapon; an upgrade that grants charge enables it for every style.
const fireModes = { melee: 'rapid', bow: 'rapid', magic: 'rapid' };



// Class and race shape how each weapon style performs. Race flavour follows the Mana World lore:
// Talpan (humans) are adaptable, Tritan are water-attuned scholars, Raijin are swift and storm-touched,
// elves are attuned to mana, orcs are brawny and mana-poor.
// Melee/bow/magic multipliers per class; the native style is the class's strongest.
const classProfiles = {
  Mage: { magic: 1.2, melee: 0.9, bow: 1 },
  Warrior: { melee: 2.1, meleeRate: 0.75, magic: 0.75, bow: 0.85 },
  Rogue: { bow: 0.65, bowRate: 2, melee: 0.8, magic: 0.8 },
  Scout: { bowRate: 1.25, bow: 0.95 },
  Pilgrim: { magic: 1.1 },
  Herbalist: { magic: 1.15 },
  Sporeling: { magic: 1.15 },
  Sapper: { melee: 1.5, meleeRate: 0.85, magic: 0.6 },
  Scholar: { magic: 1.5, melee: 0.7, bow: 0.8 },
  Scribe: { bow: 1.3 },
  Delver: { melee: 1.0, meleeRate: 1.2 },
  Keeper: { magic: 1.2 },
  Guard: { melee: 1.25, meleeRate: 0.95, bow: 0.9 },
  Ranger: { bow: 1.2, bowRate: 1.2 },
  Oracle: { magic: 1.3, melee: 0.8 },
  Reclaimer: { melee: 1.3, meleeRate: 0.9 },
  Veteran: { bow: 1.3, melee: 1.15, bowRate: 0.9 },
};

// Signature perks make each class play differently beyond its weapon style.
const classSignatures = {
  Mage: { label: 'Steady Magic', desc: 'Balanced casting and movement; no rapid bow or heavy sword bonus' },
  Rogue: { label: 'Rapid Draw', desc: 'Fast, light bow shots; weaker sword and spells use their own slower cadence' },
  Warrior: { label: 'Heavy Blade', desc: 'Starts with a powerful sword; slow recovery, weaker bows and spells' },
  // active: true gives the class a dedicated key-4 ability on its own cooldown; it never replaces keys 1-3.
  Sapper: { label: 'Bomb Forge', desc: 'Key 4: forge a free bomb at your feet', active: true, cooldown: 6, color: '#ffad59' },
  Scribe: { label: 'Laser Quill', desc: 'Key 4: fire a piercing laser beam', active: true, cooldown: 5, color: '#ff7a9c' },
  Keeper: { label: 'Spirit Nova', desc: 'Key 4: release a spirit blast around you', active: true, cooldown: 9, color: '#b9ffd8' },
  Sporeling: { label: 'Spore Bloom', desc: 'Magic slot fires spore pods that burst into spores' },
  Scout: { label: 'Wind Step', desc: 'Dash recovers twice as fast' },
  Pilgrim: { label: 'Steady Stride', desc: 'Walks 12% faster' },
  Delver: { label: 'Second Wind', desc: 'Every kill instantly readies your next attack' },
  Scholar: { label: 'Quick Study', desc: 'Gains 30% more XP' },
  Herbalist: { label: 'Frost Bloom', desc: 'Starts with a Frost Rune; kills chill nearby foes' },
};
const raceProfiles = {
  humanMale: {}, humanFemale: {},
  elfMale: { magic: 1.08 },
  elfFemale: { magic: 1.08, bowRate: 1.05 },
  orcMale: { melee: 1.15, magic: 0.9 },
  tritanMale: { magic: 1.05 },
  raijinFemale: { bowRate: 1.1, magic: 1.05 },
};



// Every weapon style is always ready: no ammo, stamina, mana or recharge to manage.
// The class's native style is still its strongest through characterProfile().

// A weapon mod on a style the class is naturally good at gets an extra boost.

// Isaac-style pun call-outs so every pickup announces what it just did to you.
const itemQuips = {
  'mod-windup': 'WIND-UP WRAPS! Charge mode winds up faster.',
  'mod-flurry': 'FLURRY GAUNTLETS! Jab jab jab, tiny hits.',
  'mod-cinder': 'CINDER EDGE! Your swings are on fire (literally).',
  'mod-pierce': 'PIERCING HEADS! Arrows go straight through.',
  'mod-draw': 'LONGBOW DRAW! Charge mode draws faster.',
  'mod-quiver': 'RAPID QUIVER! Quiver in fear, foes.',
  'mod-storm-arrows': 'STORM FLETCHING! Arrows are shockingly good.',
  'mod-splash': 'IMPACT CORE! Shots go boom on landing.',
  'mod-chain': 'STORM CONDUIT! Spark joy, then spark foes.',
  'mod-lingering': 'LINGERING MANA! It really hangs around.',
};

const chaosStatuses = [
  { text: 'HASTE-BIT! Speed up', speed: 1.35 },
  { text: 'LEAD-ING ROLE! Speed down', speed: 0.7 },
  { text: 'BERSERK-LEY! Attack up', damage: 1.6 },
  { text: 'WIMP-LEDON! Attack down', damage: 0.6 },
  { text: 'RAPID FIRE-ANT! Fire rate up', fire: 1.5 },
  { text: 'SLOTH MOTION! Fire rate down', fire: 0.6 },
  { text: 'GHOST RIDER! Brief invulnerability', ghost: true },
];
let chaosStatus = null;
let chaosTimer = 0;

const effectKeyLabels = {
  damage: 'ATTACK', speed: 'SPEED', fire: 'FIRE RATE',
};
// Plain-language tags for non-curio pickups so the player always sees what they just got.
const itemEffectTags = {
  pearl: ['+ATTACK', '+SHOT SIZE'],
  prism: ['+TRIPLE SHOT', '-SHOT DAMAGE EACH'],
  feather: ['+FIRE RATE', '+SHOT SPEED'],
  'range-lens': ['+RANGE', '+MELEE REACH'], 'range-lens-ii': ['+RANGE', '+MELEE REACH'],
  'range-lens-iii': ['+RANGE', '+MELEE REACH', '+SHOTS PIERCE WALLS'],
  'wild-magic-core': ['+WILD MAGIC LINKS', '+LONGER DECAY', '+WIDER NOVA'],
  'frost-rune': ['+AUTO FROST PULSE'], 'spore-bloom': ['+MAGIC IMPACT CLUSTERS'], 'bonded-aegis': ['+3 HIT SHIELD'],
  'element-fire': ['+FIRE MAGIC'], 'element-lightning': ['+LIGHTNING MAGIC'], 'element-gas': ['+MIASMA MAGIC'],
  'iron-sword': ['+SWORD REACH', '+HEAVY SWING'], 'swift-daggers': ['+TWIN STRIKES', '+SWING SPEED'],
  'mod-windup': ['+FASTER CHARGE'],'mod-flurry': ['+JAB SPEED', '-HIT DAMAGE'],
  'mod-cinder': ['+FIRE WALL ON SWING'], 'mod-pierce': ['+ARROWS PIERCE'], 'mod-draw': ['+FASTER DRAW'],
  'mod-quiver': ['+RAPID ARROW RATE', '-LIGHTER ARROWS'], 'mod-storm-arrows': ['+CHAIN LIGHTNING ARROWS'],
  'mod-splash': ['+SPLASH DAMAGE'], 'mod-chain': ['+CHAIN LIGHTNING SHOTS'], 'mod-lingering': ['+DAMAGE CLOUD'],
  'silk-shorts': ['+SPEED'], 'leather-legguards': ['+ARMOR 2', '-SPEED'], 'leather-vest': ['+ARMOR 1'],
};


const pickupBanner = { title: '', tags: [], timer: 0 };
// Brief icons that float up above the player's head whenever something changes; the pause screen keeps the full list.
const overheadPops = [];
// Small numbers that drift up from an enemy when a hit lands. Skipped in low quality and with reduced motion.
const damageNumbers = [];
const MAX_DAMAGE_NUMBERS = 18;
const DAMAGE_NUMBER_LIFE = 0.75;






const FIRE_RATE_SCALE = 0.82;
const projectiles = [];
const enemyProjectiles = [];
const particles = [];
const enemies = [];
const companions = [];
const pickups = [];
const bombs = [];
const breakables = [];
const groundHazards = [];
const bossStrikes = [];
let playerStillTimer = 0;
const lightningArcs = [];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}











const save = getSave();
let profileSaveTimer = 0;
let runProgressionSnapshot = null;








let chapterQueue = [];
let activeChapter = null;
let chapterReturnMode = 'select';
let chapterAudio = null;












const CONTROLS_STORAGE_KEY = 'mana-controls-v1';
const HELP_VISIBILITY_STORAGE_KEY = 'mana-help-visible-v1';
let controlsHelpVisible = (() => {
  try {
    return localStorage.getItem(HELP_VISIBILITY_STORAGE_KEY) === 'true';
  } catch (error) {
    return false;
  }
})();
// key: default keyboard key (lower-case event.key); pad: default standard-mapping button index.
const bindingActions = [
  { id: 'dash', label: 'Dash', desc: 'Quick burst of speed with brief invulnerability', key: ' ', pad: 5 },
  { id: 'bomb', label: 'Bomb', desc: 'Drop a bomb (near a bank vault: withdraw on pad)', key: 'f', pad: 1 },
  { id: 'item', label: 'Use consumable', desc: 'Drink or use the next stored item', key: 'q', pad: 6 },
  { id: 'shock', label: 'Shockwave / Mana familiars', desc: 'Use Shockwave; discover Betsanc to summon orbiting guards', key: 'r', pad: 3 },
  { id: 'ability', label: 'Class ability', desc: 'Your class signature (also right-click)', key: '4', pad: 15 },
  { id: 'nextWeapon', label: 'Next weapon', desc: 'Cycle melee, bow, magic (also mouse wheel)', key: 'tab', pad: 4 },
  { id: 'weapon1', label: 'Select melee', desc: 'Jump straight to melee', key: '1', keyOnly: true },
  { id: 'weapon2', label: 'Select bow', desc: 'Jump straight to the bow', key: '2', keyOnly: true },
  { id: 'weapon3', label: 'Select magic', desc: 'Jump straight to magic', key: '3', keyOnly: true },
  { id: 'interact', label: 'Interact / buy', desc: 'Buy, talk, open doors (Shift+E: bank withdraw)', key: 'e', pad: 0 },
  { id: 'map', label: 'Map', desc: 'Open or close the full map', key: 'm', pad: 8 },
  { id: 'journal', label: 'Journal', desc: 'Open or close your story notes', key: 'j', pad: 13 },
];
const reservedKeys = new Set(['w', 'a', 's', 'd', 'p', 'escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'enter', 'delete', 'backspace']);
const reservedPadButtons = new Set([2, 7, 9]);
const bindings = { key: {}, pad: {} };




loadBindings();

function actionForKey(key) {
  return bindingActions.find((action) => bindings.key[action.id] === key)?.id || null;
}

function actionForPad(index) {
  return bindingActions.find((action) => !action.keyOnly && bindings.pad[action.id] === index)?.id || null;
}



// Label for an action on whichever device the player touched last; `long` adds the fixed extras (wheel, right-click).





function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function hasLineOfSight(from, to) {
  return !breakables.some((obstacle) => {
    if (obstacle.broken) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const projection = clamp(((obstacle.x - from.x) * dx + (obstacle.y - from.y) * dy) / lengthSquared, 0, 1);
    const closest = { x: from.x + projection * dx, y: from.y + projection * dy };
    return distanceBetween(closest, obstacle) < obstacle.radius + 4;
  });
}



const BASE_HEARTS = 4;
const MAX_EXTRA_HEARTS = 9;
const SOFT_EXTRA_HEARTS = 5;



// Past the soft limit, vessels become rare finds.

const rangeLensItemIds = ['range-lens', 'range-lens-ii', 'range-lens-iii'];




// Swap out any offer the player can no longer buy (already owned, slots full) before they see it.




// Spawn counts scale with floor area relative to the small room.








function pauseGame() {
  if (mode !== 'playing' || deathTimer > 0) return;
  for (const key of Object.keys(keys)) keys[key] = false;
  pointer.down = false;
  saveRunState();
  closeMap();
  mode = 'paused';
  const labels = pauseControlLabels();
  showMessage(`Paused. Press ${labels.resume} to resume or ${labels.exit} to save and exit.`, 9999);
}

function pauseControlLabels() {
  return lastInputMode === 'controller' ? { resume: 'Start/A', exit: 'B' } : { resume: 'P or R', exit: 'X' };
}

function resumeGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  messageTimer = 0;
  messageEl.textContent = '';
}

function exitToTitle() {
  if (mode !== 'paused') return;
  saveRunState();
  mode = 'select';
  menuFocus = defaultMenuFocus();
  messageTimer = 0;
  showMessage('Descent saved. Press R to resume or choose a new delver.', 5);
  updateHud();
}

const floorThemes = {
  tulimshar: { name: 'Tulimshar', wall: '#30383a', trim: '#49aaa3', detail: '#f4cb7a' },
  hurnscald: { name: 'Hurnscald', wall: '#203a31', trim: '#6ec49a', detail: '#e9d184' },
  graveyard: { name: 'Hurnscald Graveyard', wall: '#292833', trim: '#9e739a', detail: '#c9d7ad' },
  artis: { name: 'Artis Ruins', wall: '#292e39', trim: '#d17767', detail: '#f2c28c' },
  halinarzo: { name: 'Halinarzo Savannah', wall: '#453b2b', trim: '#d79d4e', detail: '#93c77d' },
  nivalis: { name: 'Nivalis', wall: '#314754', trim: '#6ec9dc', detail: '#ecf7ef' },
  frostia: { name: 'Frostia', wall: '#2e3146', trim: '#9b9ce1', detail: '#d9dcff' },
  candor: { name: 'Candor Island', wall: '#2c3531', trim: '#b78558', detail: '#d3c889' },
  worldedge: { name: 'World Edge', wall: '#29253a', trim: '#a27dbc', detail: '#f1ae88' },
};
const regionalBossClues = {
  tulimshar: 'The Great Red Slime’s core was thick with Kaore and shuddered whenever Mana’s flow passed beneath the sand. The desert did not create that flow; it only showed that the seed could follow it.',
  hurnscald: 'Mana’s flow follows the same roads that Hurnscald’s travelers take toward the World Edge. Jacko’s lantern flares as the seed’s presence is revealed.',
  graveyard: 'The Reaper left pale spores in the cracks between the stones. The restless dead were never choosing a new war; the Kaore in them was recoiling from Mana’s flow.',
  artis: 'The Ancient Golem’s runes repeat the mark Elanore described in her notes. It is a resemblance, not proof, but the runes trace where Mana once flowed, and the seed strains toward them.',
  halinarzo: 'A route chart salvaged from the Bandit Lord traces Mana’s flow beneath the savannah, along the same lines recorded in Halinarzo’s library. The seed pulls along them, across every habitat and past every kind of monster.',
  nivalis: 'The Snowman Boss breaks apart, yet Mana’s flow carries on beneath the snow, steady and untroubled. The guardian was never its source, only one more creature caught in its path.',
  frostia: 'The Yeti King’s rage rose and fell with Mana’s pulse. The Kaore in it could not bear the flow, and neither can the others.',
  candor: 'In the Forest Dragon’s lair, the seed strained toward a flow of Mana older than the island. No delver can yet say whether it is a root of the last Mana Tree, a splinter, or only a trace.',
  worldedge: 'With the Night Dragon gone, the seed goes still for a breath, as if listening for Mana’s flow. Every sign points toward the Mana Tree, yet the seed’s origin remains unanswered.',
};









// Obstacles are deliberate: indestructible pillars are mirrored cover against ranged enemies, and
// a breakable cache in a corner always pays out (heart if hurt, otherwise zeny or a bomb).
// Door lanes and the room centre stay clear.






const enemyUnlockAtSeconds = {
  piou: 2100,
  maggot: 2280,
  tortuga: 2460,
  croc: 120,
  wisp: 240,
  spider: 360,
  frog: 480,
  mouboo: 600,
  bluepar: 720,
  bee: 840,
  'spore-sower': 960,
  fluffy: 1080,
  snail: 1200,
  skeleton: 1320,
  vampirebat: 1440,
  junglefowl: 1560,
  troll: 1680,
  zombie: 1800,
  frostiana: 1920,
};




let enemyLinkSequence = 0;

// From floor 3 onward, some ordinary monsters gain the signature attack patterns of mini bosses.





function beginRun() {
  stopPrologueNarration();
  mouseAimActive = false;
  let entry = characterRoster[selectedIndex];
  if (!isCharacterUnlocked(entry)) {
    showMessage(`${entry.name} is locked: ${entry.unlock}.`, 3);
    return;
  }
  const rolledRandom = Boolean(entry.random);
  if (rolledRandom) {
    const pool = characterRoster.filter((candidate) => !candidate.random && isCharacterUnlocked(candidate));
    entry = pool[Math.floor(Math.random() * pool.length)];
  }
  chaosStatus = null;
  chaosTimer = 0;
  player.characterUnlocksThisRun = 0;
  character = entry;
  if (rolledRandom) showMessage(`FATE-FUL CHOICE! You are ${entry.name} today.`, 3);
  unlockPlaytimeItems(false);
  runProgressionSnapshot = createRunProgressionSnapshot();
  storyLog.length = 0;
  canvas.style.cursor = 'crosshair';
  player.maxHp = startingHearts(entry);
  player.hp = player.maxHp;
  player.speed = entry.speed;
  player.damage = entry.damage;
  player.armor = 0;
  player.aegisCharges = 0;
  player.lifestoneRegen = null;
  orbitGuardChargeUps = 0;
  orbitGuards.length = 0;
  nextOrbitGuardId = 1;
  player.luck = 0;
  player.damageFlashTimer = 0;
  player.attackPulse = 0;
  player.attackAnimationTimer = 0;
  player.attackAnimationStyle = 'hand';
  player.swordParryTimer = 0;
  player.swordParryDamage = 0;
  player.swordParryRewarded = false;
  player.swordParryRadius = 0;
  player.swordParryFlash = 0;
  hitStopTimer = 0;
  hurtVignetteTimer = 0;
  player.knockback = null;
  deathTimer = 0;
  messageToasts.length = 0;
  resetRunStats();
  killStreak = 0;
  killStreakTimer = 0;
  streakCallout.timer = 0;
  equippedClothing.legs = null;
  equippedClothing.chest = null;
  weapon.tearSize = 1;
  weapon.shotCount = 1;
  weapon.fireDelay = 2 / 3;
  weapon.projectileSpeed = entry.projectileSpeed || 480;
  weapon.rangeMultiplier = 1;
  weapon.rangeLevel = 0;
  weapon.shotDamageMultiplier = weapon.fireDelay / 0.23;
  weapon.damageBonus = 0;
  frostNovaCooldown = 0;
  frostActive = entry.startingAbility === 'frost-rune';
  fireModes.melee = 'rapid';
  fireModes.bow = 'rapid';
  fireModes.magic = 'rapid';
  ownedItems.clear();
  runOfferedAbilityIds.clear();
  magicElements.clear();
  magicElements.add('bubble');
  activeMagicElement = startingMagicElement(entry);
  magicElements.add(activeMagicElement);
  combatStyles.clear();
  meleeWeapons.clear();
  meleeWeapons.add('hands');
  if (entry.className === 'Warrior') meleeWeapons.add('sword');
  reservedUpgradeIds.clear();
  for (const style of ['melee', 'bow', 'magic']) combatStyles.add(style);
  activeCombatStyle = entry.startingStyle;
  resetStyleHeat();
  resetInputAI();
  if (entry.startingAbility) ownedItems.add(entry.startingAbility);
  consumables.length = 0;
  companions.length = 0;
  player.meleeSwings = [];
  player.spin = null;
  player.meleeCharge = 0;
  player.meleeBuffer = null;
  player.pendingSwing = null;
  player.x = ROOM_W / 2;
  player.y = ROOM_H / 2;
  player.fireCooldown = 0;
  player.invuln = 0;
  mapOrder = createMapOrder();
  currentFloor = 1;
  dashTimer = 0;
  dashCooldown = 0;
  blanksHeld = 1;
  xpPoints = 0;
  xpLevel = 1;
  player.laserCharge = 0;
  player.signatureCooldown = 0;
  player.powerHat = null;
  sporePods.length = 0;
  bossStrikes.length = 0;
  groundHazards.length = 0;
  lightningArcs.length = 0;
  player.classKills = 0;
  laserBeams.length = 0;
  coins = 0;
  resetMaterials();
  resetFloorCoins();
  keysHeld = 0;
  bombsHeld = entry.startingBombs || 3;
  showMap = false;
  autosaveTimer = 0;
  const generated = generateDungeon();
  rooms = generated.rooms;
  currentRoom = generated.startRoom;
  mode = 'playing';
  for (const page of prologuePages) recordStory(page.heading, page.text);
  const ancestryNotes = {
    humanMale: 'Human delvers read the seed through memory and craft: tools, maps, and the marks that repeat along old roads.',
    humanFemale: 'Human delvers read the seed through memory and craft: tools, maps, and the marks that repeat along old roads.',
    elfMale: 'Elven delvers listen for Mana moving through living roots. The way the seed pulls toward that flow feels familiar to them, though none can say whether it is kin to the Mana Tree.',
    elfFemale: 'Elven delvers listen for Mana moving through living roots. The way the seed pulls toward that flow feels familiar to them, though none can say whether it is kin to the Mana Tree.',
    orcMale: 'Orc delvers feel Mana’s flow as a weight in stone and bone. Their strength lets them endure it, never command it.',
    tritanMale: 'Tritan delvers liken Mana’s flow to distant tides: a current can cross any boundary without revealing where it began.',
    raijinFemale: 'Raijin delvers feel the pressure of Mana’s flow before it arrives, like a storm gathering beyond sight. It is a sensation, not a certainty.',
  };
  recordStory('Ancestry · ' + entry.className, ancestryNotes[entry.raceHead] ||
    'This delver reads the seed through a tradition the field notes have yet to record.');
  spawnRoom(currentRoom);
  saveRunState();
  discoverRegion();
}



const MAX_PLAYER_VOLLEY = 8;
const MAX_PLAYER_PROJECTILES = 140;

// The two newest morph-capable items define how shots look and behave; some trade power for flair.
const attackMorphs = {
  'frost-rune': { label: 'Frost Shards', shape: 'diamond', color: '#9fe7f3', slowOnHit: 0.9, speedMul: 0.88, damageMul: 0.9 },
  'spore-bloom': { label: 'Spore Seeds', shape: 'seed', color: '#d78be7', drop: 'short', pulse: 0.16 },
  'element-fire': { label: 'Ember Bursts', explode: 46, sizeMul: 1.1 },
  'element-lightning': { label: 'Storm Pulses', pulse: 0.28, speedMul: 1.15, damageMul: 0.9 },
  'element-gas': { label: 'Miasma Drops', drop: 'long', speedMul: 0.82 },
};


// Chain lightning: arcs from the struck enemy to the nearest others.




// Cinder Edge: the swing smacks the ground ahead into a short wall of fire (and detonates miasma clouds).

// Any melee swing sends enemy shots it touches back toward the nearest foe.



// Aim from the body (where shots leave), not the feet, so the cursor lines up with where projectiles travel.


// Melee swings on press and repeats while held. Charge mode turns holding into one crushing charged swing.




// Bow: rapid and triple modes tap-fire; charge mode draws a heavy piercing arrow.

// Magic: rapid mode streams shots; charge mode holds to build a bigger, piercing bolt.














const bossAttackRotations = {
  'slime-mother': ['slime-trail', 'slime-crash', 'slime-shot', 'slime-charge', 'slime-crash'],
  reaper: ['reaper-charge', 'blink-strike', 'reaper-fan', 'gas-cloud', 'reaper-bomb'],
  serqet: ['venom-fan', 'gas-cloud', 'venom-bomb', 'venom-charge'],
  banditlord: ['arrow-barrage', 'hook-pull', 'arrow-wheel', 'fire-bottle', 'bandit-charge'],
  'snowman-boss': ['ice-burst', 'water-splash', 'ice-shot', 'wind-gust', 'snow-charge'],
  yetiking: ['yeti-slam', 'wind-gust', 'yeti-charge', 'ice-burst', 'water-splash'],
  forestdragon: ['forest-summon', 'fire-breath', 'forest-breath', 'wind-gust', 'forest-charge', 'spore-bomb'],
  nightdragon: ['void-cross', 'lightning-strike', 'void-laser', 'blink-strike', 'wind-gust', 'void-charge'],
};







// Shared boss moves; returns true when the move name is known.

const bossExtraMoves = {
  golem: ['rock-fall', 'berserk'],
  'spider-queen': ['web-snare', 'blink-strike'],
  jacko: ['fire-bottle', 'blink-strike', 'lightning-strike'],
};

// Bosses with their own state machines fire an extra telegraphed move now and then while idle.


// Linked twins somersault along their tether when it is crossed and pounce on a player standing on it.


// Minibosses hit hard enough to be feared: 2 damage early, 3 from floor 3.



const MAX_ROOM_COINS = 10;
const SOFT_FLOOR_COINS = 6;
const MAX_FLOOR_COINS = 10;
let floorCoinsSpawned = 0;
let floorCoinCeiling = SOFT_FLOOR_COINS;
let floorOverflowRolled = false;


// Once per map, the first coin past the budget rolls for a windfall; Luck Up raises the odds.










let walkInCooldown = 0;




// Shop items, the bank pad, the menhir, the descent pad, and key doors all trigger on contact.






// Gungeon-style shockwave (blank): erases enemy projectiles and shoves nearby foes away.

// Vampire Survivors-style XP: each level grants a random boon, Hades-style.

const laserBeams = [];



// Key 4: the class's own ability, kept separate from the sword/bow/mana slots.

// Same pod as the mushroom enemy's spore burst: a slow orb that bursts into eight shards.

const sporePods = [];





// Frost is an automatic elemental: while it is the last elemental found, it pulses by itself when foes crowd in.



// Shoves the player away from whatever hit them so the impact reads clearly.




const calmMobBehaviors = new Set(['hover', 'crawl', 'patrol']);

// Shared tactics for ordinary mobs: dodging, pack spacing and flanking, burst fire and a low-health enrage.
// Returns true while the mob is busy dodging so its archetype logic is skipped.



// Bosses punish both standing still and running in straight lines: strikes land where the player
// is, where they are heading, and on both sides of that path. Up close the boss smacks hard.

const calmBossStates = new Set(['jacko-idle', 'hover', 'crawl', 'patrol']);

function shouldKeyboardMovementSetFacing(length) {
  return length > 0 && !gamepadInput.aimActive && !pointer.down &&
    !gamepadInput.shoot && !touchInput.attack && !mouseAimActive &&
    lastInputMode !== 'controller' && lastInputMode !== 'touch';
}

// The cursor owns facing while the mouse is moving, held or attacking; after that, walking does.
function updateMouseAimHold(dt) {
  if (mouseAimActive && !pointer.down && player.attackAnimationTimer <= 0) {
    mouseAimIdleTimer += dt;
    if (mouseAimIdleTimer >= MOUSE_AIM_HOLD) mouseAimActive = false;
  } else {
    mouseAimIdleTimer = 0;
  }
}

function shouldMovementSetFacing(length) {
  if (length <= 0) return false;
  if (lastInputMode === 'controller') return !gamepadInput.aimActive && !gamepadInput.shoot;
  if (lastInputMode === 'touch') return !touchInput.attack && !touchInput.aimActive;
  return shouldKeyboardMovementSetFacing(length);
}

function updateParticles(dt) {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < particles.length; readIndex += 1) {
    const particle = particles[readIndex];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += (particle.gravity || 0) * dt;
    const drag = particle.streak ? 0.99 : 0.96;
    particle.vx *= drag;
    particle.vy *= drag;
    particle.ttl -= dt;
    if (particle.ttl <= 0) continue;
    particles[writeIndex] = particle;
    writeIndex += 1;
  }
  particles.length = writeIndex;
}



function update(dt) {
  if (hitStopTimer > 0) {
    const stoppedTime = Math.min(dt, hitStopTimer);
    hitStopTimer -= stoppedTime;
    dt -= stoppedTime;
    if (dt <= 0) return;
  }
  if (deathTimer > 0 && mode === 'playing') {
    deathTimer = Math.max(0, deathTimer - dt);
    if (deathTimer === 0) {
      mode = 'gameover';
      endScreenDelay = 0.6;
      showMessage('The sanctum claims another delver. Choose who descends next.', 5);
      updateHud();
      return;
    }
    dt *= 0.3;
  }
  elapsed += dt;
  if (cameraShake.remaining > 0) {
    cameraShake.remaining = Math.max(0, cameraShake.remaining - dt);
    cameraShake.phase += dt;
  }
  if (mode === 'playing') {
    save.playtimeSeconds += dt;
    runStats.seconds += dt;
    unlockPlaytimeItems();
    profileSaveTimer += dt;
    if (profileSaveTimer >= 10) {
      profileSaveTimer = 0;
      persistSave();
    }
    frostNovaCooldown = Math.max(0, frostNovaCooldown - dt);
    updateAutoFrost();
    killStreakTimer = Math.max(0, killStreakTimer - dt);
    if (killStreakTimer === 0) killStreak = 0;
    streakCallout.timer = Math.max(0, streakCallout.timer - dt);
    for (let index = messageToasts.length - 1; index >= 0; index -= 1) {
      messageToasts[index].timer -= dt;
      if (messageToasts[index].timer <= 0) messageToasts.splice(index, 1);
    }
    autosaveTimer += dt;
    if (autosaveTimer >= 12) {
      autosaveTimer = 0;
      saveRunState();
    }
  }
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0 && mode === 'playing') messageEl.textContent = '';
  }
  if (mode !== 'playing' || showMap || showStoryJournal) return;
  updateBreakables(dt);
  player.groundSlowTimer = Math.max(0, player.groundSlowTimer - dt);
  updateGroundHazards(dt);
  for (let index = lightningArcs.length - 1; index >= 0; index -= 1) {
    lightningArcs[index].ttl -= dt;
    if (lightningArcs[index].ttl <= 0) lightningArcs.splice(index, 1);
  }

  // A fallen delver no longer responds to input.
  const control = deathTimer > 0 ? 0 : 1;
  const keyboardMoveX = ((keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0)) * control;
  const keyboardMoveY = ((keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0)) * control;
  const moveX = clamp(keyboardMoveX + (gamepadInput.moveX + touchInput.moveX) * control, -1, 1);
  const moveY = clamp(keyboardMoveY + (gamepadInput.moveY + touchInput.moveY) * control, -1, 1);
  updateMouseAimHold(dt);
  const moveLength = Math.hypot(moveX, moveY);
  if (shouldMovementSetFacing(moveLength)) {
    player.lookX = moveX / moveLength;
    player.lookY = moveY / moveLength;
  }
  const length = Math.hypot(moveX, moveY) || 1;
  const groundSpeed = baseGroundSpeed() * (player.groundSlowTimer > 0 ? 0.55 : 1);
  player.moving = moveX !== 0 || moveY !== 0;
  dashCooldown = Math.max(0, dashCooldown - dt);
  weaponSwapCooldown = Math.max(0, weaponSwapCooldown - dt);
  if (dashTimer > 0) {
    dashTimer = Math.max(0, dashTimer - dt);
    player.x += dashVector.x * 620 * dt;
    player.y += dashVector.y * 620 * dt;
    if (Math.random() < 0.6) addParticles(player.x, player.y - 8, '#cfe8ff', 1, 30);
  } else {
    player.x += (moveX / length) * groundSpeed * dt;
    player.y += (moveY / length) * groundSpeed * dt;
  }
  if (player.windPush?.timer > 0) {
    player.windPush.timer -= dt;
    player.x += player.windPush.vx * dt;
    player.y += player.windPush.vy * dt;
  }
  if (player.knockback?.timer > 0) {
    // Velocity eases out over the shove so it reads as a jolt rather than a teleport.
    const falloff = player.knockback.timer / player.knockback.duration;
    player.knockback.timer -= dt;
    player.x += player.knockback.vx * falloff * dt;
    player.y += player.knockback.vy * falloff * dt;
  }
  if (player.hook) {
    const hooker = enemies.find((candidate) => candidate.kind === player.hook.kind);
    player.hook.timer -= dt;
    if (!hooker || player.hook.timer <= 0) {
      player.hook = null;
    } else {
      const pullX = hooker.x - player.x;
      const pullY = hooker.y - player.y;
      const pullDistance = Math.hypot(pullX, pullY) || 1;
      if (pullDistance <= hooker.radius + player.radius + 8) {
        // Reeled in: a heavy swing that knocks the player back a little.
        player.hook = null;
        damagePlayer(2, null);
        player.x -= (pullX / pullDistance) * 90;
        player.y -= (pullY / pullDistance) * 90;
        triggerCameraShake('groundPound');
      } else {
        player.x += (pullX / pullDistance) * 420 * dt;
        player.y += (pullY / pullDistance) * 420 * dt;
      }
    }
  }
  player.x = clamp(player.x, 12, ROOM_W - 12);
  player.y = clamp(player.y, 12, ROOM_H - 12);
  if (dt > 0) {
    const blend = Math.min(1, dt * 10);
    playerVelocity.x += ((player.x - lastPlayerSample.x) / dt - playerVelocity.x) * blend;
    playerVelocity.y += ((player.y - lastPlayerSample.y) / dt - playerVelocity.y) * blend;
    if (Math.hypot(playerVelocity.x, playerVelocity.y) > 700) {
      playerVelocity.x = 0;
      playerVelocity.y = 0;
    }
  }
  lastPlayerSample.x = player.x;
  lastPlayerSample.y = player.y;
  playerStillTimer = Math.hypot(playerVelocity.x, playerVelocity.y) < 45 ? playerStillTimer + dt : 0;
  updateStyleHeat(dt);
  updateLifestoneRegen(dt);
  updateInputAI(dt);
  updateBossStrikes(dt);
  resolveDoorCrossing();
  updateSandFootprints(dt);
  if (control) updateWalkInInteractions(dt);
  updateRewardTrial(dt);

  const attackStyle = currentAttackStyle();
  if (!control) {
    player.meleeCharge = 0;
    player.bowHold = 0;
  } else if (attackStyle === 'melee') updateMeleeInput(dt);
  else if (attackStyle === 'bow') {
    player.meleeCharge = 0;
    updateBowInput(dt);
  } else {
    player.meleeCharge = 0;
    player.bowHold = 0;
    updateMagicInput(dt);
  }
  if (player.spin) {
    player.spin.timer -= dt;
    if (player.spin.timer <= 0) {
      player.spin = null;
    } else {
      // Zelda-style spin: the body turns a full circle while the blade sweeps.
      const spinAngle = player.spin.angle + (1 - player.spin.timer / player.spin.duration) * Math.PI * 2;
      player.lookX = Math.cos(spinAngle);
      player.lookY = Math.sin(spinAngle);
    }
  }
  player.fireCooldown = Math.max(0, player.fireCooldown - dt * curioMultiplier('fire'));
  updateClassSignature(dt);
  updateChaos(dt);
  player.damageFlashTimer = Math.max(0, player.damageFlashTimer - dt);
  hurtVignetteTimer = Math.max(0, hurtVignetteTimer - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.attackPulse = Math.max(0, player.attackPulse - dt);
  player.attackAnimationTimer = Math.max(0, player.attackAnimationTimer - dt);
  player.swordParryTimer = Math.max(0, player.swordParryTimer - dt);
  if (player.swordParryTimer === 0) player.swordParryRadius = 0;
  player.swordParryFlash = Math.max(0, player.swordParryFlash - dt);
  updateMeleeProjectileParry();

  for (const enemy of enemies) {
    updateEnemy(enemy, dt);
    if (!enemy.manaRift && !enemy.manaSlam && distanceBetween(player, enemy) < enemy.radius + player.radius + 2) {
      if (player.invuln <= 0 && enemy.behavior === 'roll') triggerCameraShake('charge');
      damagePlayer(contactDamage(enemy), enemy);
    }
  }
  updateMeleeBladeContacts();
  player.meleeSwings = player.meleeSwings.filter((swing) => {
    swing.timer -= dt;
    return swing.timer > 0;
  });
  updateCompanions(dt);
  updateOrbitGuards(dt);

  for (const obstacle of breakables) {
    if (obstacle.broken) continue;
    const obstacleDistance = distanceBetween(player, obstacle);
    const minimumDistance = player.radius + obstacle.radius;
    if (obstacleDistance < minimumDistance) {
      const pushX = obstacleDistance === 0 ? 1 : (player.x - obstacle.x) / obstacleDistance;
      const pushY = obstacleDistance === 0 ? 0 : (player.y - obstacle.y) / obstacleDistance;
      player.x += pushX * (minimumDistance - obstacleDistance);
      player.y += pushY * (minimumDistance - obstacleDistance);
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    if (projectile.type === 'charge-beam') {
      if (updateChargeBeamProjectile(projectile, dt)) projectiles.splice(i, 1);
      continue;
    }
    projectile.previousX = projectile.x;
    projectile.previousY = projectile.y;
    updateWildMagicFlight(projectile, dt);
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.ttl -= dt;
    projectile.trailTimer -= dt;
    const wallPadding = ROOM_WALL_THICKNESS + (projectile.radius || 0);
    if (projectile.x < wallPadding || projectile.x > ROOM_W - wallPadding ||
        projectile.y < wallPadding || projectile.y > ROOM_H - wallPadding) {
      projectile.x = clamp(projectile.x, wallPadding, ROOM_W - wallPadding);
      projectile.y = clamp(projectile.y, wallPadding, ROOM_H - wallPadding);
      triggerMagicCluster(projectile);
      triggerWildMagicImpact(projectile);
      applyMorphLanding(projectile, null);
      projectiles.splice(i, 1);
      continue;
    }
    if (strikeBombWithProjectile(projectile, dt)) {
      triggerMagicCluster(projectile);
      projectiles.splice(i, 1);
      continue;
    }
    if (projectile.trailTimer <= 0) {
      if (particles.length < (quality.low ? MAX_PARTICLES_LOW : MAX_PARTICLES)) particles.push({
        x: projectile.x, y: projectile.y,
        vx: -projectile.vx * 0.08 + (Math.random() - 0.5) * 20,
        vy: -projectile.vy * 0.08 + (Math.random() - 0.5) * 20,
        color: projectile.color,
        radius: 1.5 + Math.random() * 2,
        ttl: 0.2,
        maxTtl: 0.2,
      });
      projectile.trailTimer = 0.035;
    }
    const rockIndex = breakables.findIndex((rock) => rock !== projectile.ignoreObstacle && !rock.broken &&
      !(projectile.piercesWalls && rock.type === 'solid') &&
      distanceBetween(projectile, rock) < projectile.radius + rock.radius);
    const enemy = enemies.find((candidate) => !candidate.manaRift &&
      !(projectile.hitEnemies && projectile.hitEnemies.includes(candidate)) &&
      distanceBetween(projectile, candidate) < projectile.radius + candidate.radius);
    if (rockIndex >= 0) {
      triggerMagicCluster(projectile, null, breakables[rockIndex]);
      triggerWildMagicImpact(projectile);
      damageObstacle(breakables[rockIndex], 1, 'projectile');
      applyMorphLanding(projectile, null);
      projectiles.splice(i, 1);
    } else if (enemy) {
      const hpBeforeHit = enemy.hp;
      if (projectile.element) resolveElementalImpact(projectile, enemy);
      else damageEnemy(enemy, projectile.damage,
        projectile.x - projectile.vx * 0.02, projectile.y - projectile.vy * 0.02,
        false, projectile.type !== 'elemental');
      rewardArrowParryHit(projectile, enemy, hpBeforeHit);
      triggerMagicCluster(projectile, enemy);
      triggerWildMagicImpact(projectile, enemy);
      // Brief, throttled freeze so ranged hits land with weight without stalling rapid fire.
      if (projectile.owner === 'player' && projectile.type !== 'elemental') {
        triggerHitStop(enemy.hp <= 0 ? 0.06 : 0.04, 0.16);
      }
      if (projectile.type === 'arrow' && projectile.owner === 'player') {
        enemy.slowTimer = Math.max(enemy.slowTimer || 0, 1.1);
        addParticles(projectile.x, projectile.y, projectile.color, 16, 155);
        addParticles(projectile.x, projectile.y, '#fff3d9', 7, 100);
      }
      if (projectile.type === 'spore-shard') {
        enemy.slowTimer = Math.max(enemy.slowTimer || 0, 0.75);
      }
      if (projectile.slowOnHit) enemy.slowTimer = Math.max(enemy.slowTimer || 0, projectile.slowOnHit);
      if (projectile.chain) chainLightningFrom(enemy, projectile.damage, projectile.chain, projectile.type === 'elemental');
      applyMorphLanding(projectile, enemy, projectile.type === 'elemental');
      addParticles(projectile.x, projectile.y, projectile.color, 6, 100);
      if (projectile.pierce > 0) {
        projectile.pierce -= 1;
        (projectile.hitEnemies ||= []).push(enemy);
        projectile.damage = Math.max(1, Math.round(projectile.damage * 0.85));
      } else {
        projectiles.splice(i, 1);
      }
    } else if (projectile.ttl <= 0 || projectile.x < 0 || projectile.x > ROOM_W || projectile.y < 0 || projectile.y > ROOM_H) {
      if (projectile.x < 0 || projectile.x > ROOM_W || projectile.y < 0 || projectile.y > ROOM_H) {
        triggerMagicCluster(projectile);
      }
      applyMorphLanding(projectile, null);
      projectiles.splice(i, 1);
    }
  }

  for (let i = enemyProjectiles.length - 1; i >= 0; i -= 1) {
    const projectile = enemyProjectiles[i];
    if (!projectile) continue;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.ttl -= dt;
    if (strikeBombWithProjectile(projectile, dt)) {
      enemyProjectiles.splice(i, 1);
      continue;
    }
    if (updateMeleeProjectileParry(i, dt)) continue;
    let arrowDeflected = false;
    for (const arrow of projectiles) {
      if (arrow.type === 'arrow' && arrow.owner === 'player' && deflectArrowTipProjectile(arrow, projectile, dt)) {
        arrowDeflected = true;
        break;
      }
    }
    if (arrowDeflected) {
      enemyProjectiles.splice(i, 1);
      continue;
    }
    if (projectile.kind === 'spore-orb') {
      projectile.clusterFuse -= dt;
      if (projectile.clusterFuse <= 0) {
        burstClusterOrb(projectile);
        enemyProjectiles.splice(i, 1);
      } else if (projectile.ttl <= 0 || projectile.x < 32 || projectile.x > ROOM_W - 32 ||
        projectile.y < 32 || projectile.y > ROOM_H - 32) {
        enemyProjectiles.splice(i, 1);
      }
      continue;
    }
    const blockedByObstacle = breakables.some((obstacle) => !obstacle.broken &&
      distanceBetween(projectile, obstacle) < obstacle.radius + projectile.radius);
    const specialHazard = projectile.kind === 'venom' ? 'acid'
      : projectile.kind === 'web-glob' || projectile.kind === 'ice-orb' ? 'web'
        : projectile.kind === 'void-orb' ? 'miasma' : null;
    const hitsPlayer = distanceBetween(player, projectile) < player.radius + projectile.radius;
    const projectileExpired = projectile.ttl <= 0 || projectile.x < 32 || projectile.x > ROOM_W - 32 ||
      projectile.y < 32 || projectile.y > ROOM_H - 32;
    if (blockedByObstacle) {
      enemyProjectiles.splice(i, 1);
    } else if (shieldWithCompanion(projectile)) {
      enemyProjectiles.splice(i, 1);
    } else if (specialHazard && (hitsPlayer || projectileExpired)) {
      const withinRoom = projectile.x >= 48 && projectile.x <= ROOM_W - 48 &&
        projectile.y >= 48 && projectile.y <= ROOM_H - 48;
      if (hitsPlayer) createGroundHazard(player.x, player.y, specialHazard);
      else if (withinRoom) createGroundHazard(projectile.x, projectile.y, specialHazard);
      addParticles(projectile.x, projectile.y, projectile.color, 6, 55);
      enemyProjectiles.splice(i, 1);
    } else if (projectile.kind === 'hook' && hitsPlayer) {
      player.hook = { kind: projectile.ownerKind, timer: 1.2 };
      addParticles(projectile.x, projectile.y, projectile.color, 6, 80);
      enemyProjectiles.splice(i, 1);
    } else if (hitsPlayer) {
      damagePlayer(0.5, projectile);
      enemyProjectiles.splice(i, 1);
    } else if (projectileExpired) {
      enemyProjectiles.splice(i, 1);
    }
  }

  updateParticles(dt);

  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pickup = pickups[i];
    if (pickup.kind === 'lore-relic') continue;
    if (pickup.kind === 'xp') {
      const pull = distanceBetween(player, pickup);
      if (pull < 130 && pull > player.radius + 14) {
        pickup.x += ((player.x - pickup.x) / pull) * 360 * dt;
        pickup.y += ((player.y - pickup.y) / pull) * 360 * dt;
        continue;
      }
    }
    if (distanceBetween(player, pickup) > player.radius + 14) {
      pickup.refused = false;
      continue;
    }
    if (pickup.kind === 'heart' && player.hp >= player.maxHp) continue;
    if (pickup.kind === 'xp') {
      playPickupSound('exp', 0.12, 90);
      gainXp(1);
    }
    if (pickup.kind === 'upgrade') {
      // A refused upgrade stays on the floor; it is offered again once the player steps off it.
      if (pickup.refused) continue;
      if (!grantUpgrade(pickup.item)) {
        pickup.refused = true;
        continue;
      }
      if (pickup.room) pickup.room.rewardClaimed = true;
    }
    if (pickup.kind === 'coin') {
      coins += 1;
      runStats.zenyFound += 1;
      playPickupSound('gp', 0.25);
    }
    if (pickup.kind === 'material' && materialCatalog[pickup.material]) {
      materials[pickup.material] += 1;
      playPickupSound('gp', 0.2);
      popOverPlayer({ icon: 'item', color: '#ffe38a', image: shopItemIconImages[materialCatalog[pickup.material].id] });
    }
    if (pickup.kind === 'heart') {
      player.hp = Math.min(player.maxHp, player.hp + 1);
      playPickupSound('heal', 0.35);
      popOverPlayer({ icon: 'heart', color: '#ff7b8e' });
    }
    if (pickup.kind === 'key') {
      keysHeld += 1;
      popOverPlayer({ icon: 'key', color: '#ffe18b' });
    }
    if (pickup.kind === 'bomb') {
      bombsHeld += 1;
      popOverPlayer({ icon: 'bomb', color: '#f2c774' });
    }
    if (pickup.kind === 'consumable') {
      collectConsumable(pickup.item);
      popOverPlayer({ icon: 'item', color: '#ffe38a', image: shopItemIconImages[pickup.item.id] });
    }
    if (pickup.kind === 'curio') {
      if (ownedItems.has(pickup.item.id)) {
        pickups.splice(i, 1);
        continue;
      }
      if (pickup.refused) continue;
      if (!grantUpgrade(pickup.item, 'drop')) {
        pickup.refused = true;
        continue;
      }
    }
    if (pickup.guaranteedTreasure && pickup.room) pickup.room.treasureClaimed = true;
    pickups.splice(i, 1);
    updateHud();
  }

  for (let i = bombs.length - 1; i >= 0; i -= 1) {
    const bomb = bombs[i];
    if (!bomb) continue;
    if (bomb.flightTimer > 0) {
      bomb.flightTimer = Math.max(0, bomb.flightTimer - dt);
      const progress = 1 - bomb.flightTimer / bomb.flightDuration;
      bomb.x = bomb.startX + (bomb.targetX - bomb.startX) * progress;
      bomb.y = bomb.startY + (bomb.targetY - bomb.startY) * progress;
      if (bomb.flightTimer === 0) {
        bomb.x = bomb.targetX;
        bomb.y = bomb.targetY;
      }
    } else {
      updateBombMotion(bomb, dt);
      bomb.fuse -= dt;
    }
    if ((bomb.flightTimer === undefined || bomb.flightTimer <= 0) && bomb.fuse <= 0) {
      explodeBomb(bomb);
      // The blast may kill a boss, whose cleanup removes enemy bombs and shifts indices.
      const bombIndex = bombs.indexOf(bomb);
      if (bombIndex >= 0) bombs.splice(bombIndex, 1);
    }
  }

  if (enemies.length === 0 && !currentRoom.cleared && currentRoom.type !== 'start' && currentRoom.type !== 'shop') {
    currentRoom.cleared = true;
    grantOrbitGuardChargeUp(currentRoom);
    if (['miniboss', 'shrine'].includes(currentRoom.type)) addRoomRewardPickup(currentRoom);
    if (currentRoom.type === 'riskShrine') completeRiskShrineAmbush(currentRoom);
    if (currentRoom.type === 'boss') {
      showMessage('The guardian is defeated. The seal opens; the descent continues.', 5);
    } else {
      popOverPlayer({ icon: 'unlock', color: '#8fe39a' });
      playSound('som:alteration/quest-update.ogg', 0.3);
    }
  }
  updateHud();
}





// Colour of the element currently infusing a weapon style, or null when it is plain.

// Arc-reactor style chest glow in the element's colour; only visible from the front.







const hatImages = {};

// Hats mark what the delver has picked up; the newest powerup's hat is worn. Sporelings keep to the shroom family.
const powerHatByItem = {
  'element-fire': 'candlehelmet', 'element-lightning': 'funkyhat', 'element-gas': 'wickedshroomhat',
  'frost-rune': 'earmuffs', 'bonded-aegis': 'crusadehelmet', 'spore-bloom': 'forestshroomhat',
  'mod-windup': 'standardheadband', 'mod-flurry': 'bandana', 'mod-cinder': 'pumpkinhat',
  'mod-pierce': 'bountyhunterhelmet', 'mod-draw': 'brimmedfeatherhat', 'mod-quiver': 'trapperhat',
  'mod-storm-arrows': 'funkyhat', 'mod-splash': 'alchemisthelmet', 'mod-chain': 'magictophat',
  'mod-lingering': 'witchhat', 'iron-sword': 'vikinghelmet', 'swift-daggers': 'assassinhood',
  'heart-vessel-iii': 'crown', 'luck-up-ii': 'leprechaunhat', 'curio-hot-take': 'bull',
  'curio-sole': 'bunnyears', 'curio-trigger': 'bhopcap', 'curio-heavy-metal': 'bucket',
  'curio-mana-cafe': 'chefhat', 'curio-dice': 'fancyhat', 'curio-wild-card': 'operamask',
  'ammo-mana': 'moonshroomhat', 'ammo-arrows': 'farmerhat', 'ammo-blows': 'centurionhelmet',
};
const shroomHatByItem = {
  'element-gas': 'wickedshroomhat', 'mod-lingering': 'wickedshroomhat', 'ammo-mana': 'moonshroomhat',
  'frost-rune': 'moonshroomhat', 'element-lightning': 'moonshroomhat',
};
const classHats = {
  Mage: 'wizardhat', Warrior: 'samuraihelmet', Rogue: 'assassinhood', Scout: 'bandana', Pilgrim: 'browndeserthat',
  Herbalist: 'wreath', Sapper: 'centurionhelmet', Scholar: 'graduationcap', Scribe: 'brimmedfeatherhat',
  Delver: 'minerhat', Keeper: 'darkhelm', Guard: 'soldierhelmet', Ranger: 'brimmedhat', Oracle: 'fairyhat',
  Reclaimer: 'earmuffs', Warden: 'antlerhat', Veteran: 'warlordhelmet', Sporeling: 'shroomhat',
};






const menhirPuns = [
  'Home is where the respawn is. Rock solid advice.',
  "I'm a menhir of few words. Mostly 'ow' when mushrooms sit on me.",
  "The Mana World devs said 'ship it'. Then 'patch it'. Then 'who wrote this?' Classic.",
  "Stone-cold truth: I've been here since the first commit, and I'm still not merged.",
  'Looking for the Mana Tree? Take a left at the bug, a right at the feature.',
  "Don't take me for granite. Come back alive and I'll rock your world.",
  'Tulimshar has sand, Hurnscald has trees, I have a stunning lack of legs.',
  'They fixed lag on the server, but I still have lag on my stone-ing.',
  "Every great volunteer project needs a landmark. I'm the one that doesn't need a patch.",
  "Some delvers come back heroes. Others come back as a pun. Weirdly, you're both.",
  "I'd offer you a quest, but the GMs are still arguing over the typo.",
  'Be careful down there. Even the slimes have better uptime than the wiki.',
];
let menhirPunIndex = 0;






// Text over busy ground or art gets a dark outline: every fillText inside fn is stroked first.



// Marks heart, coin, bomb, and special items left behind in a room, one per corner.



// Larger rooms are drawn larger on the maps; unvisited rooms stay a uniform size so they don't leak details.


let resetConfirmTimer = 0;
let menuFocus = 'start';
let previousMenuVertical = 0;




















let controlsTab = 'key';
let controlsRow = 0;
let controlsCapture = false;
let controlsReturnMode = 'select';
const CONTROLS_ROW_H = 21;



















let tutorialPage = 0;









// Tunnel vision: darkness closes in from the screen edges around the player, then fades out.

function draw() {
  applyRenderScale();
  if (mode === 'prologue') {
    drawPrologue();
    return;
  }
  if (mode === 'chapter') {
    drawChapter();
    return;
  }
  if (mode === 'select') {
    drawCharacterSelect();
    return;
  }
  if (mode === 'codex') {
    drawCodex();
    return;
  }
  if (mode === 'tutorial') {
    drawTutorial();
    return;
  }
  if (mode === 'controls') {
    drawControls();
    return;
  }
  const shake = getCameraShakeOffset();
  camera.x = clamp(player.x - VIEW_W / 2, 0, Math.max(0, ROOM_W - VIEW_W));
  camera.y = clamp(player.y - VIEW_H / 2, 0, Math.max(0, ROOM_H - VIEW_H));
  ctx.save();
  ctx.translate(shake.x - Math.round(camera.x), shake.y - Math.round(camera.y));
  withTextOutline(drawWorld);
  ctx.restore();
  drawRegionAtmosphere();
  if (mode === 'playing' && hurtVignetteTimer > 0) drawHurtVignette(shake);
  if (mode === 'playing') {
    withTextOutline(() => {
      drawMinimap();
      drawGameHud();
      drawStyleSlots();
      drawActionBar();
      drawInGameCommentary();
    });
  }
  if (showStoryJournal) drawStoryJournal();
  if (mode === 'paused') drawPauseOverlay();
  if (showMap) drawMap();
  if (mode === 'gameover') drawRunSummary('THE SANCTUM CLAIMS YOU');
  if (mode === 'won') drawRunSummary('THE MANA FLOWS AGAIN');

  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(10, 9, 14, 0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawManaPanel(100, 154, VIEW_W - 200, 246);
    ctx.fillStyle = '#f1dec1';
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px Georgia';
    ctx.fillText('DESCENT PAUSED', VIEW_W / 2, VIEW_H / 2 - 50);
    ctx.font = '17px Arial';
    ctx.fillText(`${lastInputMode === 'controller' ? 'Start or A' : 'P or R'} · Resume`, VIEW_W / 2, VIEW_H / 2);
    ctx.fillText(lastInputMode === 'controller' ? 'B · Save and exit  ·  Back · Controls' : 'X · Save and exit  ·  C · Controls',
      VIEW_W / 2, VIEW_H / 2 + 34);
    ctx.fillText(lastInputMode === 'controller'
      ? 'Audio & narration: D-pad ▲ to the top-left panel, ◄ ► to adjust'
      : 'Music and effects volume: click or drag the sliders at top left', VIEW_W / 2, VIEW_H / 2 + 68);
    ctx.fillText('Your rooms and progress are saved automatically.', VIEW_W / 2, VIEW_H / 2 + 98);
    drawPauseEquipment();
    drawAudioPanel();
    drawAdaptiveToggle();
  }

}


function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.1);
  lastTime = timestamp;
  if (document.visibilityState === 'visible') updateQuality(dt);
  resetConfirmTimer = Math.max(0, resetConfirmTimer - dt);
  newRunConfirmTimer = Math.max(0, newRunConfirmTimer - dt);
  endScreenDelay = Math.max(0, endScreenDelay - dt);
  if (chapterQueue.length > 0 && !activeChapter && (mode === 'select' ||
      (mode === 'playing' && enemies.length === 0 && !showMap && !showStoryJournal))) {
    openChapter();
  }
  pollGamepad();
  updateTouchControls();
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function runAction(id, options = {}) {
  if (deathTimer > 0) return;
  // While the full map is open, only the map toggle works and interact travels to the selected room.
  if (showMap && mode === 'playing' && id !== 'map') {
    if (id === 'interact') travelToMapCursor();
    return;
  }
  if (id === 'interact') {
    interact(Boolean(options.shift));
    return;
  }
  if (mode !== 'playing') return;
  switch (id) {
    case 'dash': startDash(); break;
    case 'bomb': placeBomb(); break;
    case 'item': useConsumable(); break;
    case 'shock': useOrbitGuard(); break;
    case 'ability': useClassSignature(); break;
    case 'nextWeapon': cycleCombatStyle(); break;
    case 'weapon1': selectCombatStyle('melee'); break;
    case 'weapon2': selectCombatStyle('bow'); break;
    case 'weapon3': selectCombatStyle('magic'); break;
    case 'map': if (showMap) closeMap(); else openMap(); break;
    case 'journal': showStoryJournal = !showStoryJournal; break;
    case 'withdraw': interact(true); break;
    default: break;
  }
}

function openMap() {
  showMap = true;
  mapCursor = currentRoom;
  mapOpenedAt = elapsed;
  suppressHeldAttackInput();
}

function closeMap() {
  if (showMap && canvas?.style) canvas.style.cursor = 'crosshair';
  showMap = false;
  mapCursor = null;
}

// Moves the map cursor to the nearest revealed room in a direction, favouring rooms in line.
function stepMapCursor(dx, dy) {
  const from = mapCursor && rooms.includes(mapCursor) ? mapCursor : currentRoom;
  let best = null;
  let bestScore = Infinity;
  for (const room of rooms) {
    if (room === from || !roomIsRevealed(room)) continue;
    const along = (room.x - from.x) * dx + (room.y - from.y) * dy;
    if (along <= 0) continue;
    const across = Math.abs((room.x - from.x) * dy) + Math.abs((room.y - from.y) * dx);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = room;
    }
  }
  if (best) mapCursor = best;
}

function travelToMapCursor() {
  if (!mapCursor || mapCursor === currentRoom) return;
  if (!travelToRoom(mapCursor)) playSound('system/click.ogg', 0.2);
}

function chooseCharacter(key) {
  const delta = key === 'ArrowRight' || key === 'd' ? 1 : -1;
  selectedIndex = (selectedIndex + delta + characterRoster.length) % characterRoster.length;
  updateHud();
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  setInputMode('keyboard');
  updateControlsHint();
  startGameMusic();
  keys[event.key] = true;
  keys[key] = true;
  if (event.key === ' ' || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) ||
      (event.key === 'Tab' && (mode === 'playing' || mode === 'controls'))) event.preventDefault();
  if (event.repeat) return;
  if (event.key === 'Enter' && event.altKey) {
    event.preventDefault();
    toggleFullscreen();
    return;
  }
  if (ttsPromptActive()) {
    if (key === 'y' || event.key === 'Enter') setTextToSpeech(true);
    else if (key === 'n' || event.key === 'Escape') setTextToSpeech(false);
    return;
  }
  if (mode === 'controls') {
    handleControlsKey(event, key);
    return;
  }
  if (NARRATION_ENABLED && key === 't' && (mode === 'prologue' || mode === 'select' || mode === 'paused' || mode === 'chapter')) {
    setTextToSpeech(audioSettings.tts !== true);
    return;
  }
  if (mode === 'prologue') {
    if (event.key === 'ArrowLeft' || key === 'a') advancePrologue(-1);
    else if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ' || key === 'd') {
      advancePrologue(1);
    }
    return;
  }

  if (mode === 'chapter') {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape' || event.key === 'ArrowRight' || key === 'e') closeChapter();
    return;
  }

  if (mode === 'codex') {
    if (key === 'k' || event.key === 'Escape' || key === 'b') closeCodex();
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') toggleCodexTab(event.key === 'ArrowRight' ? 1 : -1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      codexScroll = clamp(codexScroll + direction, 0, Math.max(0, codexEntries().length - 7));
    }
    return;
  }

  if (mode === 'tutorial') {
    if (key === 'h' || event.key === 'Escape' || key === 'b') closeTutorial();
    else if (event.key === 'ArrowLeft' || key === 'a') stepTutorial(-1);
    else if (event.key === 'ArrowRight' || key === 'd' || event.key === 'Enter') stepTutorial(1);
    return;
  }

  if (mode === 'paused') {
    if (key === 'p' || event.key === 'Escape' || key === 'r') resumeGame();
    else if (key === 'x') exitToTitle();
    else if (key === 'c') openControls('paused');
    else if (key === 'e') toggleAdaptiveEnemies();
    return;
  }
  if (mode === 'playing' && showMap) {
    const mapAction = actionForKey(key);
    const step = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
      arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[key];
    if (step) stepMapCursor(...step);
    else if (event.key === 'Enter' || event.key === ' ' || mapAction === 'interact') travelToMapCursor();
    else if (event.key === 'Escape' || mapAction === 'map') closeMap();
    else if (key === 'p') pauseGame();
    return;
  }
  if (mode === 'playing' && (key === 'p' || event.key === 'Escape')) {
    pauseGame();
    return;
  }
  if (mode === 'select') {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || key === 'a' || key === 'd') chooseCharacter(event.key.toLowerCase() === 'd' ? 'd' : event.key);
    if (key === 'r' && hasSavedRun()) restoreRun();
    if (key === 'k') openCodex();
    if (key === 'h') openTutorial();
    if (key === 'c') openControls('select');
    if (key === 'p') openPrologue();
    if (event.key === 'Delete') requestProgressReset();
    if (event.key === 'Enter') requestNewRun();
    return;
  }
  if ((mode === 'gameover' || mode === 'won') && event.key === 'Enter') {
    returnToCharacterSelect();
    return;
  }
  const keyAction = actionForKey(key);
  if (keyAction) runAction(keyAction, { shift: event.shiftKey });
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  keys[event.key] = false;
  keys[key] = false;
});

// Fullscreen covers the whole page; the DOM bars hide and the stage grows to fill the screen.
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

const fullscreenButton = document.getElementById('fullscreen');

fullscreenButton?.addEventListener('click', () => {
  toggleFullscreen();
  // Drop focus so Space and Enter keep their game meaning instead of pressing the button again.
  fullscreenButton.blur();
});

function clearHeldInputs() {
  for (const key of Object.keys(keys)) keys[key] = false;
  resetTouchInput();
  pointer.down = false;
  player.meleeCharge = 0;
  gamepadInput.moveX = 0;
  gamepadInput.moveY = 0;
  gamepadInput.shoot = false;
  attackInputSuppressed = false;
}

function suppressHeldAttackInput() {
  attackInputSuppressed = pointer.down || gamepadInput.shoot || touchInput.attack;
  player.meleeCharge = 0;
  player.meleeBuffer = null;
  player.bowHold = 0;
  player.magicHold = 0;
  player.chargeFraction = 0;
}

function releaseAttackInputSuppressionIfIdle() {
  if (!pointer.down && !gamepadInput.shoot && !touchInput.attack) attackInputSuppressed = false;
}

window.addEventListener('blur', () => {
  clearHeldInputs();
  if (mode === 'playing') pauseGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearHeldInputs();
    if (mode === 'playing') pauseGame();
  }
});

function updatePointerPosition(event) {
  gamepadInput.aimActive = false;
  updateControlsHint();
  // Measure from the content box so the canvas border doesn't offset the pointer.
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left - canvas.clientLeft) / canvas.clientWidth) * VIEW_W;
  pointer.y = ((event.clientY - rect.top - canvas.clientTop) / canvas.clientHeight) * VIEW_H;
  if (mode === 'playing' && showMap) {
    const room = mapRoomAt(pointer.x, pointer.y);
    if (room && event.pointerType === 'mouse') mapCursor = room;
    canvas.style.cursor = room && mapTravelRoutes().has(room) ? 'pointer' : 'default';
    return;
  }
  if (event.pointerType === 'mouse' && mode === 'playing') {
    mouseAimActive = true;
    mouseAimIdleTimer = 0;
    const dx = pointer.x + camera.x - player.x;
    const dy = pointer.y + camera.y - (player.y - 34);
    const length = Math.hypot(dx, dy) || 1;
    player.lookX = dx / length;
    player.lookY = dy / length;
  }
  if (audioSliderDragging) setVolumeFromPointer(pointer.x);
  if (ttsPromptActive()) {
    canvas.style.cursor = [true, false].some((yes) => {
      const b = ttsPromptBounds(yes);
      return pointer.x >= b.x && pointer.x <= b.x + b.width && pointer.y >= b.y && pointer.y <= b.y + b.height;
    }) ? 'pointer' : 'default';
    return;
  }
  if ((mode === 'prologue' || mode === 'select' || mode === 'paused') && (audioSliderDragging || pointerOverAudioPanel())) {
    canvas.style.cursor = 'pointer';
    return;
  }
  if (mode === 'paused' && pointInBounds(adaptiveToggleBounds())) {
    canvas.style.cursor = 'pointer';
    return;
  }
  if (mode === 'prologue') {
    const previous = prologueButtonBounds(-1);
    const next = prologueButtonBounds(1);
    canvas.style.cursor = [previous, next].some((bounds) =>
      pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
      pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height) ? 'pointer' : 'default';
  } else if (mode === 'select') {
    const pageStart = Math.floor(selectedIndex / rosterPageSize) * rosterPageSize;
    const overCard = characterRoster.slice(pageStart, pageStart + rosterPageSize).some((entry, pageIndex) => {
      const bounds = characterCardBounds(pageIndex);
      return pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
        pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
    });
    const start = characterStartBounds();
    const overStart = pointer.x >= start.x && pointer.x <= start.x + start.width &&
      pointer.y >= start.y && pointer.y <= start.y + start.height;
    const codex = codexButtonBounds();
    const overCodex = pointer.x >= codex.x && pointer.x <= codex.x + codex.width &&
      pointer.y >= codex.y && pointer.y <= codex.y + codex.height;
    const overButton = pointInBounds(prologueReplayBounds()) ||
      [-1, 1].some((direction) => pointInBounds(rosterPageButtonBounds(direction)));
    canvas.style.cursor = overCard || overStart || overCodex || overButton ? 'pointer' : 'default';
  } else {
    canvas.style.cursor = 'crosshair';
  }
}

canvas.addEventListener('pointermove', updatePointerPosition);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
let lastWheelSwitch = 0;
canvas.addEventListener('wheel', (event) => {
  if (mode !== 'playing' || deathTimer > 0) return;
  event.preventDefault();
  const now = performance.now();
  if (now - lastWheelSwitch < 180 || event.deltaY === 0) return;
  lastWheelSwitch = now;
  cycleCombatStyle(event.deltaY > 0 ? 1 : -1);
}, { passive: false });
canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary) return;
  updatePointerPosition(event);
  if (mode === 'playing' && showMap) {
    event.preventDefault();
    if (event.button !== 0) return;
    const room = mapRoomAt(pointer.x, pointer.y);
    if (!room) return;
    // A touch tap selects first and travels on a second tap; a mouse click travels at once.
    const confirm = event.pointerType !== 'touch' || room === mapCursor;
    mapCursor = room;
    if (confirm) travelToMapCursor();
    return;
  }
  if (event.button === 2 && mode === 'playing') {
    event.preventDefault();
    useClassSignature();
    return;
  }
  if (event.button !== 0) return;
  if (mode === 'paused' && pointInBounds(adaptiveToggleBounds())) {
    toggleAdaptiveEnemies();
    return;
  }
  if (mode === 'paused' && !pointerOverAudioPanel()) {
    if (pointer.y < VIEW_H / 2 + 14) resumeGame();
    else exitToTitle();
    return;
  }
  if (mode === 'codex') {
    if (pointer.y >= 132 && pointer.y <= 160) {
      codexTab = pointer.x < 196 ? 'items' : pointer.x < 328 ? 'enemies' : 'lore';
      codexScroll = 0;
    } else if (pointer.y > VIEW_H - 68) {
      closeCodex();
    } else {
      codexScroll = clamp(codexScroll + (pointer.y > VIEW_H / 2 ? 1 : -1), 0, Math.max(0, codexEntries().length - 7));
    }
    return;
  }
  if (mode === 'controls') {
    updatePointerPosition(event);
    handleControlsPointer();
    return;
  }
  if (mode === 'tutorial') {
    for (const which of ['prev', 'next', 'close']) {
      const b = tutorialNavBounds(which);
      if (pointer.x >= b.x && pointer.x <= b.x + b.width && pointer.y >= b.y && pointer.y <= b.y + b.height) {
        if (which === 'close') closeTutorial();
        else stepTutorial(which === 'next' ? 1 : -1);
      }
    }
    return;
  }
  if (event.button !== 0 || !event.isPrimary) return;
  setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard');
  if (event.pointerType === 'touch') mouseAimActive = false;
  else if (mode === 'playing') mouseAimActive = true;
  updateControlsHint();
  startGameMusic();
  updatePointerPosition(event);
  if (ttsPromptActive()) {
    for (const yes of [true, false]) {
      const b = ttsPromptBounds(yes);
      if (pointer.x >= b.x && pointer.x <= b.x + b.width && pointer.y >= b.y && pointer.y <= b.y + b.height) {
        setTextToSpeech(yes);
      }
    }
    return;
  }
  if ((mode === 'prologue' || mode === 'select' || mode === 'paused') && handleAudioPanelPointerDown(pointer.x, pointer.y)) {
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (mode === 'prologue') {
    const previous = prologueButtonBounds(-1);
    const next = prologueButtonBounds(1);
    if (pointer.x >= previous.x && pointer.x <= previous.x + previous.width &&
        pointer.y >= previous.y && pointer.y <= previous.y + previous.height) advancePrologue(-1);
    else if (pointer.x >= next.x && pointer.x <= next.x + next.width &&
        pointer.y >= next.y && pointer.y <= next.y + next.height) advancePrologue(1);
    return;
  }
  if (mode === 'chapter') {
    closeChapter();
    return;
  }
  if (mode === 'gameover' || mode === 'won') {
    returnToCharacterSelect();
    return;
  }
  if (mode === 'select') {
    if (pointInBounds(helpButtonBounds())) {
      toggleControlsHelp();
      return;
    }
    if (pointInBounds(prologueReplayBounds())) {
      openPrologue();
      return;
    }
    for (const direction of [-1, 1]) {
      if (pointInBounds(rosterPageButtonBounds(direction))) {
        changeRosterPage(direction);
        return;
      }
    }
    const codex = codexButtonBounds();
    if (pointer.x >= codex.x && pointer.x <= codex.x + codex.width &&
        pointer.y >= codex.y && pointer.y <= codex.y + codex.height) {
      openCodex();
      return;
    }
    const tutorialBtn = tutorialButtonBounds();
    if (pointer.x >= tutorialBtn.x && pointer.x <= tutorialBtn.x + tutorialBtn.width &&
        pointer.y >= tutorialBtn.y && pointer.y <= tutorialBtn.y + tutorialBtn.height) {
      openTutorial();
      return;
    }
    if (pointInBounds(controlsButtonBounds())) {
      openControls('select');
      return;
    }
    const reset = resetButtonBounds();
    if (pointer.x >= reset.x && pointer.x <= reset.x + reset.width &&
        pointer.y >= reset.y && pointer.y <= reset.y + reset.height) {
      requestProgressReset();
      return;
    }
    const resume = resumeRunBounds();
    if (hasSavedRun() && pointer.x >= resume.x && pointer.x <= resume.x + resume.width &&
        pointer.y >= resume.y && pointer.y <= resume.y + resume.height) {
      restoreRun();
      return;
    }
    const start = characterStartBounds();
    if (pointer.x >= start.x && pointer.x <= start.x + start.width &&
      pointer.y >= start.y && pointer.y <= start.y + start.height) {
      requestNewRun();
      return;
    }
    if (event.pointerType === 'touch' && pointer.y >= 100 && pointer.y <= 416 &&
        (pointer.x < 70 || pointer.x > VIEW_W - 70)) {
      chooseCharacter(pointer.x < 70 ? 'ArrowLeft' : 'ArrowRight');
      return;
    }
    const pageStart = Math.floor(selectedIndex / rosterPageSize) * rosterPageSize;
    const selectedPageIndex = characterRoster.slice(pageStart, pageStart + rosterPageSize).findIndex((entry, pageIndex) => {
      const bounds = characterCardBounds(pageIndex);
      return pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
        pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
    });
    if (selectedPageIndex >= 0) {
      selectedIndex = pageStart + selectedPageIndex;
      updateHud();
      const entry = characterRoster[selectedIndex];
      if (!isCharacterUnlocked(entry)) showMessage(`${entry.name} is locked: ${entry.unlock}.`, 3);
    }
    return;
  }
  pointer.down = true;
  canvas.setPointerCapture(event.pointerId);
  shoot();
});
window.addEventListener('pointerup', () => {
  pointer.down = false;
  releaseAttackInputSuppressionIfIdle();
  audioSliderDragging = null;
});
canvas.addEventListener('pointercancel', clearHeldInputs);
canvas.addEventListener('lostpointercapture', () => {
  pointer.down = false;
});

window.addEventListener('pointerdown', (event) => {
  setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard');
  updateControlsHint();
});
window.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' && !event.sourceCapabilities?.firesTouchEvents &&
      (event.movementX || event.movementY)) {
    updateControlsHint();
  }
});

setupTouchControls();
// The prologue opens the game until it has been read once.
if (save.introducedChapters.includes('prologue')) {
  mode = 'select';
  menuFocus = defaultMenuFocus();
}

updateHud();
if (mode === 'prologue') {
  messageEl.textContent = hasSavedRun()
    ? 'Read the prologue before choosing a delver or resuming your saved descent.'
    : 'Read the prologue before choosing a delver.';
  startPrologueNarration();
} else {
  messageEl.textContent = hasSavedRun()
    ? 'Resume your saved descent or choose a delver.'
    : 'Choose a delver to begin the descent.';
}

window.addEventListener('pagehide', () => {
  persistSave();
  saveRunState();
});
requestAnimationFrame(loop);
