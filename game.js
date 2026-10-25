const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statsEl = document.getElementById('stats');
const messageEl = document.getElementById('message');
const controlsEl = document.getElementById('controls');

// Rooms vary in size; wide and tall rooms keep the same area as large ones.
const ROOM_SIZES = {
  small: { w: 960, h: 540 },
  large: { w: 1600, h: 900 },
  wide: { w: 2000, h: 720 },
  tall: { w: 1000, h: 1440 },
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
const soundPools = new Map();
const gameMusic = {
  enabled: true,
  context: null,
  gain: null,
  timer: null,
  starting: false,
  step: 0,
  nextBeat: 0,
};
const musicMelody = [57, 60, 64, 60, 55, 60, 64, 60, 57, 60, 65, 62, 55, 59, 62, 59];
const musicChords = [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]];
const prologueNarrations = [1, 2, 3].map((segment) => {
  const audio = new Audio(`assets/audio/prologue-0${segment}.ogg`);
  audio.preload = 'auto';
  audio.volume = 0.76;
  return audio;
});
let activePrologueNarration = -1;
let prologueNarrationNeedsGesture = true;
let activePrologueSpeech = null;
let prologueSpeechFallbackActive = false;
const campaignRegionIds = [
  'tulimshar', 'hurnscald', 'graveyard', 'artis', 'halinarzo', 'nivalis', 'frostia', 'fortress', 'worldedge',
];
let mapOrder = [];
const directions = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'right', dx: 1, dy: 0 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
];
const oppositeDirection = { up: 'down', right: 'left', down: 'up', left: 'right' };

function loadAsset(path) {
  const image = new Image();
  image.src = `${assetRoot}/${path}`;
  image.onerror = () => {
    messageEl.textContent = `Could not load TMW artwork: ${path}`;
  };
  return image;
}

function playSound(path, volume = 0.4) {
  if (typeof Audio === 'undefined') return;
  let pool = soundPools.get(path);
  if (!pool) {
    pool = Array.from({ length: 4 }, () => {
      const audio = new Audio(`${soundRoot}/${path}`);
      audio.preload = 'auto';
      return audio;
    });
    soundPools.set(path, pool);
  }
  const audio = pool.find((entry) => entry.paused || entry.ended) || pool[0];
  audio.currentTime = 0;
  audio.volume = volume;
  audio.play().catch(() => {});
}

function scheduleMusicNote(midiNote, startTime, duration, volume, waveform) {
  const oscillator = gameMusic.context.createOscillator();
  const envelope = gameMusic.context.createGain();
  oscillator.type = waveform;
  oscillator.frequency.value = 440 * 2 ** ((midiNote - 69) / 12);
  envelope.gain.setValueAtTime(0.0001, startTime);
  envelope.gain.exponentialRampToValueAtTime(volume, startTime + 0.035);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(envelope);
  envelope.connect(gameMusic.gain);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function scheduleGameMusic() {
  if (!gameMusic.enabled || !gameMusic.context || gameMusic.context.state !== 'running') return;
  const beatLength = 60 / 82;
  const scheduleUntil = gameMusic.context.currentTime + 0.2;
  while (gameMusic.nextBeat < scheduleUntil) {
    const step = gameMusic.step % musicMelody.length;
    const chord = musicChords[Math.floor(step / 4)];
    if (step % 4 === 0) {
      scheduleMusicNote(chord[0] - 12, gameMusic.nextBeat, beatLength * 2, 0.12, 'triangle');
      for (const note of chord) {
        scheduleMusicNote(note + 12, gameMusic.nextBeat, beatLength * 3.5, 0.045, 'sine');
      }
    }
    scheduleMusicNote(musicMelody[step], gameMusic.nextBeat, beatLength * 0.42, 0.09, 'triangle');
    gameMusic.nextBeat += beatLength;
    gameMusic.step += 1;
  }
}

function startGameMusic() {
  if (!gameMusic.enabled) return;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;
  if (!gameMusic.context) {
    gameMusic.context = new AudioContextType();
    gameMusic.gain = gameMusic.context.createGain();
    gameMusic.gain.gain.value = 0.22;
    gameMusic.gain.connect(gameMusic.context.destination);
  }
  if (gameMusic.timer !== null || gameMusic.starting) return;
  gameMusic.starting = true;
  gameMusic.context.resume().then(() => {
    gameMusic.starting = false;
    if (!gameMusic.enabled || gameMusic.timer !== null) return;
    gameMusic.nextBeat = gameMusic.context.currentTime + 0.06;
    scheduleGameMusic();
    gameMusic.timer = window.setInterval(scheduleGameMusic, 100);
  }).catch(() => {
    gameMusic.starting = false;
  });
}

function startPrologueSpeechFallback(pageIndex) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
  if (prologueSpeechFallbackActive && window.speechSynthesis.speaking) return true;
  window.speechSynthesis.cancel();
  const page = prologuePages[pageIndex];
  const utterance = new SpeechSynthesisUtterance(`${page.heading}. ${page.title}. ${page.text}`);
  const voices = window.speechSynthesis.getVoices();
  const narratorVoice = voices.find((voice) => voice.lang.startsWith('en') &&
    /andrew|brian|roger|ryan|guy|christopher|natural/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.startsWith('en'));
  if (narratorVoice) utterance.voice = narratorVoice;
  utterance.lang = 'en-US';
  utterance.rate = 0.94;
  utterance.pitch = 1;
  utterance.volume = 0.9;
  utterance.onstart = () => {
    prologueNarrationNeedsGesture = false;
    prologueSpeechFallbackActive = true;
  };
  utterance.onend = () => {
    if (activePrologueSpeech === utterance) prologueSpeechFallbackActive = false;
  };
  utterance.onerror = () => {
    if (activePrologueSpeech === utterance) prologueSpeechFallbackActive = false;
  };
  activePrologueSpeech = utterance;
  prologueSpeechFallbackActive = true;
  window.speechSynthesis.speak(utterance);
  return true;
}

function startPrologueNarration() {
  if (mode !== 'prologue') return false;
  const audio = prologueNarrations[prologuePage];
  if (activePrologueNarration !== prologuePage) stopPrologueNarration();
  activePrologueNarration = prologuePage;
  if (prologueSpeechFallbackActive && window.speechSynthesis?.speaking) return true;
  if (!audio.paused) return true;
  if (audio.error && startPrologueSpeechFallback(prologuePage)) return true;
  const playback = audio.play();
  if (playback && typeof playback.then === 'function') {
    playback.then(() => {
      prologueNarrationNeedsGesture = false;
    }).catch(() => {
      prologueNarrationNeedsGesture = true;
      if (mode !== 'prologue' || activePrologueNarration !== prologuePage) return;
      if (startPrologueSpeechFallback(prologuePage)) return;
      showMessage('Narration is unavailable in this browser.', 4);
    });
  } else {
    prologueNarrationNeedsGesture = false;
  }
  return !audio.paused;
}

function stopPrologueNarration() {
  for (const audio of prologueNarrations) {
    audio.pause();
    audio.currentTime = 0;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  activePrologueSpeech = null;
  prologueSpeechFallbackActive = false;
  activePrologueNarration = -1;
}

function toggleGameMusic() {
  gameMusic.enabled = !gameMusic.enabled;
  if (gameMusic.gain && gameMusic.context) {
    gameMusic.gain.gain.setTargetAtTime(gameMusic.enabled ? 0.22 : 0, gameMusic.context.currentTime, 0.08);
  }
  if (gameMusic.enabled) startGameMusic();
  showMessage(`Music ${gameMusic.enabled ? 'on' : 'off'}.`, 1.5);
}

const heartImage = loadAsset('items/equipment/charms/heart-of-isis.png');
const stoneImage = loadAsset('items/equipment/ammo/stoneprojectile-icon.png');
const eliteHatImage = loadAsset('items/equipment/head/wizardhat.png');
const linkedShieldImage = loadAsset('items/equipment/shields/steelshield.png');
const luckCharmImage = loadAsset('items/equipment/charms/fourleafclover.png');
const shopItemIconImages = {
  'frost-rune': loadAsset('items/generic/snowflake.png'),
  'spore-bloom': loadAsset('items/generic/mushroomspores.png'),
  'bonded-aegis': linkedShieldImage,
  'luck-up-i': luckCharmImage,
  'luck-up-ii': luckCharmImage,
  'heart-vessel-i': heartImage,
  'heart-vessel-ii': heartImage,
  'heart-vessel-iii': heartImage,
  'element-fire': loadAsset('items/equipment/charms/firescroll.png'),
  'element-lightning': loadAsset('items/equipment/weapons/scepter.png'),
  'element-gas': loadAsset('items/generic/darkdesertmushroom.png'),
};
const sacredRoomTiles = loadAsset('tilesets/desert_castle_interior.png');
const castleWallTiles = loadAsset('tilesets/desert_castle.png');
const desertObstacleTiles = loadAsset('tilesets/desert1.png');
const soulMenhirImage = loadAsset('sprites/npcs/sprite/soulmenhirs_x2.png');
const sacredRoomFloorTileIds = [65, 49, 81];
const castleWallTileIds = [16, 17, 18];
const terrainTiles = {
  tulimshar: { image: desertObstacleTiles, tileIds: [0] },
  candor: { image: loadAsset('tilesets/desert2.png'), tileIds: [100] },
  hurnscald: { image: loadAsset('tilesets/woodland_ground.png'), tileIds: [32] },
  graveyard: { image: loadAsset('tilesets/woodland_graveyard_ground.png'), tileIds: [0] },
  artis: { image: loadAsset('tilesets/evol/artis-pavement.png'), tileIds: [0] },
  halinarzo: { image: loadAsset('tilesets/savannah.png'), tileIds: [170] },
  nivalis: { image: loadAsset('tilesets/snow.png'), tileIds: [37] },
  frostia: { image: loadAsset('tilesets/icecave.png'), tileIds: [8] },
  fortress: { image: loadAsset('tilesets/cave2.png'), tileIds: [0] },
  worldedge: { image: loadAsset('tilesets/stoneground.png'), tileIds: [0] },
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
  leatherLegguards: { image: loadAsset('sprites/equipment/legs/assassin-female.png'), frameWidth: 64, frameHeight: 64 },
  leatherVest: {
    image: loadAsset('sprites/equipment/chest/leathershirt-male.png'),
    femaleImage: loadAsset('sprites/equipment/chest/leathershirt-female.png'),
    frameWidth: 64, frameHeight: 64,
  },
  ironSword: { image: loadAsset('sprites/equipment/weapons/sword-iron.png'), frameWidth: 64, frameHeight: 64 },
  daggers: { image: loadAsset('sprites/equipment/weapons/knife.png'), frameWidth: 64, frameHeight: 64 },
};
const monsterSprites = {
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
  { image: loadAsset('sprites/monsters/loghead.png'), frameWidth: 45, frameHeight: 43, frames: [0], scale: 1.55, hp: 1, radius: 23, type: 'solid' },
  { image: loadAsset('sprites/monsters/mushroom-red.png'), frameWidth: 42, frameHeight: 33, frames: [0, 10, 20, 30], scale: 1.55, hp: 2, radius: 18, type: 'bomb-only' },
  { image: loadAsset('sprites/monsters/grass.png'), frameWidth: 32, frameHeight: 64, frames: [0], scale: 1.35, hp: 3, radius: 15, type: 'regenerating', regenDelay: 4, regenCycles: 2, regenSteps: 3 },
  { image: desertObstacleTiles, frameWidth: 32, frameHeight: 32, frames: [27], scale: 1.6, hp: 2, radius: 18, type: 'bomb-only' },
  { image: loadAsset('sprites/monsters/plant.png'), frameWidth: 46, frameHeight: 42, frames: [0], scale: 1.3, hp: 3, radius: 18, type: 'regenerating', regenDelay: 4, regenCycles: 2, regenSteps: 3 },
];
const obstacleSpritesByFloor = {
  1: [obstacleSprites[1], obstacleSprites[2], obstacleSprites[3]],
  2: [obstacleSprites[0], obstacleSprites[2], obstacleSprites[4]],
  3: [obstacleSprites[0], obstacleSprites[1], obstacleSprites[4]],
};
const correctedHumanoidFrames = new WeakMap();
const correctedHeadFrames = new WeakMap();
let pixelCorrectionWarningShown = false;
const bossCompanionKinds = new Set([
  'jacko', 'spider-queen', 'golem', 'slime-mother', 'reaper', 'serqet', 'banditlord',
  'snowman-boss', 'yetiking', 'forestdragon', 'nightdragon',
]);
const MIN_ABILITY_COST = 3;
const shopItemCatalog = [
  { id: 'pearl', name: 'Mana Pearl', description: 'Larger, stronger tears', cost: 5, kind: 'passive' },
  { id: 'prism', name: 'Prism Shard', description: 'Fire a three-way burst', cost: 8, kind: 'passive' },
  { id: 'feather', name: 'Swift Feather', description: 'Fire tears faster', cost: 6, kind: 'passive' },
  { id: 'heart-vessel-i', name: 'Heart Vessel I', description: 'Gain one heart for this descent', cost: 8, kind: 'passive' },
  { id: 'heart-vessel-ii', name: 'Heart Vessel II', description: 'Gain one heart for this descent', cost: 11, kind: 'passive' },
  { id: 'heart-vessel-iii', name: 'Heart Vessel III', description: 'Gain one heart for this descent', cost: 14, kind: 'passive' },
  { id: 'luck-up-i', name: 'Luck Up I', description: 'Zenny can overflow a map’s budget more often', cost: 6, kind: 'passive' },
  { id: 'luck-up-ii', name: 'Luck Up II', description: 'Even better odds of a zenny windfall', cost: 9, kind: 'passive' },
  { id: 'range-lens', name: 'Far-Reach Lens I', description: 'Projectiles travel 35% farther', cost: 7, kind: 'passive' },
  { id: 'range-lens-ii', name: 'Far-Reach Lens II', description: 'Extend projectile range another 35%', cost: 10, kind: 'passive' },
  { id: 'range-lens-iii', name: 'Far-Reach Lens III', description: 'Maximum range; shots pierce solid barriers', cost: 13, kind: 'passive' },
  { id: 'frost-rune', name: 'Frost Rune', description: 'Freeze nearby foes; slows bosses (C)', cost: 9, kind: 'ability' },
  { id: 'spore-bloom', name: 'Spore Bloom', description: 'Player bombs release a slowing spore burst', cost: 10, kind: 'ability', unlockAfterEnemyAbility: 'spore-burst' },
  { id: 'bonded-aegis', name: 'Bonded Aegis', description: 'Block three hits with a TMW steel shield', cost: 11, kind: 'ability', unlockAfterEnemyAbility: 'twin-shield' },
  { id: 'element-fire', name: 'Ember Sigil', description: 'Fire attacks ignite gas clouds', cost: 8, kind: 'element', element: 'fire', unlockAtSeconds: 300, unlockAfterEnemyAbility: 'fire-burst' },
  { id: 'element-lightning', name: 'Storm Sigil', description: 'Lightning chains through wet foes', cost: 9, kind: 'element', element: 'lightning', unlockAtSeconds: 900, unlockAfterEnemyAbility: 'lightning-shot' },
  { id: 'element-gas', name: 'Miasma Sigil', description: 'Miasma attacks leave a harmful cloud', cost: 8, kind: 'element', element: 'gas', unlockAtSeconds: 1800, unlockAfterEnemyAbility: 'spore-burst' },
  { id: 'learn-magic', name: 'Spell-Scribe', description: 'Learn to cast magic tears', cost: 7, kind: 'skill', style: 'magic' },
  { id: 'learn-brawl', name: 'Brawler’s Wraps', description: 'Learn a close-range strike', cost: 7, kind: 'skill', style: 'melee' },
  { id: 'learn-bow', name: 'Trail-Worn Bow', description: 'Learn to fire arrows', cost: 7, kind: 'skill', style: 'bow', unlockAfterEnemyAbility: 'arrow-shot' },
  { id: 'iron-sword', name: 'Iron Sword', description: 'A longer, heavier melee strike', cost: 7, kind: 'weapon', style: 'melee', weapon: 'sword' },
  { id: 'swift-daggers', name: 'Swift Daggers', description: 'Quick, close twin strikes', cost: 7, kind: 'weapon', style: 'melee', weapon: 'daggers' },
  { id: 'silk-shorts', name: 'Silk Shorts', description: 'Light legs increase movement speed', cost: 6, kind: 'clothing', slot: 'legs', sprite: 'silkShorts', speedBonus: 32, armorBonus: 0 },
  { id: 'leather-legguards', name: 'Leather Legguards', description: 'Heavy legs slow you down but absorb two hits', cost: 8, kind: 'clothing', slot: 'legs', sprite: 'leatherLegguards', speedBonus: -18, armorBonus: 2 },
  { id: 'leather-vest', name: 'Leather Vest', description: 'A sturdy vest that absorbs one hit', cost: 7, kind: 'clothing', slot: 'chest', sprite: 'leatherVest', speedBonus: 0, armorBonus: 1 },
  ...Object.keys(monsterSprites).map((kind) => {
    const name = kind.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
    return {
      id: `${kind}-companion`,
      name: `${name} Familiar`,
      description: `A ${kind.replaceAll('-', ' ')} fights beside you`,
      cost: bossCompanionKinds.has(kind) ? 14 : 8,
      kind: 'companion',
      companion: kind,
    };
  }),
  { id: 'mana-tonic', name: 'Mana Tonic', description: 'Restore two health with Q', cost: 4, kind: 'consumable' },
  { id: 'bomb-bundle', name: 'Bomb Bundle', description: 'Gain two bombs with Q', cost: 4, kind: 'consumable' },
  { id: 'mana-burst', name: 'Mana Burst', description: 'Blast all foes with Q', cost: 6, kind: 'consumable' },
];

const characterRoster = [
  { id: 'wanderer', name: 'Mage', className: 'Mage', startingStyle: 'magic', styleLabel: 'Magic tears', hairStyle: 'wanderer', raceHead: 'humanMale', sprite: 'male', color: '#75d8ff', hue: 0, speed: 235, hp: 6, damage: 1, fireDelay: 0.23, trait: 'Balanced delver', unlock: 'Available' },
  { id: 'arcanist', name: 'Warrior', className: 'Warrior', startingStyle: 'melee', styleLabel: 'Hand-to-hand', hairStyle: 'arcanist', raceHead: 'humanFemale', sprite: 'female', color: '#d7a8ff', hue: 95, speed: 210, hp: 8, damage: 2, fireDelay: 0.28, trait: 'Hardy, slower strikes', unlock: 'Defeat a floor guardian' },
  { id: 'warden', name: 'Rogue', className: 'Rogue', startingStyle: 'bow', styleLabel: 'Bow and arrows', hairStyle: 'warden', raceHead: 'humanMale', sprite: 'neutral', color: '#fbd96f', hue: 205, speed: 250, hp: 5, damage: 1, fireDelay: 0.23, trait: 'Fast feet, light armor', unlock: 'Find a secret room' },
  { id: 'candor-runner', name: 'Candor Runner', className: 'Scout', startingStyle: 'bow', styleLabel: 'Quick arrows', hairStyle: 'candor', raceHead: 'humanFemale', sprite: 'female', color: '#f5b86c', hue: 25, speed: 285, hp: 4, damage: 1, fireDelay: 0.34, trait: 'Very fast, slow draw', unlock: 'Defeat Boss Pinkie' },
  { id: 'world-edge-pilgrim', name: 'World-Edge Pilgrim', className: 'Pilgrim', startingStyle: 'magic', styleLabel: 'Patient casting', hairStyle: 'pilgrim', raceHead: 'elfMale', sprite: 'elf', color: '#b9d9a0', hue: 35, speed: 210, hp: 8, damage: 1, fireDelay: 0.3, trait: 'Patient casting, slower pace', unlock: 'Find a secret room' },
  { id: 'hurnscald-herbalist', name: 'Hurnscald Herbalist', className: 'Herbalist', startingStyle: 'magic', styleLabel: 'Frost magic', hairStyle: 'herbalist', raceHead: 'elfFemale', sprite: 'elfFemale', color: '#86d69c', hue: 65, speed: 200, hp: 7, damage: 1, fireDelay: 0.27, startingAbility: 'frost-rune', trait: 'Starts with Frost Rune', unlock: 'Reach Hurnscald' },
  { id: 'ironbound', name: 'Ironbound', className: 'Sentinel', startingStyle: 'melee', styleLabel: 'Heavy blows', hairStyle: 'ironbound', raceHead: 'orcMale', sprite: 'orc', color: '#c7b8a2', hue: 15, speed: 158, hp: 11, damage: 3, fireDelay: 0.4, startingBombs: 4, trait: 'Strong and slow', unlock: 'Defeat a sentinel' },
  { id: 'artis-archivist', name: 'Artis Archivist', className: 'Scholar', startingStyle: 'magic', styleLabel: 'Measured spells', hairStyle: 'archivist', raceHead: 'tritanMale', sprite: 'tritan', color: '#c4a6df', hue: 115, speed: 218, hp: 4, damage: 3, fireDelay: 0.32, trait: 'Heavy hits, fragile', unlock: 'Reach Artis' },
  { id: 'glass-quill', name: 'Glass Quill', className: 'Scribe', startingStyle: 'bow', styleLabel: 'Piercing shots', hairStyle: 'quill', raceHead: 'raijinFemale', sprite: 'raijin', color: '#f0a2a2', hue: 155, speed: 230, hp: 3, damage: 3, fireDelay: 0.36, projectileSpeed: 620, trait: 'High damage, very fragile', unlock: 'Defeat the Spider Queen' },
  { id: 'vault-delver', name: 'Vault Delver', className: 'Delver', startingStyle: 'melee', styleLabel: 'Rapid fists', hairStyle: 'wanderer', raceHead: 'humanMale', sprite: 'neutral', color: '#a9c1d7', hue: 220, speed: 180, hp: 6, damage: 1, fireDelay: 0.16, trait: 'Slow movement, fast attacks', unlock: 'Complete a descent' },
  { id: 'graveyard-keeper', name: 'Graveyard Keeper', className: 'Keeper', startingStyle: 'magic', styleLabel: 'Spirit pulse', hairStyle: 'warden', raceHead: 'humanMale', sprite: 'neutral', color: '#a5aa9b', hue: 235, speed: 175, hp: 10, damage: 2, fireDelay: 0.34, startingBombs: 2, trait: 'Strong spirit, few bombs', unlock: 'Defeat the Reaper' },
  { id: 'tulimshar-guard', name: 'Tulimshar Guard', className: 'Guard', startingStyle: 'melee', styleLabel: 'Measured strikes', hairStyle: 'candor', raceHead: 'humanMale', sprite: 'male', color: '#e1ad72', hue: 12, speed: 195, hp: 9, damage: 2, fireDelay: 0.31, startingBombs: 4, trait: 'Extra bombs, slow attacks', unlock: 'Defeat the Great Red Slime' },
  { id: 'halinarzo-ranger', name: 'Halinarzo Ranger', className: 'Ranger', startingStyle: 'bow', styleLabel: 'Long shots', hairStyle: 'quill', raceHead: 'elfFemale', sprite: 'elfFemale', color: '#c5d38b', hue: 45, speed: 255, hp: 4, damage: 2, fireDelay: 0.3, projectileSpeed: 580, trait: 'Quick and fragile', unlock: 'Defeat Bandit Lord' },
  { id: 'nivalis-oracle', name: 'Nivalis Oracle', className: 'Oracle', startingStyle: 'magic', styleLabel: 'Ice magic', hairStyle: 'pilgrim', raceHead: 'raijinFemale', sprite: 'raijin', color: '#a9dbed', hue: 185, speed: 195, hp: 7, damage: 1, fireDelay: 0.25, startingAbility: 'frost-rune', trait: 'Frost Rune, slow movement', unlock: 'Defeat Snowman Boss' },
  { id: 'frostia-reclaimer', name: 'Frostia Reclaimer', className: 'Reclaimer', startingStyle: 'melee', styleLabel: 'Heavy fists', hairStyle: 'ironbound', raceHead: 'tritanMale', sprite: 'tritan', color: '#88bdcf', hue: 205, speed: 170, hp: 10, damage: 2, fireDelay: 0.38, trait: 'High health, slow attacks', unlock: 'Defeat Yeti King' },
  { id: 'fortress-keeper', name: 'Fortress Keeper', className: 'Warden', startingStyle: 'magic', styleLabel: 'Rooted magic', hairStyle: 'herbalist', raceHead: 'elfMale', sprite: 'elf', color: '#99c98a', hue: 80, speed: 205, hp: 6, damage: 2, fireDelay: 0.27, trait: 'Steady, modest speed', unlock: 'Defeat Forest Dragon' },
  { id: 'world-edge-veteran', name: 'World Edge Veteran', className: 'Veteran', startingStyle: 'bow', styleLabel: 'Last light', hairStyle: 'archivist', raceHead: 'orcMale', sprite: 'orc', color: '#c0a1d4', hue: 260, speed: 155, hp: 12, damage: 3, fireDelay: 0.42, trait: 'Very tough, very slow', unlock: 'Defeat Night Dragon' },
];
const rosterPageSize = 5;
const prologuePages = [
  {
    heading: 'TULIMSHAR',
    title: 'A seed beneath the city',
    text: 'Tulimshar is always the first stop. In this side-story, a strange mana seed is recovered from a sealed passage beneath the desert city. Afterward, monsters across the region begin acting out of season. It may be an echo of the distant Mana Tree, but no one yet knows why.',
  },
  {
    heading: 'HURNSCALD',
    title: 'Toward the World Edge',
    text: 'The trail leads through Hurnscald, whose mayor Rakinorf is known to travelers asking about the World Edge. The forest paths are familiar, but something has unsettled the creatures along them. Your search follows the roads without changing the stories already told there.',
  },
  {
    heading: 'ARTIS',
    title: 'A story beside the main road',
    text: 'Trade brings people and rumors to Artis. Beneath one forgotten route, sealed rooms hold signs of the same disturbance. This is a small side-story in The Mana World: its delvers, discoveries, and battles leave the established towns and histories intact.',
  },
];
const regionChapters = {
  tulimshar: { heading: 'TULIMSHAR', title: 'The Desert Gate', text: 'Tulimshar, where every descent begins. Guards, guilds, and caravans cross its sand, and the mana seed first pulsed on an old road outside the walls. Follow that rhythm, and the desert will show you what it hides.' },
  hurnscald: { heading: 'HURNSCALD', title: 'Where the Forest Remembers', text: 'Hurnscald. Rakinorf’s town sits among old woodland roads, and the creatures here are restless. The seed’s pulse grows stronger beneath the trees. Whatever stirs them, it is not the forest alone.' },
  graveyard: { heading: 'THE GRAVEYARD', title: 'The Quiet Stones', text: 'The graveyard beyond Hurnscald is silent until the pulse passes beneath it. The dead are not choosing a new war. They are answering a rhythm they cannot name. Walk softly.' },
  artis: { heading: 'ARTIS RUINS', title: 'Amelia’s Ruins', text: 'The Artis Ruins. Here Amelia speaks of a Mana Tree in a distant cave, saddened by war. The seed brightens when the Tree is named. A resemblance, perhaps, but not yet proof.' },
  halinarzo: { heading: 'HALINARZO', title: 'The Savannah Roads', text: 'Halinarzo. Library shelves and savannah trails hold fragments of old passages. A repeating mark in the journal matches the seed’s rhythm. Bandits watch these roads, so keep your guard up.' },
  nivalis: { heading: 'NIVALIS', title: 'Beneath the Snow', text: 'Nivalis lies under snow. The Blue Sage is said to know the northern trails, and the pulse carries through the ice itself. Cold can hide a signal, but it cannot silence it.' },
  frostia: { heading: 'FROSTIA', title: 'The Ice Court', text: 'Frostia, where King Gelid’s ice caves amplify the seed’s pulse and draw monsters down the trail. Every footstep echoes here. Move with purpose.' },
  fortress: { heading: 'FORTRESS ISLAND', title: 'The Island of War', text: 'Fortress Island. Amelia places the Mana Tree in these eastern caves. The seed’s source feels close now, though this remains one delver’s side-story, not a change to what is written.' },
  worldedge: { heading: 'THE WORLD EDGE', title: 'The Edge of the Map', text: 'The World Edge, spoken of by travelers from Hurnscald. The seed’s signal is strongest here, and the road ends in quiet. What follows belongs to this delver alone.' },
};
const characterChapters = {
  arcanist: { heading: 'THE WARRIOR', title: 'Strength Over Speed', text: 'A guardian has fallen, and someone stepped forward from the crowd. The Warrior fights with bare hands and a hardy frame. Strikes come slowly, but they land.' },
  warden: { heading: 'THE ROGUE', title: 'Out of the Dark', text: 'A hidden chamber gave up more than relics. The Rogue slipped out of the dark, light on their feet and quick with a bow. The armor is thin, but a moving target is hard to hit.' },
  'candor-runner': { heading: 'CANDOR RUNNER', title: 'The Open Road', text: 'Boss Pinkie is down, and the Candor road lies open. The Runner is the fastest delver alive, with a slow draw but a clear path ahead. Speed is the only armor needed.' },
  'world-edge-pilgrim': { heading: 'WORLD-EDGE PILGRIM', title: 'A Patient Walker', text: 'Another secret was found, and a patient traveler followed it in. The Pilgrim casts slowly and carefully, with extra health for the long walk. The World Edge calls, and they answer.' },
  'hurnscald-herbalist': { heading: 'HURNSCALD HERBALIST', title: 'Roots and Frost', text: 'Hurnscald’s forest paths taught her which roots heal and which freeze. She begins with a Frost Rune and moves at a gentle pace. Cold magic and patient hands carry her through.' },
  ironbound: { heading: 'IRONBOUND', title: 'The Sentinel Walks', text: 'A sentinel has fallen, and one of its own watchers stepped away from its post. Ironbound is heavy, slow, and hits like a collapsing wall. Four bombs hang from the belt.' },
  'artis-archivist': { heading: 'ARTIS ARCHIVIST', title: 'Measured Spells', text: 'The Ruins held more than rumors. A scholar from Artis now walks the descent, measuring every spell. Hits land hard, but the Archivist cannot take many in return.' },
  'glass-quill': { heading: 'GLASS QUILL', title: 'Every Shot a Word', text: 'The Spider Queen’s web has fallen, and a scribe stepped out with piercing shots and a fragile frame. Every word she writes is a risk. Every shot is a decision.' },
  'vault-delver': { heading: 'VAULT DELVER', title: 'Fists and Patience', text: 'A descent complete, and a vault opened. The Vault Delver is slow on foot but fast with the fists. Many short strikes, and a stubborn habit of coming back.' },
  'graveyard-keeper': { heading: 'GRAVEYARD KEEPER', title: 'The Keeper’s Key', text: 'The Reaper no longer guards the stones, so the Keeper has taken the key. A strong spirit pulse, a few bombs, and a long memory carry this delver through the dark.' },
  'tulimshar-guard': { heading: 'TULIMSHAR GUARD', title: 'Hold the Line', text: 'The Great Red Slime is gone, and the city sent one of its own. The Guard is slow to strike, but carries extra bombs and a sturdy frame. Hold the line, then break it.' },
  'halinarzo-ranger': { heading: 'HALINARZO RANGER', title: 'Long Shots', text: 'The Bandit Lord has fallen, and the savannah has a new watcher. The Ranger draws long shots from a distance. Quick and fragile, she stays out of arm’s reach.' },
  'nivalis-oracle': { heading: 'NIVALIS ORACLE', title: 'The Snow Whispers', text: 'The Snowman Boss is broken, and the snow whispers a name. The Oracle carries a Frost Rune and walks slowly. Ice magic answers to those who wait.' },
  'frostia-reclaimer': { heading: 'FROSTIA RECLAIMER', title: 'Taking It Back', text: 'The Yeti King’s caves are open again. The Reclaimer swings heavy fists with a great deal of health, slow but certain. Frostia’s ice is theirs to take back.' },
  'fortress-keeper': { heading: 'FORTRESS KEEPER', title: 'Rooted Ground', text: 'The Forest Dragon is beaten, and a warden of the island steps forward. Rooted magic, steady footing, and modest speed. The Fortress Keeper holds ground.' },
  'world-edge-veteran': { heading: 'WORLD EDGE VETERAN', title: 'The Last Light', text: 'The Night Dragon has fallen. At the very end of the map, a veteran lifts a bow to the last light. Very tough, very slow, and still standing when everyone else is gone.' },
};
const keys = {};
const gamepadInput = { connected: false, moveX: 0, moveY: 0, dpadX: 0, dpadY: 0, dpadFacing: false, aimX: 1, aimY: 0, aimActive: false, shoot: false };
const previousGamepadButtons = new Map();
const pointer = { x: canvas.width / 2, y: canvas.height / 2, down: false };
let previousMenuDirection = 0;
let lastInputMode = 'keyboard';

let mode = 'prologue';
let prologuePage = 0;
let codexTab = 'items';
let codexScroll = 0;
let selectedIndex = 0;
let character;
let currentFloor = 1;
const finalFloor = 9;
let score = 0;
let killStreak = 0;
let killStreakTimer = 0;
const streakCallout = { timer: 0, duration: 1.2, x: 0, y: 0, text: '' };
let coins = 0;
let keysHeld = 0;
let bombsHeld = 3;
let rooms = [];
let currentRoom;
let storyText = '';
const storyLog = [];
let showMap = false;
let showStoryJournal = false;
let lastTime = 0;
let elapsed = 0;
let messageTimer = 0;
let autosaveTimer = 0;
let frostNovaCooldown = 0;
const cameraShakeProfiles = {
  bomb: { duration: 0.2, intensity: 4, frequency: 44, style: 'snap' },
  playerHeavyHit: { duration: 0.24, intensity: 8, frequency: 34, style: 'snap' },
  jackoJumpLand: { duration: 0.3, intensity: 12, frequency: 30, style: 'heavy' },
  groundPound: { duration: 0.68, intensity: 24, frequency: 36, style: 'heavy' },
  spiderPounce: { duration: 0.3, intensity: 10, frequency: 28, style: 'rumble' },
  golemSlam: { duration: 0.38, intensity: 8, frequency: 22, style: 'rumble' },
  charge: { duration: 0.24, intensity: 5, frequency: 31, style: 'snap' },
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
};

function elementDisplayName(element) {
  return element === 'bubble' ? 'water' : element;
}

function getActiveAttackElement() {
  return magicElements.has(activeMagicElement) ? activeMagicElement : null;
}
let hitStopTimer = 0;

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
  meleeSwings: [],
};

const projectiles = [];
const enemyProjectiles = [];
const particles = [];
const enemies = [];
const companions = [];
const pickups = [];
const bombs = [];
const breakables = [];
const groundHazards = [];
const lightningArcs = [];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function currentRegionId() {
  return mapOrder[currentFloor - 1] || 'tulimshar';
}

function currentFloorTheme() {
  return floorThemes[currentRegionId()] || floorThemes.tulimshar;
}

function createGroundHazard(x, y, kind, owner = 'enemy', overrides = {}) {
  const specs = {
    acid: { radius: 42, duration: 4, damage: 1, color: '#8fce54' },
    web: { radius: 44, duration: 4.5, slow: 1.2, color: '#e4e4dc' },
    snailTrail: { radius: 24, duration: 4.2, slow: 1.2, color: '#9fc86d' },
    ooze: { radius: 72, duration: 9, slow: 1.2, color: '#c0394f' },
    fire: { radius: 34, duration: 6, damage: 1, color: '#ff7a2a' },
    water: { radius: 54, duration: 7, slow: 1.2, color: '#4aa8e0' },
    lightning: { radius: 44, duration: 1, damage: 1, damageCooldown: 0.7, color: '#f4ea7a' },
    miasma: { radius: 46, duration: 3.8, damage: 1, color: '#a5d64f' },
  };
  const spec = specs[kind];
  if (!spec) return;
  groundHazards.push({ x, y, kind, owner, ...spec, ...overrides, ttl: overrides.duration ?? spec.duration, damageCooldown: overrides.damageCooldown ?? spec.damageCooldown ?? 0.35 });
}

function updateGroundHazards(dt) {
  for (let index = groundHazards.length - 1; index >= 0; index -= 1) {
    const hazard = groundHazards[index];
    hazard.ttl -= dt;
    hazard.damageCooldown -= dt;
    if (hazard.kind === 'miasma' && hazard.owner === 'player') {
      if (hazard.damageCooldown <= 0) {
        for (const enemy of [...enemies]) {
          if (distanceBetween(enemy, hazard) <= enemy.radius + hazard.radius) {
            damageEnemy(enemy, hazard.damage, hazard.x, hazard.y);
          }
        }
        hazard.damageCooldown = 0.85;
      }
    } else if (distanceBetween(player, hazard) < player.radius + hazard.radius) {
      if (hazard.slow) player.groundSlowTimer = Math.max(player.groundSlowTimer, 0.15);
      if (hazard.damage && hazard.damageCooldown <= 0) {
        damagePlayer();
        hazard.damageCooldown = 0.8;
      }
    }
    if (hazard.ttl <= 0) groundHazards.splice(index, 1);
  }
}

function igniteMiasmaAt(x, y) {
  for (let index = groundHazards.length - 1; index >= 0; index -= 1) {
    const cloud = groundHazards[index];
    if (cloud.kind !== 'miasma' || cloud.owner !== 'player' ||
        distanceBetween(cloud, { x, y }) > cloud.radius + 24) continue;
    groundHazards.splice(index, 1);
    triggerCameraShake('bomb');
    addParticles(cloud.x, cloud.y, magicElementPalette.fire, 16, 115);
    for (const enemy of [...enemies]) {
      if (distanceBetween(enemy, cloud) <= cloud.radius + enemy.radius) {
        damageEnemy(enemy, 3, cloud.x, cloud.y);
      }
    }
  }
}

function resolveElementalImpact(projectile, target) {
  const impactX = projectile.x - projectile.vx * 0.02;
  const impactY = projectile.y - projectile.vy * 0.02;
  if (projectile.element === 'bubble') {
    target.wetTimer = 3.5;
    target.slowTimer = Math.max(target.slowTimer || 0, 0.35);
    damageEnemy(target, projectile.damage, impactX, impactY);
    addParticles(target.x, target.y, magicElementPalette.bubble, 8, 70);
  } else if (projectile.element === 'lightning') {
    const wetTarget = (target.wetTimer || 0) > 0;
    damageEnemy(target, projectile.damage * (wetTarget ? 1.8 : 1), impactX, impactY);
    if (wetTarget) {
      const chained = enemies.filter((enemy) => enemy !== target && distanceBetween(enemy, target) < 150)
        .sort((first, second) => distanceBetween(first, target) - distanceBetween(second, target)).slice(0, 2);
      for (const enemy of chained) {
        lightningArcs.push({ x1: target.x, y1: target.y, x2: enemy.x, y2: enemy.y, ttl: 0.18 });
        damageEnemy(enemy, Math.max(1, projectile.damage * 0.65), target.x, target.y);
      }
    }
    addParticles(target.x, target.y, magicElementPalette.lightning, 10, 85);
  } else {
    damageEnemy(target, projectile.damage, impactX, impactY);
    if (projectile.element === 'fire') {
      target.burnTimer = Math.max(target.burnTimer || 0, 2.4);
      target.burnCooldown = Math.min(target.burnCooldown || 0.6, 0.15);
      igniteMiasmaAt(projectile.x, projectile.y);
      addParticles(target.x, target.y, magicElementPalette.fire, 9, 90);
    } else if (projectile.element === 'gas') {
      const cloudCount = groundHazards.filter((hazard) => hazard.kind === 'miasma' && hazard.owner === 'player').length;
      if (cloudCount < 3) createGroundHazard(projectile.x, projectile.y, 'miasma', 'player');
      addParticles(projectile.x, projectile.y, magicElementPalette.gas, 10, 45);
    }
  }
}

function createMapOrder() {
  const remaining = campaignRegionIds.slice(1);
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [remaining[index], remaining[swapIndex]] = [remaining[swapIndex], remaining[index]];
  }
  return ['tulimshar', ...remaining];
}

function triggerCameraShake(profileName) {
  const profile = cameraShakeProfiles[profileName];
  if (!profile || cameraShake.remaining > 0 && cameraShake.intensity > profile.intensity) return;
  cameraShake.duration = profile.duration;
  cameraShake.remaining = profile.duration;
  cameraShake.intensity = profile.intensity;
  cameraShake.frequency = profile.frequency;
  cameraShake.style = profile.style;
  cameraShake.phase = 0;
}

function getCameraShakeOffset() {
  if (cameraShake.remaining <= 0) return { x: 0, y: 0 };
  const strength = cameraShake.intensity * cameraShake.remaining / cameraShake.duration;
  const phase = cameraShake.phase * cameraShake.frequency;
  if (cameraShake.style === 'rumble') {
    return { x: Math.sin(phase * 0.7) * strength, y: Math.sin(phase * 1.1) * strength * 0.7 };
  }
  const verticalScale = cameraShake.style === 'heavy' ? 0.85 : 0.55;
  return { x: Math.sin(phase) * strength, y: Math.cos(phase * 1.25) * strength * verticalScale };
}

function getSave() {
  let storedSave;
  try {
    storedSave = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
  } catch (error) {
    messageEl.textContent = 'Progress could not be read from browser storage; unlocks last for this visit.';
    return {
      arcanist: false, warden: false, unlockedCharacters: [], completedRuns: 0, bankedZenny: 0,
      playtimeSeconds: 0, unlockedItemIds: [], discoveredItemIds: [], discoveredEnemyIds: [], discoveredEnemyAbilityIds: [],
      purchasedAbilityIds: [], introducedChapters: [],
    };
  }
  if (!storedSave || typeof storedSave !== 'object' || Array.isArray(storedSave)) storedSave = {};

  let storedBank;
  try {
    storedBank = localStorage.getItem(BANK_STORAGE_KEY);
  } catch (error) {
    messageEl.textContent = 'Bank storage could not be read; your saved profile balance is shown for this visit.';
  }
  const profileBalance = Number.isFinite(storedSave.bankedZenny)
    ? Math.max(0, Math.floor(storedSave.bankedZenny)) : 0;
  const bankedZenny = storedBank === null || storedBank === undefined
    ? profileBalance : Math.max(0, Math.floor(Number(storedBank) || 0));
  if (storedBank === null && profileBalance > 0) {
    try {
      localStorage.setItem(BANK_STORAGE_KEY, String(profileBalance));
    } catch (error) {
      messageEl.textContent = 'The existing bank balance could not be migrated to persistent bank storage.';
    }
  }
  return {
    arcanist: storedSave.arcanist === true,
    warden: storedSave.warden === true,
    unlockedCharacters: Array.isArray(storedSave.unlockedCharacters)
      ? storedSave.unlockedCharacters.filter((id) => typeof id === 'string') : [],
    completedRuns: Number.isFinite(storedSave.completedRuns) ? Math.max(0, Math.floor(storedSave.completedRuns)) : 0,
    bankedZenny,
    playtimeSeconds: Number.isFinite(storedSave.playtimeSeconds) ? Math.max(0, storedSave.playtimeSeconds) : 0,
    unlockedItemIds: Array.isArray(storedSave.unlockedItemIds)
      ? storedSave.unlockedItemIds.filter((id) => typeof id === 'string') : [],
    discoveredItemIds: Array.isArray(storedSave.discoveredItemIds)
      ? storedSave.discoveredItemIds.filter((id) => typeof id === 'string') : [],
    discoveredEnemyIds: Array.isArray(storedSave.discoveredEnemyIds)
      ? storedSave.discoveredEnemyIds.filter((id) => typeof id === 'string') : [],
    discoveredEnemyAbilityIds: Array.isArray(storedSave.discoveredEnemyAbilityIds)
      ? storedSave.discoveredEnemyAbilityIds.filter((id) => typeof id === 'string') : [],
    purchasedAbilityIds: Array.isArray(storedSave.purchasedAbilityIds)
      ? storedSave.purchasedAbilityIds.filter((id) => typeof id === 'string') : [],
    introducedChapters: Array.isArray(storedSave.introducedChapters)
      ? storedSave.introducedChapters.filter((id) => typeof id === 'string') : [],
  };
}

const save = getSave();
let profileSaveTimer = 0;
let runProgressionSnapshot = null;

function persistSave() {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(save));
  } catch (error) {
    messageEl.textContent = 'Progress could not be saved by this browser.';
  }
}

function unlockPlaytimeItems(notify = true) {
  const newlyUnlocked = shopItemCatalog.filter((item) =>
    (item.unlockAtSeconds || item.unlockAfterEnemyAbility) &&
    (!item.unlockAtSeconds || save.playtimeSeconds >= item.unlockAtSeconds) &&
    (!item.unlockAfterEnemyAbility || save.discoveredEnemyAbilityIds.includes(item.unlockAfterEnemyAbility)) &&
    !save.unlockedItemIds.includes(item.id));
  if (newlyUnlocked.length === 0) return;
  for (const item of newlyUnlocked) save.unlockedItemIds.push(item.id);
  persistSave();
  if (notify) showMessage(`${newlyUnlocked.map((item) => item.name).join(', ')} can now be found in a descent.`, 4);
}

function isCatalogItemUnlocked(item) {
  const availableItems = runProgressionSnapshot?.itemIds || new Set(save.unlockedItemIds);
  return !(item.unlockAtSeconds || item.unlockAfterEnemyAbility) || availableItems.has(item.id);
}

function recordItemDiscovery(item) {
  if (save.discoveredItemIds.includes(item.id)) return false;
  save.discoveredItemIds.push(item.id);
  persistSave();
  return true;
}

function recordEnemyDiscovery(kind) {
  if (save.discoveredEnemyIds.includes(kind)) return false;
  save.discoveredEnemyIds.push(kind);
  persistSave();
  return true;
}

function recordEnemyAbilityDiscovery(abilityId, enemyKind) {
  if (save.discoveredEnemyAbilityIds.includes(abilityId)) return false;
  save.discoveredEnemyAbilityIds.push(abilityId);
  unlockPlaytimeItems(false);
  persistSave();
  const newlyAvailable = shopItemCatalog.filter((item) => item.unlockAfterEnemyAbility === abilityId &&
    save.unlockedItemIds.includes(item.id));
  if (newlyAvailable.length > 0 && mode === 'playing') {
    showMessage(`${newlyAvailable.map((item) => item.name).join(', ')} can now be found in a descent.`, 4);
  }
  return true;
}

function createRunProgressionSnapshot(playtimeSeconds = save.playtimeSeconds, itemIds = save.unlockedItemIds) {
  return {
    itemIds: new Set(itemIds),
    enemyIds: new Set(Object.entries(enemyUnlockAtSeconds)
      .filter(([, unlockAtSeconds]) => playtimeSeconds >= unlockAtSeconds)
      .map(([kind]) => kind)),
  };
}

let chapterQueue = [];
let activeChapter = null;
let chapterReturnMode = 'select';
let chapterAudio = null;

function queueChapter(key, card) {
  if (!card || save.introducedChapters.includes(key)) return;
  save.introducedChapters.push(key);
  persistSave();
  chapterQueue.push({ key, kind: key.split(':')[0], ...card });
}

function discoverRegion() {
  queueChapter(`region:${currentRegionId()}`, regionChapters[currentRegionId()]);
}

function stopChapterNarration() {
  if (chapterAudio) {
    chapterAudio.pause();
    chapterAudio = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function speakChapter(text) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const narratorVoice = voices.find((voice) => voice.lang.startsWith('en') &&
    /andrew|brian|roger|ryan|guy|christopher|natural/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.startsWith('en'));
  if (narratorVoice) utterance.voice = narratorVoice;
  utterance.lang = 'en-US';
  utterance.rate = 0.94;
  utterance.volume = 0.9;
  window.speechSynthesis.speak(utterance);
}

function startChapterNarration(card) {
  stopChapterNarration();
  const audio = new Audio(`assets/audio/intro-${card.key.replace(':', '-')}.ogg`);
  audio.volume = 0.76;
  chapterAudio = audio;
  const fallBack = () => {
    if (chapterAudio !== audio) return;
    chapterAudio = null;
    speakChapter(`${card.title}. ${card.text}`);
  };
  audio.addEventListener('error', fallBack, { once: true });
  audio.play().catch(fallBack);
}

function openChapter() {
  if (activeChapter || chapterQueue.length === 0) return;
  activeChapter = chapterQueue.shift();
  chapterReturnMode = mode;
  clearHeldInputs();
  mode = 'chapter';
  startChapterNarration(activeChapter);
  updateHud();
}

function closeChapter() {
  if (mode !== 'chapter') return;
  stopChapterNarration();
  activeChapter = null;
  mode = chapterReturnMode;
  updateHud();
}

function unlockCharacter(id) {
  if (save.unlockedCharacters.includes(id)) return false;
  save.unlockedCharacters.push(id);
  persistSave();
  queueChapter(`character:${id}`, characterChapters[id]);
  return true;
}

function persistBankedZenny(amount) {
  const balance = Math.max(0, Math.floor(amount));
  try {
    localStorage.setItem(BANK_STORAGE_KEY, String(balance));
    save.bankedZenny = balance;
    return true;
  } catch (error) {
    showMessage('The bank could not save your zenny. The transaction was cancelled.', 4);
    return false;
  }
}

function persistRunAfterBankTransaction() {
  persistSave();
  saveRunState();
}

function updateControlsHint() {
  if (!controlsEl) return;
  let lines;
  if (mode === 'playing' || mode === 'paused') {
    const hasItem = consumables.some((item) => item.count > 0);
    const optional = [];
    if (ownedItems.has('frost-rune')) optional.push(lastInputMode === 'controller' ? 'Y Frost' : 'C Frost');
    if (lastInputMode === 'controller') {
      lines = [
        `LS Move/Face · X/RS Fire · D-Pad Face · LB ${elementDisplayName(activeMagicElement).toUpperCase()} · RB Style`,
        [`A Interact`, `B Bomb`, `Y ${hasItem ? 'Item' : 'No Item'}`, 'LT Frost', ...optional, 'Start Pause'].join(' · '),
      ];
    } else {
      lines = [
        `WASD Move · LMB Aim/Attack · T ${elementDisplayName(activeMagicElement).toUpperCase()} · F Style`,
        ['E Interact', 'B Bomb', `Q ${hasItem ? 'Item' : 'No Item'}`, ...optional, 'P Pause'].join(' · '),
      ];
    }
  } else if (mode === 'prologue') {
    lines = lastInputMode === 'controller'
      ? ['D-Pad / LS Read · A/Start Continue']
      : ['←/→ Read · Enter Continue'];
  } else if (mode === 'chapter') {
    lines = lastInputMode === 'controller'
      ? ['A / Start Continue']
      : ['Enter / Space / Click Continue'];
  } else if (mode === 'codex') {
    lines = lastInputMode === 'controller'
      ? ['D-Pad Browse · LB/RB Change Tab · B Close']
      : ['↑/↓ Browse · ←/→ Change Tab · K/ESC Close'];
  } else {
    lines = lastInputMode === 'controller'
      ? ['D-Pad ←/→ Delver · ↑/↓ Menu · X Select · RB Codex']
      : ['←/→ Select · Enter Descend · K Codex'];
  }
  controlsEl.textContent = lines.join('\n');
}

function updateHud() {
  if (!character) {
    statsEl.textContent = mode === 'prologue' ? 'Candor Island · Hurnscald · Artis Ruins' : 'Choose a delver';
    updateControlsHint();
    return;
  }
  statsEl.textContent =
    `${currentFloorTheme().name} · ${character.className} • Lead: ${activeCombatStyle} | Zenny: ${coins} | Bank: ${save.bankedZenny}`;
  updateControlsHint();
}

function showMessage(text, seconds = 2.5) {
  messageEl.textContent = text;
  messageTimer = seconds;
}

function recordStory(title, text) {
  if (!text || storyLog.some((entry) => entry.title === title && entry.text === text)) return;
  storyLog.push({ title, text });
  if (storyLog.length > 18) storyLog.shift();
}

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

function ownedAbilityCount() {
  return shopItemCatalog.filter((item) => item.kind === 'ability' && ownedItems.has(item.id)).length;
}

function reservedAbilityCount() {
  return shopItemCatalog.filter((item) => item.kind === 'ability' &&
    reservedUpgradeIds.has(item.id) && !ownedItems.has(item.id)).length;
}

const BASE_HEARTS = 4;
const MAX_EXTRA_HEARTS = 9;
const SOFT_EXTRA_HEARTS = 5;

function extraHearts() {
  return Math.max(0, player.maxHp - BASE_HEARTS);
}

function gainMaxHeart() {
  if (extraHearts() >= MAX_EXTRA_HEARTS) return false;
  player.maxHp += 1;
  player.hp = Math.min(player.maxHp, player.hp + 1);
  return true;
}

// Past the soft limit, vessels become rare finds.
function heartVesselAllowed() {
  const extra = extraHearts();
  return extra < MAX_EXTRA_HEARTS && (extra < SOFT_EXTRA_HEARTS || Math.random() < 0.04);
}

const rangeLensItemIds = ['range-lens', 'range-lens-ii', 'range-lens-iii'];

function isUpgradeAvailable(item) {
  const rangeTier = rangeLensItemIds.indexOf(item.id);
  const luckTier = ['luck-up-i', 'luck-up-ii'].indexOf(item.id);
  return isCatalogItemUnlocked(item) && (rangeTier < 0 || rangeTier === weapon.rangeLevel) &&
    (luckTier < 0 || luckTier === player.luck);
}

function createShopStock() {
  const abilityCount = ownedAbilityCount();
  const available = shopItemCatalog.filter((item) => {
    if (item.kind === 'companion') return false;
    if (item.kind === 'consumable') return true;
    if (!isUpgradeAvailable(item)) return false;
    if (item.id.startsWith('heart-vessel-') && !heartVesselAllowed()) return false;
    if (reservedUpgradeIds.has(item.id) || ownedItems.has(item.id)) return false;
    if (item.kind === 'ability' && abilityCount + reservedAbilityCount() >= 2) return false;
    return item.kind !== 'skill' || !combatStyles.has(item.style);
  });
  const selected = [];
  while (available.length > 0 && selected.length < 3) {
    const totalWeight = available.reduce((total, item) => total + (
      ['ability', 'element'].includes(item.kind) && !save.purchasedAbilityIds.includes(item.id) ? 1.06 : 1
    ), 0);
    let choice = Math.random() * totalWeight;
    let selectedIndex = 0;
    for (; selectedIndex < available.length - 1; selectedIndex += 1) {
      choice -= ['ability', 'element'].includes(available[selectedIndex].kind) &&
        !save.purchasedAbilityIds.includes(available[selectedIndex].id) ? 1.06 : 1;
      if (choice < 0) break;
    }
    selected.push(available.splice(selectedIndex, 1)[0]);
  }
  const stock = selected.map((item) => ({
    ...item,
    cost: Math.max(MIN_ABILITY_COST, Math.min(15, item.cost + Math.max(0, currentFloor - 1) * 2)),
    purchased: false,
  }));
  const familiarOffers = shopItemCatalog.filter((item) => item.kind === 'companion' &&
    !ownedItems.has(item.id) && !reservedUpgradeIds.has(item.id));
  if (companions.length < 2 && familiarOffers.length > 0 && stock.length > 0 && Math.random() < 0.3) {
    const familiar = familiarOffers[Math.floor(Math.random() * familiarOffers.length)];
    const offerIndex = Math.floor(Math.random() * stock.length);
    stock[offerIndex] = {
      ...familiar,
      cost: Math.min(15, familiar.cost + Math.max(0, currentFloor - 1) * 2),
      purchased: false,
    };
  }
  return stock;
}

function createRoom(x, y, type = 'normal') {
  return {
    x,
    y,
    type,
    sizeKey: null,
    links: {},
    visited: false,
    cleared: false,
    entered: false,
    hidden: false,
    mainPath: false,
    secretExit: null,
    lockedDoors: {},
    rewardRoom: false,
    treasureClaimed: false,
    coinsSpawned: 0,
    rewardClaimed: false,
    shopStock: null,
    rewardUpgrade: null,
    runtime: null,
  };
}

function roomKey(room) {
  return `${currentFloor}:${room.x},${room.y}`;
}

function applyRoomSize(room) {
  if (!room.sizeKey) {
    const roll = Math.random();
    room.sizeKey = ['shop', 'bank', 'start', 'secret', 'shrine'].includes(room.type) ? 'small'
      : room.type === 'boss' ? 'large'
        : roll < 0.25 ? 'small' : roll < 0.55 ? 'large' : roll < 0.8 ? 'wide' : 'tall';
  }
  const size = ROOM_SIZES[room.sizeKey] || ROOM_SIZES.large;
  ROOM_W = size.w;
  ROOM_H = size.h;
}

// Spawn counts scale with floor area relative to the small room.
function roomAreaBonus() {
  return Math.round((ROOM_W * ROOM_H / (960 * 540) - 1) * 1.1);
}

function captureRoomRuntime(room) {
  if (!room) return null;
  const plain = (value) => JSON.parse(JSON.stringify(value));
  room.runtime = {
    enemies: plain(enemies),
    projectiles: plain(projectiles),
    enemyProjectiles: plain(enemyProjectiles),
    particles: plain(particles),
    bombs: plain(bombs),
    groundHazards: plain(groundHazards),
    breakables: breakables.map((obstacle) => {
      const { sprite, room: obstacleRoom, ...state } = obstacle;
      return {
        ...plain(state),
        spriteIndex: obstacleSprites.indexOf(sprite),
        roomKey: obstacleRoom ? roomKey(obstacleRoom) : null,
      };
    }),
    pickups: pickups.map((pickup) => {
      const { room: pickupRoom, ...state } = pickup;
      return { ...plain(state), roomKey: pickupRoom ? roomKey(pickupRoom) : null };
    }),
  };
  return room.runtime;
}

function restoreRoomRuntime(room) {
  const runtime = room.runtime;
  if (!runtime) return false;
  enemies.push(...runtime.enemies);
  projectiles.push(...runtime.projectiles);
  enemyProjectiles.push(...runtime.enemyProjectiles);
  particles.push(...runtime.particles);
  bombs.push(...runtime.bombs);
  groundHazards.push(...(runtime.groundHazards || []));
  for (const obstacle of runtime.breakables) {
    const { spriteIndex, roomKey: obstacleRoomKey, ...state } = obstacle;
    breakables.push({
      ...state,
      sprite: obstacleSprites[spriteIndex] || obstacleSprites[0],
      room: rooms.find((candidate) => roomKey(candidate) === obstacleRoomKey) || room,
    });
  }
  for (const pickup of runtime.pickups) {
    const { roomKey: pickupRoomKey, ...state } = pickup;
    pickups.push({
      ...state,
      room: pickupRoomKey ? rooms.find((candidate) => roomKey(candidate) === pickupRoomKey) : undefined,
    });
  }
  return true;
}

function serializeRun() {
  captureRoomRuntime(currentRoom);
  const roomRecords = rooms.map((room) => ({
    x: room.x,
    y: room.y,
    type: room.type,
    links: room.links,
    visited: room.visited,
    cleared: room.cleared,
    entered: room.entered,
    hidden: room.hidden,
    mainPath: room.mainPath,
    lockedDoors: room.lockedDoors,
    rewardRoom: room.rewardRoom,
    treasureClaimed: room.treasureClaimed,
    coinsSpawned: room.coinsSpawned || 0,
    sizeKey: room.sizeKey,
    rewardClaimed: room.rewardClaimed,
    shopStock: room.shopStock?.map(({ id, purchased }) => ({ id, purchased })) || null,
    rewardUpgrade: room.rewardUpgrade,
    secretExit: room.secretExit ? {
      direction: room.secretExit.direction,
      x: room.secretExit.room.x,
      y: room.secretExit.room.y,
      keyDropped: room.secretExit.keyDropped === true,
    } : null,
    returnTo: room.returnTo ? { x: room.returnTo.x, y: room.returnTo.y } : null,
    returnDirection: room.returnDirection,
    runtime: room.runtime,
  }));
  return {
    version: 1,
    characterId: character.id,
    floor: currentFloor,
    mapOrder,
    currentRoom: { x: currentRoom.x, y: currentRoom.y },
    rooms: roomRecords,
    player: {
      x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
      speed: player.speed, damage: player.damage, armor: player.armor,
      aegisCharges: player.aegisCharges,
      luck: player.luck,
      lookX: player.lookX, lookY: player.lookY,
      fireCooldown: player.fireCooldown, invuln: player.invuln,
    },
    score,
    coins,
    floorCoinsSpawned,
    floorCoinCeiling,
    floorOverflowRolled,
    keysHeld,
    bombsHeld,
    weapon,
    ownedItems: [...ownedItems],
    magicElements: [...magicElements],
    activeMagicElement,
    progressionSnapshot: runProgressionSnapshot ? {
      itemIds: [...runProgressionSnapshot.itemIds],
      enemyIds: [...runProgressionSnapshot.enemyIds],
    } : null,
    combatStyles: [...combatStyles],
    meleeWeapons: [...meleeWeapons],
    activeCombatStyle,
    frostNovaCooldown,
    equippedClothing: {
      legs: equippedClothing.legs?.id || null,
      chest: equippedClothing.chest?.id || null,
    },
    consumables,
    companions: companions.map(({ enemyCooldowns, ...companion }) => companion),
    storyLog,
  };
}

function saveRunState() {
  if (!character || !currentRoom || !['playing', 'paused'].includes(mode)) return;
  try {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(serializeRun()));
  } catch (error) {
    messageEl.textContent = 'The current run could not be saved by this browser.';
  }
}

function hasSavedRun() {
  try {
    return localStorage.getItem(RUN_STORAGE_KEY) !== null;
  } catch (error) {
    messageEl.textContent = 'Saved runs could not be read from browser storage.';
    return false;
  }
}

function restoreRun() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(RUN_STORAGE_KEY) || 'null');
  } catch (error) {
    messageEl.textContent = 'The saved run could not be read; start a new descent.';
    return false;
  }
  if (!saved || saved.version !== 1 || !Array.isArray(saved.rooms)) {
    messageEl.textContent = 'No compatible saved descent is available.';
    return false;
  }

  character = characterRoster.find((entry) => entry.id === saved.characterId);
  if (!character || !Number.isInteger(saved.floor) || saved.floor < 1 || saved.floor > finalFloor || !saved.player ||
      !saved.currentRoom || !saved.equippedClothing) {
    messageEl.textContent = 'The saved descent is incomplete; start a new descent.';
    return false;
  }
  runProgressionSnapshot = saved.progressionSnapshot
    ? {
      itemIds: new Set(saved.progressionSnapshot.itemIds || []),
      enemyIds: new Set(saved.progressionSnapshot.enemyIds || []),
    }
    : createRunProgressionSnapshot();
  selectedIndex = characterRoster.indexOf(character);
  currentFloor = saved.floor;
  const savedMapOrder = Array.isArray(saved.mapOrder) ? saved.mapOrder : [];
  const validMapOrder = savedMapOrder.length === campaignRegionIds.length &&
    savedMapOrder[0] === 'tulimshar' &&
    new Set(savedMapOrder).size === campaignRegionIds.length &&
    savedMapOrder.every((region) => campaignRegionIds.includes(region));
  mapOrder = validMapOrder ? [...savedMapOrder] : createMapOrder();
  const roomByPosition = new Map();
  rooms = saved.rooms.map((record) => {
    const room = createRoom(record.x, record.y, record.type);
    Object.assign(room, record);
    room.shopStock = record.shopStock?.map((stock) => {
      const item = shopItemCatalog.find((candidate) => candidate.id === stock.id);
      return item ? { ...item, purchased: stock.purchased } : null;
    }).filter(Boolean) || null;
    roomByPosition.set(`${room.x},${room.y}`, room);
    return room;
  });
  for (const [index, record] of saved.rooms.entries()) {
    const room = rooms[index];
    room.secretExit = record.secretExit ? {
      direction: record.secretExit.direction,
      room: roomByPosition.get(`${record.secretExit.x},${record.secretExit.y}`),
      keyDropped: record.secretExit.keyDropped === true,
    } : null;
    room.returnTo = record.returnTo
      ? roomByPosition.get(`${record.returnTo.x},${record.returnTo.y}`) : null;
  }
  reservedUpgradeIds.clear();
  for (const room of rooms) {
    if (room.rewardUpgrade && !room.rewardClaimed) reservedUpgradeIds.add(room.rewardUpgrade.id);
  }
  currentRoom = roomByPosition.get(`${saved.currentRoom.x},${saved.currentRoom.y}`);
  if (!currentRoom) return false;
  storyLog.length = 0;
  storyLog.push(...(Array.isArray(saved.storyLog) ? saved.storyLog.filter((entry) =>
    typeof entry?.title === 'string' && typeof entry?.text === 'string') : []));
  Object.assign(player, saved.player);
  player.maxHp = clamp(player.maxHp, 1, BASE_HEARTS + MAX_EXTRA_HEARTS);
  player.hp = Math.min(player.hp, player.maxHp);
  score = saved.score || 0;
  coins = saved.coins || 0;
  floorCoinsSpawned = saved.floorCoinsSpawned || 0;
  floorCoinCeiling = saved.floorCoinCeiling || SOFT_FLOOR_COINS;
  floorOverflowRolled = saved.floorOverflowRolled === true;
  keysHeld = saved.keysHeld || 0;
  bombsHeld = saved.bombsHeld || 0;
  Object.assign(weapon, saved.weapon);
  ownedItems.clear();
  for (const id of saved.ownedItems || []) ownedItems.add(id);
  magicElements.clear();
  magicElements.add('bubble');
  for (const item of shopItemCatalog) {
    if (item.kind === 'element' && ownedItems.has(item.id)) magicElements.add(item.element);
  }
  activeMagicElement = magicElements.has(saved.activeMagicElement) ? saved.activeMagicElement : 'bubble';
  combatStyles.clear();
  for (const style of saved.combatStyles || []) combatStyles.add(style);
  meleeWeapons.clear();
  for (const item of saved.meleeWeapons || []) meleeWeapons.add(item);
  activeCombatStyle = saved.activeCombatStyle;
  frostNovaCooldown = saved.frostNovaCooldown || 0;
  equippedClothing.legs = shopItemCatalog.find((item) => item.id === saved.equippedClothing?.legs) || null;
  equippedClothing.chest = shopItemCatalog.find((item) => item.id === saved.equippedClothing?.chest) || null;
  consumables.length = 0;
  consumables.push(...(saved.consumables || []));
  companions.length = 0;
  canvas.style.cursor = 'crosshair';
  mode = 'playing';
  showMap = false;
  showStoryJournal = false;
  spawnRoom(currentRoom);
  companions.push(...(saved.companions || []).map((companion) => ({
    ...companion,
    enemyCooldowns: new Map(),
  })));
  updateHud();
  showMessage('Saved descent restored.', 3);
  saveRunState();
  return true;
}

function clearSavedRun() {
  try {
    localStorage.removeItem(RUN_STORAGE_KEY);
  } catch (error) {
    messageEl.textContent = 'The completed run could not be cleared from browser storage.';
  }
}

function pauseGame() {
  if (mode !== 'playing') return;
  for (const key of Object.keys(keys)) keys[key] = false;
  pointer.down = false;
  saveRunState();
  mode = 'paused';
  showMessage('Paused. Press Start/A to resume or B to save and exit.', 9999);
}

function resumeGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  messageTimer = 0;
  messageEl.textContent = 'Room clear. Move to a doorway to continue.';
}

function exitToTitle() {
  if (mode !== 'paused') return;
  saveRunState();
  mode = 'select';
  messageTimer = 0;
  showMessage('Descent saved. Press R to resume or choose a new delver.', 5);
  updateHud();
}

const floorThemes = {
  tulimshar: { name: 'Tulimshar', wall: '#30383a', trim: '#49aaa3', detail: '#f4cb7a' },
  candor: { name: 'Candor Island', wall: '#304342', trim: '#df865d', detail: '#f2d69f' },
  hurnscald: { name: 'Hurnscald', wall: '#203a31', trim: '#6ec49a', detail: '#e9d184' },
  graveyard: { name: 'Hurnscald Graveyard', wall: '#292833', trim: '#9e739a', detail: '#c9d7ad' },
  artis: { name: 'Artis Ruins', wall: '#292e39', trim: '#d17767', detail: '#f2c28c' },
  halinarzo: { name: 'Halinarzo Savannah', wall: '#453b2b', trim: '#d79d4e', detail: '#93c77d' },
  nivalis: { name: 'Nivalis', wall: '#314754', trim: '#6ec9dc', detail: '#ecf7ef' },
  frostia: { name: 'Frostia', wall: '#2e3146', trim: '#9b9ce1', detail: '#d9dcff' },
  fortress: { name: 'Fortress Island', wall: '#2c3531', trim: '#b78558', detail: '#d3c889' },
  worldedge: { name: 'World Edge', wall: '#29253a', trim: '#a27dbc', detail: '#f1ae88' },
};
const regionalBossClues = {
  tulimshar: 'The Great Red Slime’s core beats in time with the seed. The desert did not create the pulse; it only revealed that something could answer it.',
  hurnscald: 'Jacko’s lantern flares when roots pass beneath the chamber. The pulse follows the forest roads that Hurnscald travelers take toward the World Edge.',
  graveyard: 'The Reaper leaves pale spores in the cracks between stones. The restless dead are reacting to the seed’s rhythm, not choosing a new war.',
  artis: 'The Golem’s runes repeat the mark Amelia described in her notes. It is a resemblance, not proof, but the seed brightens when the Mana Tree is named.',
  halinarzo: 'A salvaged route chart marks the same tremor beneath the savannah. The seed’s influence crosses habitats; it does not belong to one kind of monster.',
  nivalis: 'The Snowman Boss breaks apart, and the pulse continues beneath the snow. Cold can hide the signal, but it cannot silence it.',
  frostia: 'The Yeti King’s rage fades when the pulse stops. The monsters were being drawn toward the seed, not commanded by it.',
  fortress: 'Amelia’s account places the Mana Tree in these caves. The seed echoes its rhythm, though no delver can yet say whether it is a root, a splinter, or only a witness.',
  worldedge: 'At the World Edge, the seed falls quiet. The journey suggests a connection to the Mana Tree, but leaves its origin unanswered for another descent.',
};

function createUpgradeReward(idSuffix, dungeonRooms) {
  const abilityCount = ownedAbilityCount() + reservedAbilityCount();
  const upgrades = shopItemCatalog.filter((item) =>
    ['passive', 'skill', 'weapon', 'clothing', 'ability', 'element'].includes(item.kind) &&
    (item.kind === 'skill' ? !combatStyles.has(item.style) : !ownedItems.has(item.id)) &&
    isUpgradeAvailable(item) &&
    (!item.id.startsWith('heart-vessel-') || heartVesselAllowed()) &&
    (!['ability', 'element'].includes(item.kind) || save.purchasedAbilityIds.includes(item.id)) &&
    (item.kind !== 'ability' || abilityCount < 2) &&
    !reservedUpgradeIds.has(item.id) &&
    !dungeonRooms.some((room) => room.shopStock?.some((stockItem) => stockItem.id === item.id)),
  );
  const reward = upgrades.length > 0
    ? { ...upgrades[Math.floor(Math.random() * upgrades.length)] }
    : {
      id: `sanctum-blessing-${idSuffix}`,
      name: 'Sanctum Blessing',
      description: 'Gain a heart and stronger attacks',
      kind: 'passive',
    };
  reservedUpgradeIds.add(reward.id);
  return reward;
}

function generateDungeon() {
  const occupied = new Map();
  const keyFor = (x, y) => `${x},${y}`;
  const startRoom = createRoom(0, 3, 'start');
  occupied.set(keyFor(startRoom.x, startRoom.y), startRoom);

  const connectRooms = (first, second) => {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const direction = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
    first.links[direction] = true;
    second.links[oppositeDirection[direction]] = true;
    first.mainPath = true;
    second.mainPath = true;
  };
  const addConnectedRoom = (source, x, y, type = 'normal') => {
    if (x < 0 || x > 6 || y < 0 || y > 6 || occupied.has(keyFor(x, y))) return null;
    const room = createRoom(x, y, type);
    occupied.set(keyFor(x, y), room);
    connectRooms(source, room);
    return room;
  };
  const freeNeighbors = (source) => [
    { x: source.x, y: source.y - 1 },
    { x: source.x + 1, y: source.y },
    { x: source.x, y: source.y + 1 },
    { x: source.x - 1, y: source.y },
  ].filter(({ x, y }) => x >= 0 && x <= 6 && y >= 0 && y <= 6 && !occupied.has(keyFor(x, y)));
  const randomize = (items) => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  };
  const attachRoom = (sources, type) => {
    for (const source of randomize(sources)) {
      const candidates = randomize(freeNeighbors(source));
      if (candidates.length === 0) continue;
      const { x, y } = candidates[0];
      return addConnectedRoom(source, x, y, type);
    }
    return null;
  };

  const mainPath = [startRoom];
  let cursor = startRoom;
  for (let x = 1; x <= 6; x += 1) {
    const nextY = Math.max(0, Math.min(6, cursor.y + Math.floor(Math.random() * 3) - 1));
    if (nextY !== cursor.y) {
      const bend = addConnectedRoom(cursor, cursor.x, nextY);
      if (!bend) throw new Error('Could not create the main route through the dungeon.');
      mainPath.push(bend);
      cursor = bend;
    }
    const next = addConnectedRoom(cursor, x, nextY, x === 6 ? 'boss' : 'normal');
    if (!next) throw new Error('Could not create the main route through the dungeon.');
    mainPath.push(next);
    cursor = next;
  }

  if (!attachRoom([startRoom], 'normal')) {
    throw new Error('Could not create a second ordinary exit from the starting room.');
  }

  const secretHostCandidates = mainPath.filter((room) => room.type === 'normal' && room.x >= 2);
  const secretHost = randomize(secretHostCandidates.filter((room) => room.x >= 4 && room.x <= 5))
    .concat(randomize(secretHostCandidates.filter((room) => room.x < 4 || room.x > 5)))
    .find((room) => freeNeighbors(room).length > 0);
  if (!secretHost) throw new Error('Could not place the hidden sacred room.');
  const secretDirection = randomize(directions.filter((direction) =>
    secretHost.x + direction.dx >= 0 && secretHost.x + direction.dx <= 6 &&
    secretHost.y + direction.dy >= 0 && secretHost.y + direction.dy <= 6 &&
    !occupied.has(keyFor(secretHost.x + direction.dx, secretHost.y + direction.dy)),
  ))[0];
  if (!secretDirection) throw new Error('Could not connect the hidden sacred room.');
  const secret = createRoom(
    secretHost.x + secretDirection.dx,
    secretHost.y + secretDirection.dy,
    'secret',
  );
  secret.hidden = true;
  secret.returnTo = secretHost;
  secret.returnDirection = oppositeDirection[secretDirection.name];
  secret.links[secret.returnDirection] = true;
  secret.cleared = true;
  secret.rewardRoom = true;
  secretHost.secretExit = { direction: secretDirection.name, room: secret };
  occupied.set(keyFor(secret.x, secret.y), secret);

  const specialPath = mainPath.filter((room) => room.type === 'normal' && room.x >= 2 && room.x <= 5);
  const shopRoom = attachRoom(specialPath, 'shop');
  const miniBossRoom = attachRoom(specialPath, 'miniboss');
  const lockTarget = attachRoom(specialPath, 'normal');
  const bankRoom = attachRoom(specialPath, 'bank');
  if (!shopRoom || !miniBossRoom || !lockTarget || !bankRoom) {
    throw new Error('Could not place all special rooms in the generated dungeon.');
  }
  shopRoom.shopStock = createShopStock();

  const lockedDirection = directions.find((direction) => lockTarget.links[direction.name]);
  const lockSource = lockedDirection
    ? [...occupied.values()].find((room) =>
      room !== lockTarget &&
      room.x === lockTarget.x + lockedDirection.dx &&
      room.y === lockTarget.y + lockedDirection.dy)
    : null;
  if (!lockSource) throw new Error('Could not connect the locked reward room.');
  lockSource.lockedDoors[oppositeDirection[lockedDirection.name]] = true;
  lockTarget.lockedDoors[lockedDirection.name] = true;
  lockTarget.rewardRoom = true;
  lockTarget.rewardUpgrade = createUpgradeReward(`floor-${currentFloor}-locked`, [...occupied.values()]);
  keysHeld = Math.max(keysHeld, 1);
  miniBossRoom.rewardUpgrade = createUpgradeReward(`floor-${currentFloor}-miniboss`, [...occupied.values()]);
  if (Math.random() < 0.45) {
    secret.rewardUpgrade = createUpgradeReward(`floor-${currentFloor}-secret`, [...occupied.values()]);
  }
  const shrineRoom = Math.random() < 0.35 ? attachRoom(specialPath, 'shrine') : null;
  if (shrineRoom) {
    shrineRoom.rewardUpgrade = createUpgradeReward(`floor-${currentFloor}-shrine`, [...occupied.values()]);
  }

  for (const source of randomize(mainPath.filter((room) => room.type === 'normal' && room.x >= 1 && room.x <= 5))) {
    if (Math.random() < 0.45) attachRoom([source], 'normal');
  }

  return { rooms: [...occupied.values()], startRoom };
}

function strongestPlayerSingleHit() {
  const baseDamage = player.damage + weapon.damageBonus;
  let strongestHit = Math.max(1, baseDamage);
  if (combatStyles.has('melee')) {
    for (const weaponType of meleeWeapons) {
      strongestHit = Math.max(strongestHit, baseDamage +
        (weaponType === 'sword' ? 2 : weaponType === 'daggers' ? 1 : 0));
    }
  }
  if (consumables.some((item) => item.id === 'mana-burst' && item.count > 0)) {
    strongestHit = Math.max(strongestHit, 8);
  }
  if (ownedItems.has('prism') && weapon.shotCount > 1 && getActiveAttackElement()) {
    strongestHit = Math.max(strongestHit, Math.ceil(baseDamage * 1.6));
  }
  return Math.ceil(strongestHit);
}

function createEnemy(kind, x, y, boss = false) {
  recordEnemyDiscovery(kind);
  const specs = {
    ratto: { radius: 12, speed: 65, hp: 3, color: '#dbb77b', archetype: 'leaper', leapMultiplier: 3.8, leapDuration: 0.28, leapCooldown: 1.9, leapWindup: 0.18, leapHeight: 13 },
    croc: { radius: 16, speed: 42, hp: 6, color: '#90bd7c', archetype: 'charger' },
    wisp: { radius: 11, speed: 54, hp: 3, color: '#b8a5ff', archetype: 'ranged' },
    jacko: { radius: 38, speed: 58, hp: 1700, color: '#ef9d38', archetype: 'boss', tripleShot: true },
    'spider-queen': { radius: 48, speed: 46, hp: 1000, color: '#b7766e', archetype: 'boss', tripleShot: true },
    golem: { radius: 52, speed: 35, hp: 1200, color: '#bd8c68', archetype: 'boss', tripleShot: true },
    'slime-mother': { radius: 44, speed: 27, hp: 1350, color: '#d94e63', archetype: 'boss', tripleShot: true },
    bosspinkie: { radius: 24, speed: 40, hp: 16, color: '#ed8bb1', archetype: 'leaper', leapMultiplier: 3.5, leapCooldown: 3.2, leapWindup: 0.5 },
    reaper: { radius: 42, speed: 43, hp: 1250, color: '#9a81ad', archetype: 'boss', tripleShot: true },
    serqet: { radius: 34, speed: 46, hp: 900, color: '#b4a84e', archetype: 'boss', tripleShot: true },
    banditlord: { radius: 34, speed: 44, hp: 1000, color: '#aa7356', archetype: 'boss', tripleShot: true, arrowShot: true },
    'snowman-boss': { radius: 48, speed: 32, hp: 1300, color: '#b9e1ec', archetype: 'boss', tripleShot: true },
    yetiking: { radius: 52, speed: 29, hp: 1500, color: '#d4e5ef', archetype: 'boss' },
    forestdragon: { radius: 58, speed: 36, hp: 1450, color: '#8bb76e', archetype: 'boss', tripleShot: true },
    nightdragon: { radius: 58, speed: 38, hp: 1750, color: '#776498', archetype: 'boss', tripleShot: true },
    snowman: { radius: 19, speed: 30, hp: 11, color: '#a9d0df', archetype: 'ranged', tripleShot: true },
    yeti: { radius: 23, speed: 35, hp: 11, color: '#d3e2e8', archetype: 'charger' },
    vampirebat: { radius: 14, speed: 95, hp: 5, color: '#9587a9', archetype: 'diver' },
    frostiana: { radius: 14, speed: 45, hp: 6, color: '#9dd9ed', archetype: 'ranged' },
    troll: { radius: 20, speed: 32, hp: 12, color: '#8b9c70', archetype: 'charger' },
    junglefowl: { radius: 16, speed: 68, hp: 5, color: '#d89050', archetype: 'leaper', leapMultiplier: 3.5, leapCooldown: 3.2, leapWindup: 0.5 },
    fluffy: { radius: 16, speed: 58, hp: 4, color: '#ead8b9', archetype: 'summoner' },
    snail: { radius: 18, speed: 24, hp: 7, color: '#9abf78', archetype: 'trailer' },
    scorpion: { radius: 17, speed: 43, hp: 7, color: '#d29355', archetype: 'stalker' },
    bee: { radius: 10, speed: 105, hp: 2, color: '#e4c34f', archetype: 'diver' },
    bandit: { radius: 16, speed: 50, hp: 7, color: '#b47762', archetype: 'ranged', arrowShot: true },
    zombie: { radius: 20, speed: 27, hp: 12, color: '#8ca27b', archetype: 'charger' },
    'spore-sower': { radius: 18, speed: 34, hp: 8, color: '#bd80d0', archetype: 'cluster-caster' },
    bat: { radius: 15, speed: 105, hp: 4, color: '#9386bd', archetype: 'diver' },
    bluepar: { radius: 18, speed: 48, hp: 5, color: '#83c9ee', archetype: 'ranged', tripleShot: true },
    frog: { radius: 14, speed: 78, hp: 4, color: '#8fd37b', archetype: 'leaper', leapMultiplier: 6, leapDuration: 0.62, leapCooldown: 1.45, leapWindup: 0.2, leapHeight: 34 },
    mouboo: { radius: 25, speed: 39, hp: 9, color: '#d3d3c7', archetype: 'charger' },
    skeleton: { radius: 18, speed: 42, hp: 8, color: '#d7d4c8', archetype: 'ranged', bombTosser: true, bombWindup: 0.92, bombRadius: 94, bombFuse: 1.2 },
    slime: { radius: 18, speed: 35, hp: 5, color: '#88d68d', archetype: 'leaper', leapMultiplier: 2.4, leapDuration: 0.6, leapCooldown: 3.2, leapWindup: 0.6, leapHeight: 8 },
    snake: { radius: 17, speed: 50, hp: 5, color: '#d4b875', archetype: 'ranged', tripleShot: true, spitVenom: true },
    spider: { radius: 17, speed: 50, hp: 5, color: '#aaa3b3', archetype: 'web-spitter' },
  };
  const spec = specs[kind];
  const floorProgress = Math.max(0, currentFloor - 1);
  // A boss takes at least 25 good hits, plus more as the player collects abilities and items.
  const meleeBonus = combatStyles.has('melee') && meleeWeapons.has('sword') ? 2 : 0;
  const goodHit = Math.max(1, player.damage + weapon.damageBonus + meleeBonus);
  const hitsToKill = 25 + ownedAbilityCount() * 4 + Math.floor(ownedItems.size / 3) + floorProgress * 3;
  const bossHp = goodHit * hitsToKill;
  const baseEnemyHp = Math.ceil(spec.hp * (1 + floorProgress * 0.2));
  const enemyHp = Math.max(baseEnemyHp, strongestPlayerSingleHit() + 1);
  const maxHp = boss ? bossHp : enemyHp;
  return {
    x,
    y,
    kind,
    radius: spec.radius,
    // Bosses keep a speed floor so a dodging player stays only slightly ahead.
    speed: boss ? Math.max(spec.speed * (1 + floorProgress * 0.08), 140 + floorProgress * 4)
      : spec.speed * (1 + floorProgress * 0.05),
    hp: maxHp,
    maxHp,
    color: spec.color,
    boss,
    hitFlash: 0,
    freezeTimer: 0,
    slowTimer: 0,
    archetype: spec.archetype,
    tripleShot: spec.tripleShot === true,
    bombTosser: spec.bombTosser === true,
    spitVenom: spec.spitVenom === true,
    arrowShot: spec.arrowShot === true,
    bombWindup: spec.bombWindup || 0.7,
    bombRadius: spec.bombRadius || 86,
    bombFuse: spec.bombFuse || 1.05,
    leapMultiplier: spec.leapMultiplier || 3.4,
    leapDuration: spec.leapDuration || 0.42,
    leapCooldown: spec.leapCooldown || 2.1,
    leapWindup: spec.leapWindup || 0.3,
    leapHeight: spec.leapHeight || 18,
    title: ({
      jacko: 'JACKO, GHOST PUMPKIN', 'spider-queen': 'SPIDER QUEEN', golem: 'ANCIENT GOLEM',
      'slime-mother': 'GREAT RED SLIME', bosspinkie: 'PINKIE MATRIARCH', reaper: 'THE REAPER',
      serqet: 'SERQET', banditlord: 'BANDIT LORD', 'snowman-boss': 'SNOWMAN BOSS',
      yetiking: 'YETI KING', forestdragon: 'FOREST DRAGON', nightdragon: 'NIGHT DRAGON',
    })[kind] || '',
    phase: boss ? 1 : 0,
    behavior: boss ? 'jacko-idle' : spec.archetype === 'leaper' ? 'crawl'
      : spec.archetype === 'charger' ? 'patrol' : 'hover',
    stateTimer: Math.random() * 1.5,
    attackCooldown: boss ? 1.8 + Math.random() * 0.8
      : (1.5 + Math.random() * 1.8) / (1 + floorProgress * 0.08),
    bombTarget: null,
    wanderAngle: Math.random() * Math.PI * 2,
    strafeDirection: Math.random() < 0.5 ? -1 : 1,
    leapX: 0,
    leapY: 0,
    spitFlash: 0,
    laserMode: !boss && kind === 'wisp',
    laserAngle: 0,
    laserHit: false,
    spawnCooldown: 5 + Math.random() * 4,
    summonCooldown: 12 + Math.random() * 3,
    trailCooldown: 0.4,
    attackIndex: 0,
    groundPoundTarget: null,
    chargeHit: false,
  };
}

function isDoorEntrancePosition(x, y, radius = 0) {
  const doorHalfWidth = DOORWAY_HALF_WIDTH + radius + 16;
  const entranceDepth = ROOM_WALL_THICKNESS + radius + 48;
  return (Math.abs(x - ROOM_W / 2) <= doorHalfWidth &&
      (y <= entranceDepth || y >= ROOM_H - entranceDepth)) ||
    (Math.abs(y - ROOM_H / 2) <= doorHalfWidth &&
      (x <= entranceDepth || x >= ROOM_W - entranceDepth));
}

function findEnemySpawnPosition(preferredX, preferredY, radius = 18, minimumPlayerDistance = 120, ignoredObstacle = null) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = attempt === 0 && Number.isFinite(preferredX) && Number.isFinite(preferredY)
      ? { x: preferredX, y: preferredY }
      : {
        x: ROOM_WALL_THICKNESS + radius + Math.random() * (ROOM_W - 2 * (ROOM_WALL_THICKNESS + radius)),
        y: ROOM_WALL_THICKNESS + radius + Math.random() * (ROOM_H - 2 * (ROOM_WALL_THICKNESS + radius)),
      };
    if (isDoorEntrancePosition(candidate.x, candidate.y, radius) ||
      distanceBetween(candidate, player) < minimumPlayerDistance ||
      enemies.some((enemy) => distanceBetween(candidate, enemy) < radius + enemy.radius + 18) ||
      breakables.some((obstacle) => obstacle !== ignoredObstacle && !obstacle.broken &&
        distanceBetween(candidate, obstacle) < radius + obstacle.radius + 12)) continue;
    return candidate;
  }
  return null;
}

function createBreakableAt(x, y, preferredSprite) {
  const sprite = preferredSprite || obstacleSprites[Math.floor(Math.random() * obstacleSprites.length)];
  return {
    x,
    y,
    hp: sprite.hp,
    maxHp: sprite.hp,
    radius: sprite.radius,
    sprite,
    frame: sprite.frames[Math.floor(Math.random() * sprite.frames.length)],
    regenDelay: sprite.regenDelay || 0,
    regenTimer: 0,
    regenStage: sprite.type === 'regenerating' ? sprite.regenSteps : 0,
    regenSteps: sprite.regenSteps || 0,
    regenCyclesRemaining: sprite.regenCycles || 0,
    regenerating: false,
    type: sprite.type || 'breakable',
    broken: false,
    dropConsumed: false,
    ambushChance: 0,
    ambushConsumed: false,
    room: currentRoom,
  };
}

function spawnRewardRelics(room, count = 3) {
  if (room.treasureClaimed || !room.rewardRoom) return;
  const availableObstacles = obstacleSpritesByFloor[currentFloor] || obstacleSpritesByFloor[3];
  const guaranteedSprite = availableObstacles.find((sprite) =>
    sprite.type !== 'solid' && sprite.type !== 'bomb-only',
  ) || availableObstacles.find((sprite) => sprite.type !== 'solid');
  const preferredPositions = [
    { x: ROOM_W / 2 - 180, y: ROOM_H / 2 - 130 },
    { x: ROOM_W / 2 + 180, y: ROOM_H / 2 - 130 },
    { x: ROOM_W / 2, y: ROOM_H / 2 },
  ];
  let guaranteedSpawned = false;
  for (let index = 0; index < count; index += 1) {
    const sprite = guaranteedSpawned
      ? availableObstacles[index % availableObstacles.length] : guaranteedSprite;
    if (!sprite) continue;
    const preferred = preferredPositions[index % preferredPositions.length];
    const position = findEnemySpawnPosition(preferred.x, preferred.y, sprite.radius, 50);
    if (!position) continue;
    const relic = createBreakableAt(position.x, position.y, sprite);
    relic.room = room;
    relic.guaranteedDrop = !guaranteedSpawned;
    guaranteedSpawned = true;
    relic.ambushChance = room.type === 'secret' ? 0.28 : 0;
    breakables.push(relic);
  }
  if (room.type === 'secret') {
    spawnCoin(ROOM_W / 2 - 60, ROOM_H / 2 + 100, { room });
    spawnCoin(ROOM_W / 2 + 60, ROOM_H / 2 + 100, { room });
    if (Math.random() < 0.2) pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2 + 150, kind: 'bomb', room });
    if (Math.random() < 0.2) pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2 + 60, kind: 'heart', room });
  }
}

function damageObstacle(obstacle, damage = 1, source = 'projectile') {
  if (!obstacle || obstacle.broken || !breakables.includes(obstacle)) return;
  if (obstacle.type === 'solid' || (obstacle.type === 'bomb-only' && source !== 'bomb')) return;
  obstacle.hp -= damage;
  obstacle.regenTimer = obstacle.regenerating ? 0.65 : obstacle.regenTimer;
  if (obstacle.hp > 0) return;

  if (!obstacle.dropConsumed) {
    obstacle.dropConsumed = true;
    const bombDrop = source === 'bomb' && Math.random() < 0.5;
    if (bombDrop || obstacle.guaranteedDrop) {
      const coinDrop = !bombDrop && Math.random() < 0.6 && reserveCoin();
      pickups.push({
        x: obstacle.x,
        y: obstacle.y,
        kind: coinDrop ? 'coin' : 'bomb',
        guaranteedTreasure: obstacle.guaranteedDrop === true,
        room: obstacle.room,
      });
    } else if (obstacle.bossSpawned) {
      if (Math.random() < 0.07 + player.luck * 0.03) {
        pickups.push({ x: obstacle.x, y: obstacle.y, kind: ['bomb', 'heart', 'key'][Math.floor(Math.random() * 3)] });
      }
    } else {
      const roll = Math.random();
      if (roll < 0.08) spawnCoin(obstacle.x, obstacle.y);
      else if (roll < 0.12) pickups.push({ x: obstacle.x, y: obstacle.y, kind: 'heart' });
    }
  }
  if (!obstacle.ambushConsumed && obstacle.ambushChance > 0) {
    obstacle.ambushConsumed = true;
    if (Math.random() < obstacle.ambushChance) {
      const kind = ['ratto', 'wisp', 'croc'][Math.floor(Math.random() * 3)];
      const spawn = findEnemySpawnPosition(
        obstacle.x + (Math.random() - 0.5) * 42,
        obstacle.y + (Math.random() - 0.5) * 42,
        16,
        0,
        obstacle,
      );
      if (spawn) {
        const ambusher = createEnemy(kind, spawn.x, spawn.y);
        ambusher.surpriseSpawn = true;
        enemies.push(ambusher);
        obstacle.room.cleared = false;
        if (currentRoom === obstacle.room) showMessage(`A ${kind} bursts from the broken relic!`, 3);
        addParticles(obstacle.x, obstacle.y, '#c7a0ec', 14, 130);
      }
    }
  }
  addParticles(obstacle.x, obstacle.y, '#b8a786', 8, 90);
  if (obstacle.regenCyclesRemaining > 0) {
    obstacle.regenCyclesRemaining -= 1;
    obstacle.broken = true;
    obstacle.regenerating = true;
    obstacle.regenStage = 0;
    obstacle.regenTimer = obstacle.regenDelay;
  } else {
    breakables.splice(breakables.indexOf(obstacle), 1);
  }
}

function updateBreakables(dt) {
  for (const obstacle of [...breakables]) {
    if (!obstacle.regenerating) continue;
    obstacle.regenTimer -= dt;
    if (obstacle.regenTimer > 0) continue;
    if (obstacle.broken) obstacle.broken = false;
    obstacle.regenStage += 1;
    obstacle.hp = Math.max(1, Math.ceil(obstacle.maxHp * obstacle.regenStage / obstacle.regenSteps));
    obstacle.regenTimer = 0.75;
    if (obstacle.regenStage >= obstacle.regenSteps) {
      obstacle.hp = obstacle.maxHp;
      obstacle.regenerating = false;
      obstacle.regenTimer = 0;
    }
    addParticles(obstacle.x, obstacle.y, '#a4cc84', 5, 45);
  }
}

function grantUpgrade(item, source = 'descent') {
    if (['ability', 'element'].includes(item.kind) && source !== 'shop' &&
        !save.purchasedAbilityIds.includes(item.id)) {
      showMessage(`${item.name} must first be purchased from a shop.`, 3);
      return false;
    }
  if (!isUpgradeAvailable(item)) {
    showMessage('That upgrade is not available yet.', 2);
    return false;
  }
  if (item.kind === 'ability' && (ownedItems.has(item.id) || ownedAbilityCount() >= 2)) {
    showMessage('Your two ability slots are already filled.', 2);
    return false;
  }
  if (['ability', 'element', 'skill'].includes(item.kind)) {
    weapon.fireDelay = Math.max(0.55, weapon.fireDelay * 0.88);
  }
  if (item.id === 'sanctum-blessing' || item.id.startsWith('sanctum-blessing-')) {
    if (extraHearts() < SOFT_EXTRA_HEARTS) gainMaxHeart();
    weapon.damageBonus += 1;
  } else if (item.id.startsWith('heart-vessel-')) {
    if (!gainMaxHeart()) {
      showMessage('Your heart capacity is already at its limit.', 2);
      return false;
    }
  } else if (item.id.startsWith('luck-up-')) {
    player.luck += 1;
  } else if (item.kind === 'clothing') {
    equipClothing(item);
  } else if (item.id === 'pearl') {
    weapon.tearSize *= 1.45;
    weapon.damageBonus += 1;
  } else if (item.id === 'prism') {
    const previousShotCount = weapon.shotCount;
    weapon.shotCount = Math.min(3, weapon.shotCount + 2);
    weapon.shotDamageMultiplier *= previousShotCount / weapon.shotCount;
  } else if (item.id === 'feather') {
    weapon.fireDelay = Math.max(0.11, weapon.fireDelay * 0.7);
    weapon.projectileSpeed += 70;
  } else if (rangeLensItemIds.includes(item.id)) {
    weapon.rangeMultiplier *= 1.35;
    weapon.rangeLevel += 1;
  } else if (item.kind === 'skill') {
    combatStyles.add(item.style);
  } else if (item.kind === 'weapon') {
    combatStyles.add('melee');
    meleeWeapons.add(item.weapon);
  } else if (item.kind === 'element') {
    combatStyles.add('magic');
    magicElements.add(item.element);
    activeMagicElement = item.element;
  } else if (item.id === 'frost-rune') {
    frostNovaCooldown = 0;
  } else if (item.id === 'bonded-aegis') {
    player.aegisCharges = 3;
  }
  ownedItems.add(item.id);
  recordItemDiscovery(item);
  reservedUpgradeIds.delete(item.id);
  updateHud();
  showMessage(
    item.kind === 'clothing'
      ? `${item.name} equipped. Speed ${player.speed}; armor ${player.armor}.`
      : attackMorphs[item.id]
        ? `${item.name} acquired. Your attacks change: ${attackMorphs[item.id].label}.`
        : `${item.name} acquired. Your mana answers to practice, not birthright.`,
    3,
  );
  return true;
}

function equipClothing(item) {
  const previous = equippedClothing[item.slot];
  if (previous) {
    player.speed -= previous.speedBonus;
    player.armor = Math.max(0, player.armor - previous.armorBonus);
  }
  equippedClothing[item.slot] = item;
  player.speed += item.speedBonus;
  player.armor += item.armorBonus;
}

const enemyUnlockAtSeconds = {
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

function isEnemyAvailableForCurrentRun(kind) {
  const unlockAtSeconds = enemyUnlockAtSeconds[kind];
  if (!unlockAtSeconds) return true;
  const availableEnemies = runProgressionSnapshot?.enemyIds || createRunProgressionSnapshot().enemyIds;
  return availableEnemies.has(kind);
}

function enemyKindsForCurrentMap() {
  const fallbackKinds = ['slime', 'ratto', 'bat', 'snake', 'scorpion', 'bandit'];
  const pools = {
    tulimshar: ['slime', 'ratto', 'bat', 'snake', 'scorpion', 'bandit'],
    candor: ['ratto', 'croc', 'wisp', 'bat', 'snake', 'slime', 'scorpion'],
    hurnscald: ['ratto', 'croc', 'wisp', 'frog', 'spider', 'mouboo', 'bluepar', 'bee', 'spore-sower', 'fluffy', 'snail'],
    graveyard: ['skeleton', 'zombie', 'spider', 'vampirebat'],
    artis: ['ratto', 'wisp', 'skeleton', 'spider', 'slime', 'bluepar', 'zombie', 'fluffy', 'snail'],
    halinarzo: ['bandit', 'scorpion', 'mouboo', 'spore-sower', 'croc', 'junglefowl'],
    nivalis: ['snowman', 'yeti', 'vampirebat', 'wisp', 'bee'],
    frostia: ['frostiana', 'snowman', 'yeti', 'vampirebat', 'spore-sower'],
    fortress: ['troll', 'zombie', 'junglefowl', 'spore-sower', 'bandit', 'mouboo', 'snake'],
    worldedge: ['skeleton', 'zombie', 'vampirebat', 'troll', 'spider', 'frostiana'],
  };
  const availableKinds = (pools[currentRegionId()] || pools.tulimshar).filter(isEnemyAvailableForCurrentRun);
  return availableKinds.length > 0 ? availableKinds : fallbackKinds;
}

function applyEliteMutation(enemy) {
  if (enemy.boss || enemy.miniBoss || currentFloor < 2) return enemy;
  const eliteChance = Math.min(0.28, 0.04 + (currentFloor - 1) * 0.06);
  if (Math.random() >= eliteChance) return enemy;
  const mutation = Math.random() < 0.5 ? 'swift' : 'armored';
  enemy.elite = true;
  enemy.eliteMutation = mutation;
  enemy.maxHp = Math.ceil(enemy.maxHp * (1.35 + currentFloor * 0.08));
  enemy.hp = enemy.maxHp;
  enemy.speed *= mutation === 'swift' ? 1.28 : 0.86;
  enemy.radius += 2;
  enemy.color = mutation === 'swift' ? '#d7c2ff' : '#f1c77d';
  return enemy;
}

let enemyLinkSequence = 0;

function linkEnemyTwins(first, second) {
  const roomKey = currentRoom ? `${currentRoom.x}-${currentRoom.y}` : 'test-room';
  const linkId = `${currentFloor}-${roomKey}-${enemyLinkSequence}`;
  enemyLinkSequence += 1;
  first.linkId = linkId;
  second.linkId = linkId;
  first.linkShieldCharges = 3;
  second.linkShieldCharges = 3;
  first.linkShieldSeen = false;
  second.linkShieldSeen = false;
  first.speed *= 1.08;
  second.speed *= 1.08;
}

function miniBossKindsForCurrentFloor() {
  const pools = {
    tulimshar: ['bosspinkie', 'scorpion', 'bandit'],
    hurnscald: ['mouboo', 'spider', 'spider-queen', 'bluepar'],
    graveyard: ['skeleton', 'zombie', 'spider'],
    artis: ['skeleton', 'spore-sower', 'mouboo'],
    halinarzo: ['scorpion', 'bandit', 'junglefowl'],
    nivalis: ['snowman', 'yeti', 'vampirebat'],
    frostia: ['frostiana', 'yeti', 'snowman'],
    fortress: ['troll', 'junglefowl', 'spore-sower'],
    worldedge: ['troll', 'skeleton', 'zombie'],
  };
  const availableKinds = (pools[currentRegionId()] || pools.tulimshar).filter(isEnemyAvailableForCurrentRun);
  return availableKinds.length > 0 ? availableKinds : ['bosspinkie', 'scorpion', 'bandit'];
}

function bossForCurrentArea() {
  return ({
    tulimshar: 'slime-mother', hurnscald: 'jacko',
    graveyard: 'reaper', artis: 'golem', halinarzo: 'banditlord',
    nivalis: 'snowman-boss', frostia: 'yetiking', fortress: 'forestdragon', worldedge: 'nightdragon',
  })[currentRegionId()] || 'slime-mother';
}

function spawnRoom(room) {
  applyRoomSize(room);
  if (room.type === 'start' && !room.entered) {
    player.x = ROOM_W / 2;
    player.y = ROOM_H / 2;
  }
  const wasCleared = room.cleared;
  enemies.length = 0;
  projectiles.length = 0;
  enemyProjectiles.length = 0;
  particles.length = 0;
  pickups.length = 0;
  bombs.length = 0;
  groundHazards.length = 0;
  breakables.length = 0;
  for (const companion of companions) {
    companion.hp = companion.maxHp;
    companion.respawnTimer = 0;
    companion.hitCooldown = 0;
    companion.x = player.x;
    companion.y = player.y;
    companion.enemyCooldowns = new Map();
  }
    if (room.rewardUpgrade && !room.rewardClaimed &&
      (room.type !== 'miniboss' || room.cleared) &&
      (room.type !== 'shrine' || room.cleared)) {
    pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, kind: 'upgrade', item: room.rewardUpgrade, room });
  }
  room.visited = true;
  if (restoreRoomRuntime(room)) {
    room.visited = true;
    room.entered = true;
    updateHud();
    return;
  }
  if (room.type === 'shop' || room.type === 'bank' || room.type === 'start') {
    room.cleared = true;
  } else if (room.type === 'secret') {
    room.cleared = true;
  } else if (room.type === 'boss') {
    if (!room.entered) {
      const bossKind = bossForCurrentArea();
      const bossSpec = monsterSprites[bossKind];
      const spawn = findEnemySpawnPosition(
        ROOM_W * 0.7,
        ROOM_H * 0.45,
        bossSpec.frameWidth * bossSpec.scale / 2,
        150,
      );
      if (spawn) enemies.push(createEnemy(bossKind, spawn.x, spawn.y, true));
    } else if (!room.cleared) {
      room.cleared = true;
    }
  } else if (room.type === 'miniboss') {
    if (!room.entered) {
      const kinds = miniBossKindsForCurrentFloor();
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const miniBoss = createEnemy(kind, ROOM_W * 0.68, ROOM_H * 0.5);
      miniBoss.miniBoss = true;
      miniBoss.phase = 1;
      miniBoss.hp = Math.max(18 + currentFloor * 3, strongestPlayerSingleHit() + 1);
      miniBoss.maxHp = miniBoss.hp;
      miniBoss.radius = Math.max(miniBoss.radius, 22);
      miniBoss.speed *= 0.75;
      miniBoss.title = {
        croc: 'MARSH KRAB', scorpion: 'DUNE STALKER', bandit: 'ROAD CAPTAIN',
        bosspinkie: 'PINKIE MATRIARCH',
        mouboo: 'MOU-BOO ELDER', spider: 'RUIN STALKER', 'spider-queen': 'SPIDER QUEEN',
        bluepar: 'GREAT BLUEPAR',
        skeleton: 'BONE WARDEN', zombie: 'RESTLESS VETERAN', 'spore-sower': 'SPORE SOWER',
        junglefowl: 'SAVANNAH RAZORBEAK', snowman: 'FROSTBOUND SENTINEL', yeti: 'YETI BRUTE',
        vampirebat: 'NIGHTWING', frostiana: 'FROST WITCH', troll: 'CAVE TROLL',
      }[kind];
      const spawn = findEnemySpawnPosition(miniBoss.x, miniBoss.y, miniBoss.radius, 150);
      if (spawn) {
        miniBoss.x = spawn.x;
        miniBoss.y = spawn.y;
        enemies.push(miniBoss);
      }
    }
  } else if (!room.cleared) {
    const kinds = enemyKindsForCurrentMap();
    const emptyRoomChance = [0.4, 0.25, 0.12][currentFloor - 1] || 0.12;
    if (room.type === 'shrine' || Math.random() >= emptyRoomChance) {
      const count = (room.type === 'shrine' ? 2 + currentFloor : 1 + currentFloor + Math.floor(Math.random() * 2)) + roomAreaBonus();
      let linkedPairSpawned = false;
      for (let i = 0; i < count; i += 1) {
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const spawn = findEnemySpawnPosition(180 + Math.random() * (ROOM_W - 360), 120 + Math.random() * (ROOM_H - 240));
        if (!spawn) continue;
        const enemy = applyEliteMutation(createEnemy(kind, spawn.x, spawn.y));
        enemies.push(enemy);
        if (!linkedPairSpawned && currentFloor >= 2 && i < count - 1 && Math.random() < 0.16) {
          const twinPosition = findEnemySpawnPosition(spawn.x + 70, spawn.y + 18, enemy.radius, 0);
          if (twinPosition) {
            const twin = applyEliteMutation(createEnemy(kind, twinPosition.x, twinPosition.y));
            linkEnemyTwins(enemy, twin);
            enemies.push(twin);
            linkedPairSpawned = true;
          }
        }
      }
    }
    const availableObstacles = obstacleSpritesByFloor[currentFloor] || obstacleSpritesByFloor[3];
    const obstacleCount = Math.floor(Math.random() * (Math.min(3, currentFloor + 1) + 1)) + roomAreaBonus();
    for (let i = 0; i < obstacleCount; i += 1) {
      const sprite = availableObstacles[Math.floor(Math.random() * availableObstacles.length)];
      let position;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const candidate = { x: 120 + Math.random() * (ROOM_W - 240), y: 100 + Math.random() * (ROOM_H - 200) };
        const clearsPlayer = distanceBetween(candidate, player) > sprite.radius + player.radius + 36;
        const clearsEnemies = enemies.every((enemy) =>
          distanceBetween(candidate, enemy) > sprite.radius + enemy.radius + 18,
        );
        if (clearsPlayer && clearsEnemies && breakables.every((other) =>
          distanceBetween(candidate, other) > sprite.radius + other.radius + 18,
        )) {
          position = candidate;
          break;
        }
      }
      if (position) {
        breakables.push(createBreakableAt(position.x, position.y, sprite));
      }
    }
    if (enemies.length === 0) room.cleared = true;
  }
  if (room.rewardRoom && !room.treasureClaimed) spawnRewardRelics(room, room.type === 'secret' ? 3 : 2);
  room.entered = true;

  if (room.type === 'start') {
    const regionStories = {
      tulimshar: 'Tulimshar is the first stop: its guards, guilds, and desert trade make it a busy crossing. The mana seed’s first pulse was traced to an old road outside the city.',
      candor: 'Candor Island is where many new adventurers learn the roads. This side-story follows a rumor from the coast; it leaves the island’s established stories intact.',
      hurnscald: 'Hurnscald’s mayor Rakinorf is a known contact for travelers asking about the World Edge. The seed pulse is now stronger beneath the forest road.',
      graveyard: 'The old graveyard is quiet until the seed pulse passes under the stones. The restless dead are reacting to it, not to a change in their recorded history.',
      artis: 'Amelia in the Artis Ruins tells of a Mana Tree in a cave on Fortress Island, saddened by war. The seed may be answering that distant wound.',
      halinarzo: 'Halinarzo’s library and savannah roads offer clues about old passages. A repeated mark in the journal matches the pulse from the seed.',
      nivalis: 'Nivalis lies under snow. The Blue Sage is said to know more about the northern trails; the seed’s pulse carries through the ice.',
      frostia: 'Frostia is ruled by King Gelid. The ice caves amplify the seed’s pulse, drawing nearby monsters toward the trail.',
      fortress: 'Fortress Island is where Amelia places the Mana Tree, deep in the eastern caves. The seed’s source is close, but the delver’s account remains a side-story.',
      worldedge: 'The trail reaches the World Edge, a destination discussed by Hurnscald travelers. The seed’s signal is strongest here, but what follows is this delver’s side-story.',
    };
    storyText = regionStories[currentRegionId()];
    if (currentRegionId() === 'hurnscald' && unlockCharacter('hurnscald-herbalist')) {
      showMessage('Reached Hurnscald: Hurnscald Herbalist is now selectable.', 4);
    }
    if (currentRegionId() === 'artis' && unlockCharacter('artis-archivist')) {
      showMessage('Reached the Artis Ruins: Artis Archivist is now selectable.', 4);
    }
  } else if (room.type === 'boss') {
    storyText = `${currentFloorTheme().name}: a guardian bars this optional side-story route. These encounters do not alter the established TMW quest history.`;
  } else if (room.type === 'miniboss') {
    storyText = 'A powerful sentinel guards this optional side chamber.';
  } else if (room.type === 'secret') {
    storyText = 'A sacred chamber rests undisturbed, its hidden relics holding a gift. Disturb them at your own risk.';
    if (!save.warden) {
      save.warden = true;
      persistSave();
      queueChapter('character:warden', characterChapters.warden);
      showMessage('Secret found: Rogue is now selectable.', 4);
    }
    unlockCharacter('world-edge-pilgrim');
  } else if (room.type === 'shop') {
    storyText = 'A traveling keeper offers supplies to those brave enough to descend.';
  } else if (room.type === 'bank') {
    storyText = 'A quiet vault protects your stored zenny between descents.';
  } else {
    storyText = '';
  }

  if (room.type === 'normal' && room.cleared && !wasCleared) {
    showMessage('Quiet room. Doors unlocked.', 2.5);
  }
  updateHud();
  if (storyText) {
    recordStory(`${currentFloorTheme().name} · ${room.type}`, storyText);
    showMessage(storyText, 7);
  }
  saveRunState();
}

function beginRun() {
  stopPrologueNarration();
  const entry = characterRoster[selectedIndex];
  if (!isCharacterUnlocked(entry)) {
    showMessage(`${entry.name} is locked: ${entry.unlock}.`, 3);
    return;
  }

  character = entry;
  unlockPlaytimeItems(false);
  runProgressionSnapshot = createRunProgressionSnapshot();
  storyLog.length = 0;
  canvas.style.cursor = 'crosshair';
  player.maxHp = 4;
  player.hp = 4;
  player.speed = entry.speed;
  player.damage = entry.damage;
  player.armor = 0;
  player.aegisCharges = 0;
  player.luck = 0;
  player.damageFlashTimer = 0;
  player.attackPulse = 0;
  player.attackAnimationTimer = 0;
  player.attackAnimationStyle = 'hand';
  hitStopTimer = 0;
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
  weapon.shotDamageMultiplier = weapon.fireDelay / (entry.fireDelay || 0.23);
  weapon.damageBonus = 0;
  frostNovaCooldown = 0;
  ownedItems.clear();
  magicElements.clear();
  magicElements.add('bubble');
  activeMagicElement = 'bubble';
  combatStyles.clear();
  meleeWeapons.clear();
  meleeWeapons.add('hands');
  reservedUpgradeIds.clear();
  combatStyles.add(entry.startingStyle);
  activeCombatStyle = entry.startingStyle;
  if (entry.startingAbility) ownedItems.add(entry.startingAbility);
  consumables.length = 0;
  companions.length = 0;
  player.meleeSwings = [];
  player.radius = 12;
  player.x = ROOM_W / 2;
  player.y = ROOM_H / 2;
  player.fireCooldown = 0;
  player.invuln = 0;
  mapOrder = createMapOrder();
  currentFloor = 1;
  score = 0;
  coins = 0;
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
    humanMale: 'Humans in this delver tale read the seed through memory and craft: tools, maps, and the repeating marks left in old roads.',
    humanFemale: 'Humans in this delver tale read the seed through memory and craft: tools, maps, and the repeating marks left in old roads.',
    elfMale: 'Elven delvers listen for mana moving through living roots. The seed’s pulse sounds familiar, but they cannot tell whether it is kin to the Mana Tree.',
    elfFemale: 'Elven delvers listen for mana moving through living roots. The seed’s pulse sounds familiar, but they cannot tell whether it is kin to the Mana Tree.',
    orcMale: 'Orc delvers feel the pulse as weight in stone and bone. Their strength helps them endure it, not command it.',
    tritanMale: 'Tritan delvers compare the seed’s rhythm to distant tides: a signal can cross a boundary without revealing its source.',
    raijinFemale: 'Raijin delvers notice the pressure before the pulse, like weather gathering beyond sight. The clue is sensation, not certainty.',
  };
  recordStory('Ancestry · ' + entry.className, ancestryNotes[entry.raceHead] ||
    'This delver reads the seed through a tradition not yet written into the field notes.');
  spawnRoom(currentRoom);
  saveRunState();
  discoverRegion();
}

function tryUnlock(room, direction) {
  if (!room.lockedDoors[direction]) return true;
  if (keysHeld <= 0) {
    showMessage('This door is locked. Find a key.', 2);
    return false;
  }
  keysHeld -= 1;
  delete room.lockedDoors[direction];
  const target = rooms.find((candidate) =>
    candidate.x === room.x + directions.find((item) => item.name === direction).dx &&
    candidate.y === room.y + directions.find((item) => item.name === direction).dy,
  );
  if (target) delete target.lockedDoors[oppositeDirection[direction]];
  updateHud();
  showMessage(`Door unlocked with a key. ${keysHeld} key${keysHeld === 1 ? '' : 's'} remaining.`, 2);
  return true;
}

function enterDoor(direction) {
  if (!currentRoom.cleared) return;
  const placeAtEntry = () => {
    applyRoomSize(currentRoom);
    const sideClearance = ROOM_WALL_THICKNESS + PLAYER_VISUAL_HALF_WIDTH + WALL_COLLISION_PADDING;
    const verticalClearance = ROOM_WALL_THICKNESS + player.radius + WALL_COLLISION_PADDING;
    const topClearance = ROOM_WALL_THICKNESS + PLAYER_VISUAL_HEIGHT + WALL_COLLISION_PADDING;
    player.x = direction === 'left' ? ROOM_W - sideClearance
      : direction === 'right' ? sideClearance : ROOM_W / 2;
    player.y = direction === 'up' ? ROOM_H - verticalClearance
      : direction === 'down' ? topClearance : ROOM_H / 2;
  };
  if (currentRoom.secretExit?.direction === direction) {
    const secret = currentRoom.secretExit.room;
    if (!secret.hidden) {
      captureRoomRuntime(currentRoom);
      currentRoom = secret;
      placeAtEntry();
      spawnRoom(currentRoom);
      saveRunState();
    }
    return;
  }
  if (currentRoom.type === 'secret' && currentRoom.returnDirection === direction) {
    captureRoomRuntime(currentRoom);
    currentRoom = currentRoom.returnTo;
    placeAtEntry();
    spawnRoom(currentRoom);
    saveRunState();
    return;
  }
  if (!currentRoom.links[direction] || !tryUnlock(currentRoom, direction)) return;

  const vector = directions.find((item) => item.name === direction);
  const room = rooms.find((candidate) => candidate.x === currentRoom.x + vector.dx && candidate.y === currentRoom.y + vector.dy);
  if (!room) return;
  captureRoomRuntime(currentRoom);
  currentRoom = room;
  placeAtEntry();
  spawnRoom(currentRoom);
  saveRunState();
}

const MAX_PLAYER_VOLLEY = 4;
const MAX_PLAYER_PROJECTILES = 64;

// The two newest morph-capable items define how shots look and behave; some trade power for flair.
const attackMorphs = {
  'frost-rune': { label: 'Frost Shards', shape: 'diamond', color: '#9fe7f3', slowOnHit: 0.9, speedMul: 0.88, damageMul: 0.9 },
  'spore-bloom': { label: 'Spore Seeds', shape: 'seed', color: '#d78be7', drop: 'short', pulse: 0.16 },
  'bonded-aegis': { label: 'Bulwark Ring', shape: 'ring', color: '#d3e2ff', surround: true, damageMul: 0.65, delayMul: 1.25 },
  'element-fire': { label: 'Ember Bursts', explode: 46, sizeMul: 1.1 },
  'element-lightning': { label: 'Storm Pulses', pulse: 0.28, speedMul: 1.15, damageMul: 0.9 },
  'element-gas': { label: 'Miasma Drops', drop: 'long', speedMul: 0.82 },
};

function activeAttackMorph() {
  const morph = {
    shape: null, color: null, drop: null, pulse: 0, explode: 0, slowOnHit: 0, surround: false,
    speedMul: 1, damageMul: 1, sizeMul: 1, delayMul: 1,
  };
  for (const id of [...ownedItems].filter((itemId) => attackMorphs[itemId]).slice(-2)) {
    const source = attackMorphs[id];
    for (const key of ['shape', 'color', 'drop']) if (source[key]) morph[key] = source[key];
    morph.pulse = Math.max(morph.pulse, source.pulse || 0);
    morph.explode = Math.max(morph.explode, source.explode || 0);
    morph.slowOnHit = Math.max(morph.slowOnHit, source.slowOnHit || 0);
    morph.surround = morph.surround || source.surround === true;
    for (const key of ['speedMul', 'damageMul', 'sizeMul', 'delayMul']) morph[key] *= source[key] || 1;
  }
  return morph;
}

function applyMorphLanding(projectile, primaryTarget) {
  if (projectile.owner === 'companion') return;
  if (projectile.explode) {
    addParticles(projectile.x, projectile.y, projectile.color, 14, 130);
    for (const enemy of [...enemies]) {
      if (enemy === primaryTarget || distanceBetween(enemy, projectile) > projectile.explode + enemy.radius) continue;
      damageEnemy(enemy, Math.max(1, Math.round(projectile.damage * 0.5)), projectile.x, projectile.y);
    }
  }
  if (projectile.drop && groundHazards.filter((hazard) => hazard.owner === 'player').length < 4) {
    const long = projectile.drop === 'long';
    createGroundHazard(projectile.x, projectile.y, 'miasma', 'player', {
      radius: long ? 40 : 28, duration: long ? 5 : 1.8, color: projectile.color,
    });
  }
}

function spawnPlayerProjectile(projectile) {
  if (projectiles.length >= MAX_PLAYER_PROJECTILES) {
    const expendableIndex = projectiles.findIndex((entry) => entry.owner === 'companion');
    projectiles.splice(expendableIndex >= 0 ? expendableIndex : 0, 1);
  }
  projectiles.push({ ...projectile, owner: projectile.owner || 'player' });
}

function shoot() {
  if (mode !== 'playing') return;
  const learnedStyles = [...combatStyles];
  const rangedStyles = learnedStyles.filter((style) => style === 'magic' || style === 'bow');
  const attackDelay = rangedStyles.length > 0 ? weapon.fireDelay : character.fireDelay || 0.3;
  if (player.fireCooldown > 0) return;
  player.attackPulse = 0.14;
  player.attackAnimationStyle = combatStyles.has('bow') ? 'bow' : 'hand';
  player.attackAnimationTimer = player.attackAnimationStyle === 'bow' ? 0.4 : 0.32;
  const baseAngle = pointer.down
    ? Math.atan2(pointer.y + camera.y - player.y, pointer.x + camera.x - player.x)
    : Math.atan2(player.lookY, player.lookX);
  const attackOriginY = player.y - 34;
  if (pointer.down) {
    player.lookX = Math.cos(baseAngle);
    player.lookY = Math.sin(baseAngle);
  }
  if (combatStyles.has('melee')) {
    const ownedWeapons = [...meleeWeapons];
    const strikeRange = Math.max(...ownedWeapons.map((item) => item === 'sword' ? 92 : item === 'daggers' ? 53 : 66));
    const damage = player.damage + weapon.damageBonus +
      ownedWeapons.reduce((bonus, item) => bonus + (item === 'sword' ? 2 : item === 'daggers' ? 1 : 0), 0);
    for (const enemy of [...enemies]) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - attackOriginY;
      const distance = Math.hypot(dx, dy);
      const angleDifference = Math.atan2(Math.sin(Math.atan2(dy, dx) - baseAngle), Math.cos(Math.atan2(dy, dx) - baseAngle));
      if (distance <= strikeRange + enemy.radius && Math.abs(angleDifference) < 0.95 &&
        hasLineOfSight(player, enemy)) {
        const element = getActiveAttackElement();
        if (element) {
          resolveElementalImpact({
            x: enemy.x, y: enemy.y,
            vx: Math.cos(baseAngle), vy: Math.sin(baseAngle),
            damage, element,
          }, enemy);
        } else {
          damageEnemy(enemy, damage, player.x, attackOriginY);
        }
      }
    }
    for (let index = breakables.length - 1; index >= 0; index -= 1) {
      const obstacle = breakables[index];
      const dx = obstacle.x - player.x;
      const dy = obstacle.y - attackOriginY;
      const distance = Math.hypot(dx, dy);
      const angleDifference = Math.atan2(Math.sin(Math.atan2(dy, dx) - baseAngle), Math.cos(Math.atan2(dy, dx) - baseAngle));
      if (distance > strikeRange + obstacle.radius || Math.abs(angleDifference) >= 0.95) continue;
      damageObstacle(obstacle, damage, 'melee');
    }
    player.meleeSwings = ownedWeapons.map((item, index) => ({
      angle: baseAngle,
      timer: 0.2 + index * 0.035,
      maxTimer: 0.2 + index * 0.035,
      reach: item === 'sword' ? 92 : item === 'daggers' ? 53 : 66,
      weapon: item,
      element: getActiveAttackElement(),
    }));
    addParticles(player.x + Math.cos(baseAngle) * 44, attackOriginY + Math.sin(baseAngle) * 44,
      combatPalette.melee, 7 + ownedWeapons.length * 3, 100);
    updateHud();
  }
  const morph = activeAttackMorph();
  const orderedStyles = [...rangedStyles].sort((first, second) =>
    Number(second === activeCombatStyle) - Number(first === activeCombatStyle));
  let volleyBudget = MAX_PLAYER_VOLLEY;
  for (const style of orderedStyles) {
    if (volleyBudget <= 0) break;
    const styleOffset = rangedStyles.length > 1 && style !== activeCombatStyle
      ? style === 'magic' ? -0.08 : 0.08
      : 0;
    const element = getActiveAttackElement();
    const fusedElementalShot = !morph.surround && ownedItems.has('prism') && Boolean(element) && weapon.shotCount > 1;
    const shotCount = Math.min(morph.surround ? 4 : fusedElementalShot ? 1 : weapon.shotCount, volleyBudget);
    volleyBudget -= shotCount;
    const spread = shotCount === 1 ? 0 : 0.16;
    for (let shot = 0; shot < shotCount; shot += 1) {
      const angle = morph.surround
        ? baseAngle + styleOffset + shot * Math.PI / 2
        : baseAngle + styleOffset + (shot - (shotCount - 1) / 2) * spread;
      const vx = Math.cos(angle);
      const vy = Math.sin(angle);
      const elementColors = { bubble: '#62d9ee', fire: '#ff7043', lightning: '#ffe35a', gas: '#a5d64f' };
      const damageMultiplier = fusedElementalShot
        ? weapon.shotDamageMultiplier * weapon.shotCount * 1.6
        : weapon.shotDamageMultiplier;
      spawnPlayerProjectile({
        x: player.x + vx * 18,
        y: attackOriginY + vy * 18,
        vx: vx * weapon.projectileSpeed * (fusedElementalShot ? 1.18 : 1) * morph.speedMul,
        vy: vy * weapon.projectileSpeed * (fusedElementalShot ? 1.18 : 1) * morph.speedMul,
        radius: 6 * weapon.tearSize * (fusedElementalShot ? 1.55 : 1) * morph.sizeMul,
        size: weapon.tearSize * (fusedElementalShot ? 1.55 : 1) * morph.sizeMul,
        color: style !== 'bow' && morph.color ? morph.color : element ? elementColors[element]
          : style === 'bow' ? '#d8b577' : (weapon.shotCount > 1 ? combatPalette.volley : combatPalette.arcane),
        type: style === 'bow' ? 'arrow' : 'elemental',
        element,
        damage: Math.max(1, Math.round((player.damage + weapon.damageBonus) * damageMultiplier * morph.damageMul)),
        ttl: 0.5 * weapon.rangeMultiplier,
        piercesWalls: weapon.rangeLevel >= 3,
        fused: fusedElementalShot,
        shape: style === 'bow' ? null : morph.shape,
        pulse: morph.pulse,
        drop: morph.drop,
        explode: morph.explode,
        slowOnHit: morph.slowOnHit,
        trailTimer: 0,
      });
    }
  }
  player.fireCooldown = rangedStyles.length > 0 ? attackDelay * morph.delayMul : attackDelay;
  if (activeCombatStyle === 'bow' && rangedStyles.includes('bow')) {
    playSound('weapons/bow/shoot.ogg', 0.22);
  } else if (activeCombatStyle === 'magic' && rangedStyles.includes('magic')) {
    playSound(Math.random() < 0.5 ? 'weapons/piouslayer/hit1.ogg' : 'weapons/piouslayer/hit2.ogg', 0.1);
  } else {
    playSound('weapons/barehands/hit1.ogg', 0.2);
  }
  fireCompanionsWithPlayer(baseAngle, rangedStyles);
}

function fireCompanionsWithPlayer(angle, styles) {
  for (const companion of companions) {
    if (companion.hp <= 0) continue;
    const colors = { ratto: '#f0c884', croc: '#9ce28f', wisp: '#c8a6ff' };
    for (const style of styles) {
      spawnPlayerProjectile({
        x: companion.x,
        y: companion.y,
        vx: Math.cos(angle) * weapon.projectileSpeed,
        vy: Math.sin(angle) * weapon.projectileSpeed,
        radius: 5,
        size: 0.8,
        color: style === 'bow' ? '#d8b577' : colors[companion.kind] || companion.color || '#9ce28f',
        type: style === 'bow' ? 'arrow' : 'tear',
        damage: Math.max(1, player.damage),
        ttl: 0.47 * weapon.rangeMultiplier,
        trailTimer: 0,
        owner: 'companion',
      });
    }
  }
}

function cycleCombatStyle() {
  const available = [...combatStyles];
  if (available.length < 2) {
    showMessage('Your path is yours to choose. Learn another style from a keeper.', 2);
    return;
  }
  const index = available.indexOf(activeCombatStyle);
  activeCombatStyle = available[(index + 1) % available.length];
  showMessage(`${activeCombatStyle} leads the attack; all learned styles still fire together.`, 2);
  updateHud();
}

function cycleMagicElement() {
  const available = [...magicElements];
  if (available.length < 2) {
    showMessage('Water magic is ready. Find an elemental sigil to change it.', 2.5);
    return;
  }
  const index = available.indexOf(activeMagicElement);
  activeMagicElement = available[(index + 1) % available.length];
  showMessage(`${elementDisplayName(activeMagicElement).toUpperCase()} magic selected.`, 1.8);
  updateHud();
}

function addParticles(x, y, color, count = 4, speed = 80) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * speed;
    particles.push({
      x, y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      color,
      radius: 1.5 + Math.random() * 2.5,
      ttl: 0.2 + Math.random() * 0.25,
      maxTtl: 0.45,
    });
  }
}

function playEnemyAttackSound(enemy, volume = enemy.boss ? 0.3 : 0.14) {
  if (enemy.boss) {
    playSound(enemy.kind === 'jacko' ? 'monsters/pumpkin/hit1.ogg' : 'ML/Roar.ogg', volume);
  } else {
    playSound('monsters/zombie/zombiemiss.ogg', volume);
  }
}

function fireEnemyProjectile(enemy) {
  playEnemyAttackSound(enemy);
  const specialKind = enemy.spitVenom ? 'venom'
    : enemy.kind === 'spider' ? 'web-glob'
      : enemy.arrowShot ? 'arrow' : null;
  if (specialKind === 'arrow') recordEnemyAbilityDiscovery('arrow-shot', enemy.kind);
  if (enemy.kind === 'wisp') recordEnemyAbilityDiscovery('lightning-shot', enemy.kind);
  const colors = {
    ratto: '#e5bd83', croc: '#8cdb85', wisp: '#c6a1ff', jacko: '#ff9b4a',
    bat: '#bca5e5', bluepar: '#91d8f5', frog: '#a1df79', mouboo: '#e3e1cf',
    skeleton: '#ded8c9', slime: '#8df2a6', snake: '#edcf7e', spider: '#c2bacb',
    'spider-queen': '#d88cba', golem: '#c6b29a', scorpion: '#d29355',
    bee: '#e4c34f', bandit: '#b47762', zombie: '#8ca27b',
    venom: '#9ac84d', 'web-glob': '#e1dce5', arrow: '#a87645',
  };
  const baseAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const count = specialKind ? 1 : enemy.boss || enemy.tripleShot ? 3 : 1;
  const spread = enemy.boss && enemy.phase >= 2 ? 0.14 : 0.38;
  const floorProgress = Math.max(0, currentFloor - 1);
  const baseSpeed = enemy.kind === 'wisp' ? 185 : 155;
  const speed = specialKind === 'venom' || specialKind === 'web-glob' ? 125 : enemy.boss || enemy.miniBoss
    ? (enemy.phase >= 2 ? 340 : 255) * (1 + Math.max(0, currentFloor - 1) * 0.18)
    : baseSpeed * (1 + floorProgress * 0.12);
  for (let index = 0; index < count; index += 1) {
    const angle = baseAngle + (index - (count - 1) / 2) * spread;
    enemyProjectiles.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: specialKind === 'venom' || specialKind === 'web-glob' ? 9 : enemy.kind === 'wisp' ? 8 : 6,
      color: colors[specialKind || enemy.kind],
      damage: specialKind === 'venom' || specialKind === 'web-glob' ? 0 : 1,
      ttl: 2.6,
      kind: specialKind || enemy.kind,
    });
  }
  addParticles(enemy.x, enemy.y, colors[enemy.kind], count * 2, 35);
}

function throwEnemyBomb(enemy) {
  playEnemyAttackSound(enemy);
  const target = enemy.bombTarget || player;
  const targetX = clamp(target.x, ROOM_WALL_THICKNESS + 18, ROOM_W - ROOM_WALL_THICKNESS - 18);
  const targetY = clamp(target.y, ROOM_WALL_THICKNESS + 18, ROOM_H - ROOM_WALL_THICKNESS - 18);
  const flightDuration = 0.42;
  bombs.push({
    owner: 'enemy',
    x: enemy.x,
    y: enemy.y,
    startX: enemy.x,
    startY: enemy.y,
    targetX,
    targetY,
    flightDuration,
    flightTimer: flightDuration,
    fuse: enemy.bombFuse,
    radius: enemy.bombRadius,
  });
  addParticles(enemy.x, enemy.y, '#ffad59', 8, 60);
}

function throwClusterOrb(enemy) {
  recordEnemyAbilityDiscovery('spore-burst', enemy.kind);
  const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  playSound('monsters/mushroom/spawn1.ogg', 0.22);
  enemyProjectiles.push({
    x: enemy.x,
    y: enemy.y,
    vx: Math.cos(angle) * 96,
    vy: Math.sin(angle) * 96,
    radius: 13,
    color: '#c878df',
    damage: 0,
    ttl: 1.65,
    kind: 'spore-orb',
    clusterFuse: 1.05,
  });
  addParticles(enemy.x, enemy.y, '#d490e9', 8, 32);
}

function burstClusterOrb(orb) {
  const shardCount = 8;
  const shardSpeed = 172;
  playSound('monsters/mushroom/spawn2.ogg', 0.24);
  for (let index = 0; index < shardCount; index += 1) {
    const angle = (Math.PI * 2 * index) / shardCount;
    enemyProjectiles.push({
      x: orb.x,
      y: orb.y,
      vx: Math.cos(angle) * shardSpeed,
      vy: Math.sin(angle) * shardSpeed,
      radius: 5,
      color: '#d78be7',
      damage: 1,
      ttl: 1.6,
      kind: 'spore-shard',
    });
  }
  addParticles(orb.x, orb.y, '#e5a0f2', 14, 90);
}

function fireJackoBurst(enemy, count = enemy.phase >= 2 ? 10 : 8) {
  if (enemy.kind === 'jacko') recordEnemyAbilityDiscovery('fire-burst', enemy.kind);
  if (enemy.kind === 'jacko') playEnemyAttackSound(enemy);
  const color = enemy.kind === 'golem'
    ? enemy.phase >= 2 ? '#f4a56d' : '#c6b29a'
    : '#ff9b4a';
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const speed = (enemy.phase >= 2 ? 215 : 175) *
      (1 + Math.max(0, currentFloor - 1) * 0.18);
    enemyProjectiles.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 7,
      color,
      damage: 1,
      ttl: 3,
      kind: 'jacko',
    });
  }
  addParticles(enemy.x, enemy.y, color, 12, 95);
}

function updateSpiderQueen(enemy, dt, directionX, directionY, distance, visible) {
  const phaseTwo = enemy.phase >= 2;
  enemy.summonCooldown -= dt;
  if (enemy.behavior === 'spider-web-windup') {
    if (enemy.stateTimer <= 0) {
      fireEnemyProjectile(enemy);
      if (phaseTwo) {
        enemy.behavior = 'spider-web-followup';
        enemy.stateTimer = 0.2;
      } else {
        enemy.behavior = 'jacko-idle';
        enemy.attackCooldown = 3.6;
      }
    }
    return;
  }
  if (enemy.behavior === 'spider-web-followup') {
    if (enemy.stateTimer <= 0) {
      fireEnemyProjectile(enemy);
      enemy.behavior = 'jacko-idle';
      enemy.attackCooldown = 2.6;
    }
    return;
  }
  if (enemy.behavior === 'spider-pounce-windup') {
    if (enemy.stateTimer <= 0) {
      enemy.behavior = 'spider-pounce';
      enemy.leapX = enemy.spiderPounceX;
      enemy.leapY = enemy.spiderPounceY;
      enemy.stateTimer = phaseTwo ? 0.34 : 0.48;
    }
    return;
  }
  if (enemy.behavior === 'spider-pounce') {
    const pounceSpeed = enemy.speed * (phaseTwo ? 5.4 : 4.2);
    moveEnemy(enemy, enemy.leapX * pounceSpeed, enemy.leapY * pounceSpeed, dt);
    if (enemy.stateTimer <= 0) {
      triggerCameraShake('spiderPounce');
      enemy.behavior = 'spider-recover';
      enemy.stateTimer = phaseTwo ? 0.28 : 0.48;
      fireEnemyProjectile(enemy);
    }
    return;
  }
  if (enemy.behavior === 'spider-recover') {
    if (enemy.stateTimer <= 0) enemy.behavior = 'jacko-idle';
    return;
  }
  if (enemy.behavior === 'spider-summon') {
    if (enemy.stateTimer <= 0) {
      for (let index = 0; index < (phaseTwo ? 3 : 2) && enemies.length < 7; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const spawn = findEnemySpawnPosition(
          enemy.x + Math.cos(angle) * 76,
          enemy.y + Math.sin(angle) * 76,
          17,
        );
        if (spawn) enemies.push(createEnemy('spider', spawn.x, spawn.y));
      }
      enemy.behavior = 'jacko-idle';
    }
    return;
  }

  const tangentX = -directionY;
  const tangentY = directionX;
  const movementMultiplier = phaseTwo ? 1.3 : 1;
  let moveX = tangentX * enemy.speed * 0.55 * movementMultiplier;
  let moveY = tangentY * enemy.speed * 0.55 * movementMultiplier;
  if (distance > 90) {
    moveX += directionX * enemy.speed * 0.45 * movementMultiplier;
    moveY += directionY * enemy.speed * 0.45 * movementMultiplier;
  }
  moveEnemy(enemy, moveX, moveY, dt);

  if (!visible) return;
  if (enemy.summonCooldown <= 0 && enemies.length < 7) {
    enemy.behavior = 'spider-summon';
    enemy.stateTimer = phaseTwo ? 0.5 : 0.8;
    enemy.summonCooldown = phaseTwo ? 10 : 15;
    enemy.attackCooldown = Math.max(enemy.attackCooldown, 1.2);
  } else if (visible && enemy.attackCooldown <= 0) {
    enemy.spiderAttackIndex = (enemy.spiderAttackIndex || 0) + 1;
    const pounce = phaseTwo
      ? enemy.spiderAttackIndex % 3 !== 0
      : enemy.spiderAttackIndex % 2 === 1;
    if (pounce) {
      playEnemyAttackSound(enemy, 0.18);
      const lead = phaseTwo ? 0.28 : 0.42;
      const targetX = clamp(player.x + directionX * player.speed * lead, 82, ROOM_W - 82);
      const targetY = clamp(player.y + directionY * player.speed * lead, 82, ROOM_H - 82);
      const aimAngle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
      enemy.spiderPounceX = Math.cos(aimAngle);
      enemy.spiderPounceY = Math.sin(aimAngle);
      enemy.spiderPounceTarget = { x: targetX, y: targetY };
      enemy.behavior = 'spider-pounce-windup';
      enemy.stateTimer = phaseTwo ? 0.48 : 0.68;
      enemy.attackCooldown = phaseTwo ? 3.2 : 4;
    } else {
      playEnemyAttackSound(enemy, 0.18);
      enemy.behavior = 'spider-web-windup';
      enemy.stateTimer = phaseTwo ? 0.5 : 0.8;
      enemy.attackCooldown = phaseTwo ? 3.6 : 4.8;
    }
  }
}

function updateGolemBoss(enemy, dt, directionX, directionY, distance, visible) {
  const phaseTwo = enemy.phase >= 2;
  if (enemy.behavior === 'golem-slam-windup') {
    if (enemy.stateTimer <= 0) {
      const slamTarget = enemy.slamTarget || player;
      const slamRadius = phaseTwo ? 96 : 64;
      triggerCameraShake('golemSlam');
      if (distanceBetween(slamTarget, player) <= slamRadius) damagePlayer();
      fireEnemyProjectile(enemy);
      if (phaseTwo) fireJackoBurst(enemy, 8);
      enemy.behavior = 'golem-recover';
      enemy.stateTimer = phaseTwo ? 0.42 : 0.55;
      enemy.attackCooldown = phaseTwo ? 3.4 : 4.4;
    }
    return;
  }
  if (enemy.behavior === 'golem-charge-windup') {
    if (enemy.stateTimer <= 0) {
      const target = enemy.slamTarget || player;
      const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      enemy.leapX = Math.cos(angle);
      enemy.leapY = Math.sin(angle);
      enemy.chargeHit = false;
      enemy.behavior = 'golem-charge';
      enemy.stateTimer = phaseTwo ? 0.6 : 0.78;
      enemy.golemChargeSpeed = phaseTwo ? 590 : 470;
    }
    return;
  }
  if (enemy.behavior === 'golem-charge') {
    const previous = { x: enemy.x, y: enemy.y };
    moveEnemy(enemy, enemy.leapX * enemy.golemChargeSpeed, enemy.leapY * enemy.golemChargeSpeed, dt);
    const lineX = enemy.x - previous.x;
    const lineY = enemy.y - previous.y;
    const lengthSquared = lineX * lineX + lineY * lineY || 1;
    const projection = clamp(((player.x - previous.x) * lineX + (player.y - previous.y) * lineY) / lengthSquared, 0, 1);
    const closest = { x: previous.x + projection * lineX, y: previous.y + projection * lineY };
    if (!enemy.chargeHit && distanceBetween(player, closest) < player.radius + enemy.radius * 0.72) {
      enemy.chargeHit = true;
      damagePlayer();
    }
    if (enemy.stateTimer <= 0) {
      triggerCameraShake('groundPound');
      fireBossRadial(enemy, phaseTwo ? 12 : 8, 175, 'stone', '#c6b29a', elapsed * 0.2);
      enemy.behavior = 'golem-recover';
      enemy.stateTimer = 0.6;
      enemy.attackCooldown = phaseTwo ? 3.2 : 4.2;
    }
    return;
  }
  if (enemy.behavior === 'golem-recover') {
    if (enemy.stateTimer <= 0) enemy.behavior = 'jacko-idle';
    return;
  }
  if (enemy.behavior === 'golem-bomb-windup') {
    if (enemy.stateTimer <= 0) {
      enemy.bombTarget = enemy.slamTarget || player;
      throwEnemyBomb(enemy);
      fireBossVolley(enemy, enemy.bombTarget, phaseTwo ? 3 : 1, 0.24, 205, 'stone', '#c6b29a');
      enemy.behavior = 'golem-recover';
      enemy.stateTimer = 0.55;
      enemy.attackCooldown = phaseTwo ? 3.2 : 4.2;
    }
    return;
  }
  if (enemy.behavior === 'golem-ring-windup') {
    if (enemy.stateTimer <= 0) {
      fireBossRadial(enemy, phaseTwo ? 14 : 8, 185, 'stone', '#c6b29a', elapsed * 0.25);
      const obstaclePosition = findEnemySpawnPosition(
        enemy.slamTarget?.x ?? player.x,
        enemy.slamTarget?.y ?? player.y,
        20,
        0,
      );
      if (obstaclePosition && breakables.length < 8) {
        breakables.push(createBossObstacle(obstaclePosition.x, obstaclePosition.y, obstacleSprites[0]));
      }
      enemy.behavior = 'golem-recover';
      enemy.stateTimer = 0.55;
      enemy.attackCooldown = phaseTwo ? 3.2 : 4.2;
    }
    return;
  }

  const distanceDirection = distance < 125 ? -1 : distance > 170 ? 1 : 0;
  const movementMultiplier = phaseTwo ? 1.4 : 1;
  moveEnemy(enemy, directionX * enemy.speed * distanceDirection * movementMultiplier,
    directionY * enemy.speed * distanceDirection * movementMultiplier, dt);
  if (visible && enemy.attackCooldown <= 0) {
    const attack = (enemy.golemAttackIndex || 0) % 4;
    enemy.golemAttackIndex = attack + 1;
    playEnemyAttackSound(enemy, 0.24);
    enemy.behavior = attack === 0 ? 'golem-slam-windup'
      : attack === 1 ? 'golem-bomb-windup' : attack === 2 ? 'golem-ring-windup' : 'golem-charge-windup';
    enemy.stateTimer = attack === 0 ? phaseTwo ? 0.64 : 0.92 : attack === 3 ? 0.8 : 0.72;
    enemy.attackCooldown = phaseTwo ? 3.2 : 4.2;
    enemy.slamTarget = { x: player.x, y: player.y };
  }
}

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

function uniqueBossSignature(kind, attackIndex = 0) {
  const rotation = bossAttackRotations[kind];
  if (rotation) return rotation[attackIndex % rotation.length];
  return ({
    'slime-mother': 'slime-trail',
    reaper: 'reaper-charge',
    serqet: 'venom-fan',
    banditlord: 'arrow-barrage',
    'snowman-boss': 'ice-burst',
    yetiking: 'yeti-slam',
    forestdragon: 'forest-summon',
    nightdragon: 'void-cross',
    snowman: 'ice-burst',
    yeti: 'yeti-slam',
    scorpion: 'venom-fan',
    bandit: 'arrow-barrage',
    skeleton: 'bone-bomb',
    zombie: 'grave-summon',
    'spore-sower': 'spore-burst',
    spider: 'web-burst',
    'spider-queen': 'spider-pounce',
    'bosspinkie': 'pinkie-leap',
    bluepar: 'arrow-barrage',
    vampirebat: 'void-cross',
    frostiana: 'ice-burst',
    troll: 'yeti-slam',
    mouboo: 'reaper-charge',
    croc: 'reaper-charge',
  })[kind] || 'venom-fan';
}

function fireBossVolley(enemy, target, count, spread, speed, kind, color) {
  const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  for (let index = 0; index < count; index += 1) {
    const shotAngle = angle + (index - (count - 1) / 2) * spread;
    enemyProjectiles.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(shotAngle) * speed,
      vy: Math.sin(shotAngle) * speed,
      radius: kind === 'arrow' ? 5 : 8,
      color,
      damage: kind === 'venom' || kind === 'web-glob' ? 0 : 1,
      ttl: 2.5,
      kind,
    });
  }
  if (kind === 'arrow') recordEnemyAbilityDiscovery('arrow-shot', enemy.kind);
}

function fireBossRadial(enemy, count, speed, kind, color, phase = 0) {
  for (let index = 0; index < count; index += 1) {
    const angle = phase + index * Math.PI * 2 / count;
    enemyProjectiles.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: kind === 'arrow' ? 5 : 8,
      color,
      damage: 1,
      ttl: 2.5,
      kind,
    });
  }
  if (kind === 'arrow') recordEnemyAbilityDiscovery('arrow-shot', enemy.kind);
}

function startBossCharge(enemy, target, axis, speed, duration) {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const length = Math.hypot(dx, dy) || 1;
  enemy.leapX = axis === 'vertical' ? 0 : axis === 'horizontal' ? Math.sign(dx) : dx / length;
  enemy.leapY = axis === 'horizontal' ? 0 : axis === 'vertical' ? Math.sign(dy) : dy / length;
  enemy.chargeHit = false;
  enemy.signatureChargeAxis = axis;
  enemy.signatureChargeSpeed = speed;
  enemy.behavior = 'signature-charge';
  enemy.stateTimer = duration;
}

function resolveUniqueBossAttack(enemy, phaseTwo) {
  const target = enemy.signatureTarget || player;
  const signature = enemy.signature;
  if (signature === 'slime-trail') {
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.24, 205, 'slime', '#8df2a6');
    const count = phaseTwo ? 6 : 4;
    for (let index = 1; index <= count; index += 1) {
      const progress = index / (count + 1);
      createGroundHazard(
        enemy.x + (target.x - enemy.x) * progress,
        enemy.y + (target.y - enemy.y) * progress,
        'ooze',
      );
    }
  } else if (signature === 'slime-crash') {
    startBossCharge(enemy, target, 'diagonal', phaseTwo ? 520 : 420, 0.6);
    return;
  } else if (signature === 'slime-shot') {
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.42, 210, 'slime', '#8df2a6');
  } else if (signature === 'slime-charge') {
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.22, 205, 'slime', '#8df2a6');
    startBossCharge(enemy, target, 'horizontal', phaseTwo ? 700 : 560, phaseTwo ? 0.68 : 0.86);
  } else if (signature === 'spore-bomb') {
    throwClusterOrb(enemy);
    enemy.bombTarget = target;
    throwEnemyBomb(enemy);
  } else if (signature === 'venom-fan') {
    fireBossVolley(enemy, target, phaseTwo ? 7 : 5, 0.22, phaseTwo ? 215 : 175, 'venom', '#a8d74f');
    createGroundHazard(target.x, target.y, 'acid');
  } else if (signature === 'reaper-fan') {
    fireBossRadial(enemy, phaseTwo ? 12 : 8, 210, 'void-orb', '#a98be4', elapsed);
  } else if (signature === 'reaper-bomb') {
    enemy.bombTarget = target;
    throwEnemyBomb(enemy);
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.18, 225, 'void-orb', '#a98be4');
  } else if (signature === 'reaper-charge') {
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.2, 240, 'void-orb', '#a98be4');
    startBossCharge(enemy, target, 'vertical', phaseTwo ? 760 : 620, phaseTwo ? 0.72 : 0.92);
    return;
  } else if (signature === 'venom-bomb') {
    enemy.bombTarget = target;
    throwEnemyBomb(enemy);
    createGroundHazard(target.x, target.y, 'acid');
  } else if (signature === 'venom-charge') {
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.18, 220, 'venom', '#a8d74f');
    startBossCharge(enemy, target, 'diagonal', phaseTwo ? 680 : 560, phaseTwo ? 0.62 : 0.78);
    return;
  } else if (signature === 'arrow-barrage') {
    fireBossVolley(enemy, target, phaseTwo ? 9 : 7, 0.12, phaseTwo ? 340 : 280, 'arrow', '#c99a62');
  } else if (signature === 'arrow-wheel') {
    fireBossRadial(enemy, phaseTwo ? 16 : 10, 270, 'arrow', '#c99a62', elapsed * 0.4);
  } else if (signature === 'bandit-bombs') {
    enemy.bombTarget = target;
    throwEnemyBomb(enemy);
    if (phaseTwo) {
      enemy.bombTarget = { x: ROOM_W - target.x, y: ROOM_H - target.y };
      throwEnemyBomb(enemy);
    }
  } else if (signature === 'bandit-charge') {
    fireBossVolley(enemy, target, phaseTwo ? 5 : 3, 0.12, 300, 'arrow', '#c99a62');
    startBossCharge(enemy, target, 'horizontal', phaseTwo ? 720 : 600, phaseTwo ? 0.6 : 0.78);
    return;
  } else if (signature === 'ice-burst') {
    for (let index = 0; index < (phaseTwo ? 12 : 8); index += 1) {
      const angle = index * Math.PI * 2 / (phaseTwo ? 12 : 8);
      enemyProjectiles.push({
        x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * 185, vy: Math.sin(angle) * 185,
        radius: 8, color: '#9fe7f3', damage: 1, ttl: 2.3, kind: 'ice-orb',
      });
    }
  } else if (signature === 'ice-shot') {
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.22, 230, 'ice-orb', '#9fe7f3');
  } else if (signature === 'snow-bombs') {
    enemy.bombTarget = target;
    throwEnemyBomb(enemy);
    if (phaseTwo) {
      enemy.bombTarget = {
        x: clamp(target.x + (Math.random() - 0.5) * 180, 80, ROOM_W - 80),
        y: clamp(target.y + (Math.random() - 0.5) * 130, 80, ROOM_H - 80),
      };
      throwEnemyBomb(enemy);
    }
  } else if (signature === 'snow-charge') {
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.22, 205, 'ice-orb', '#9fe7f3');
    startBossCharge(enemy, target, 'vertical', phaseTwo ? 650 : 530, phaseTwo ? 0.66 : 0.84);
    return;
  } else if (signature === 'yeti-slam') {
    triggerCameraShake('groundPound');
    const radius = phaseTwo ? 120 : 88;
    if (distanceBetween(target, player) < radius) damagePlayer();
    createGroundHazard(target.x, target.y, 'web');
    fireBossVolley(enemy, target, phaseTwo ? 8 : 5, Math.PI / 3, 190, 'ice-orb', '#9fe7f3');
  } else if (signature === 'yeti-charge') {
    startBossCharge(enemy, target, 'diagonal', phaseTwo ? 760 : 620, phaseTwo ? 0.72 : 0.92);
    return;
  } else if (signature === 'forest-summon') {
    const summonKinds = enemyKindsForCurrentMap();
    for (let index = 0; index < (phaseTwo ? 3 : 2) && enemies.length < 8; index += 1) {
      const angle = index * Math.PI * 2 / 3;
      const spawn = findEnemySpawnPosition(enemy.x + Math.cos(angle) * 76, enemy.y + Math.sin(angle) * 76, 16, 0);
      if (spawn) enemies.push(createEnemy(summonKinds[Math.floor(Math.random() * summonKinds.length)], spawn.x, spawn.y));
    }
    const obstacle = findEnemySpawnPosition(target.x, target.y, 20, 0);
    if (obstacle) breakables.push(createBossObstacle(obstacle.x, obstacle.y, obstacleSprites[1]));
    fireBossVolley(enemy, target, phaseTwo ? 7 : 5, 0.24, 190, 'fire-orb', '#ff9254');
  } else if (signature === 'forest-breath') {
    fireBossVolley(enemy, target, phaseTwo ? 7 : 5, 0.1, 250, 'fire-orb', '#ff9254');
  } else if (signature === 'forest-barrage') {
    fireBossRadial(enemy, phaseTwo ? 16 : 10, 210, 'fire-orb', '#ff9254', elapsed * 0.35);
  } else if (signature === 'forest-charge') {
    fireBossVolley(enemy, target, phaseTwo ? 5 : 3, 0.18, 240, 'fire-orb', '#ff9254');
    startBossCharge(enemy, target, 'diagonal', phaseTwo ? 680 : 560, phaseTwo ? 0.62 : 0.78);
    return;
  } else if (signature === 'void-cross') {
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5,
      ...(phaseTwo ? [Math.PI / 4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75] : [])]) {
      enemyProjectiles.push({
        x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * 220, vy: Math.sin(angle) * 220,
        radius: 8, color: '#a98be4', damage: 1, ttl: 2.5, kind: 'void-orb',
      });
    }
  } else if (signature === 'void-charge') {
    fireBossVolley(enemy, target, phaseTwo ? 3 : 1, 0.16, 230, 'void-orb', '#a98be4');
    startBossCharge(enemy, target, 'diagonal', phaseTwo ? 720 : 580, phaseTwo ? 0.58 : 0.76);
    return;
  } else if (signature === 'void-laser') {
    enemy.laserAngle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemy.behavior = 'signature-laser-windup';
    enemy.stateTimer = phaseTwo ? 0.58 : 0.82;
    enemy.laserHit = false;
    return;
  } else if (signature === 'grave-summon') {
    const summonKinds = enemyKindsForCurrentMap().filter((kind) => ['skeleton', 'zombie', 'vampirebat'].includes(kind));
    for (let index = 0; index < (phaseTwo ? 3 : 2) && enemies.length < 8; index += 1) {
      const angle = index * Math.PI * 2 / 3;
      const spawn = findEnemySpawnPosition(enemy.x + Math.cos(angle) * 68, enemy.y + Math.sin(angle) * 68, 16, 0);
      if (spawn) {
        const kind = summonKinds.length > 0 ? summonKinds[Math.floor(Math.random() * summonKinds.length)] : enemyKindsForCurrentMap()[0];
        enemies.push(createEnemy(kind, spawn.x, spawn.y));
      }
    }
  } else if (signature === 'bone-bomb') {
    enemy.bombTarget = target;
    throwEnemyBomb(enemy);
    if (phaseTwo) {
      enemy.bombTarget = { x: ROOM_W - target.x, y: ROOM_H - target.y };
      throwEnemyBomb(enemy);
    }
  } else if (signature === 'spore-burst') {
    throwClusterOrb(enemy);
    recordEnemyAbilityDiscovery('spore-burst', enemy.kind);
  } else if (signature === 'web-burst') {
    fireBossVolley(enemy, target, phaseTwo ? 5 : 3, 0.3, 150, 'web-glob', '#e3d9e8');
  } else if (signature === 'spider-pounce') {
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemy.leapX = Math.cos(angle);
    enemy.leapY = Math.sin(angle);
    enemy.behavior = 'signature-charge';
    enemy.signatureChargeSpeed = enemy.speed * 5;
    enemy.stateTimer = phaseTwo ? 0.42 : 0.58;
    return;
  } else if (signature === 'pinkie-leap') {
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemy.leapX = Math.cos(angle);
    enemy.leapY = Math.sin(angle);
    enemy.behavior = 'signature-charge';
    enemy.signatureChargeSpeed = enemy.speed * 5.4;
    enemy.stateTimer = phaseTwo ? 0.38 : 0.55;
    return;
  } else {
    performBossMove(enemy, signature, target, phaseTwo);
  }
  enemy.behavior = 'signature-recover';
  enemy.stateTimer = phaseTwo ? 0.38 : 0.55;
  enemy.attackCooldown = phaseTwo ? 2.6 : 3.7;
}

function scatterHazards(kind, x, y, count, spread) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const reach = Math.random() * spread;
    createGroundHazard(
      clamp(x + Math.cos(angle) * reach, 80, ROOM_W - 80),
      clamp(y + Math.sin(angle) * reach, 80, ROOM_H - 80),
      kind,
    );
  }
}

// Shared boss moves; returns true when the move name is known.
function performBossMove(enemy, move, target, phaseTwo) {
  const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  if (move === 'blink-strike') {
    addParticles(enemy.x, enemy.y, enemy.color, 16, 120);
    const arrival = Math.random() * Math.PI * 2;
    enemy.x = clamp(target.x + Math.cos(arrival) * 130, 90, ROOM_W - 90);
    enemy.y = clamp(target.y + Math.sin(arrival) * 130, 90, ROOM_H - 90);
    addParticles(enemy.x, enemy.y, enemy.color, 16, 120);
    const fiery = enemy.kind === 'jacko';
    fireBossRadial(enemy, phaseTwo ? 10 : 6, 200, fiery ? 'fire-orb' : 'void-orb',
      fiery ? '#ff9254' : '#a98be4', elapsed);
  } else if (move === 'lightning-strike') {
    createGroundHazard(target.x, target.y, 'lightning');
    scatterHazards('lightning', target.x, target.y, phaseTwo ? 4 : 2, 150);
  } else if (move === 'rock-fall') {
    createGroundHazard(target.x, target.y, 'lightning', 'enemy', { color: '#b59a78', duration: 1.1 });
    for (let index = 0; index < (phaseTwo ? 4 : 2); index += 1) {
      createGroundHazard(clamp(target.x + (Math.random() - 0.5) * 300, 80, ROOM_W - 80),
        clamp(target.y + (Math.random() - 0.5) * 300, 80, ROOM_H - 80),
        'lightning', 'enemy', { color: '#b59a78', duration: 1.1 });
    }
    triggerCameraShake('groundPound');
  } else if (move === 'fire-breath') {
    for (let index = 1; index <= (phaseTwo ? 7 : 5); index += 1) {
      createGroundHazard(clamp(enemy.x + Math.cos(angle) * index * 62, 80, ROOM_W - 80),
        clamp(enemy.y + Math.sin(angle) * index * 62, 80, ROOM_H - 80), 'fire');
    }
    fireBossVolley(enemy, target, 3, 0.2, 240, 'fire-orb', '#ff9254');
  } else if (move === 'fire-bottle') {
    scatterHazards('fire', target.x, target.y, phaseTwo ? 5 : 3, 90);
    createGroundHazard(target.x, target.y, 'fire');
  } else if (move === 'water-splash') {
    scatterHazards('water', target.x, target.y, phaseTwo ? 4 : 3, 110);
  } else if (move === 'gas-cloud') {
    for (let index = 0; index < (phaseTwo ? 4 : 3); index += 1) {
      createGroundHazard(clamp(enemy.x - Math.cos(angle) * index * 55, 80, ROOM_W - 80),
        clamp(enemy.y - Math.sin(angle) * index * 55, 80, ROOM_H - 80), 'miasma');
    }
  } else if (move === 'web-snare') {
    scatterHazards('web', target.x, target.y, phaseTwo ? 3 : 2, 100);
    fireBossVolley(enemy, target, phaseTwo ? 5 : 3, 0.3, 150, 'web-glob', '#e3d9e8');
  } else if (move === 'wind-gust') {
    const push = phaseTwo ? 360 : 300;
    player.windPush = { vx: Math.cos(angle) * push, vy: Math.sin(angle) * push, timer: phaseTwo ? 1.1 : 0.9 };
    addParticles(enemy.x, enemy.y, '#dfeff5', 14, 160);
    showMessage('A violent gust shoves you back!', 1.5);
  } else if (move === 'hook-pull') {
    enemyProjectiles.push({
      x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 420, vy: Math.sin(angle) * 420,
      radius: 9, color: '#b79a6c', damage: 0, ttl: 1.4, kind: 'hook', ownerKind: enemy.kind,
    });
  } else if (move === 'berserk') {
    if (!(enemy.berserkTimer > 0)) enemy.speed *= 1.5;
    enemy.berserkTimer = 4;
    addParticles(enemy.x, enemy.y, '#ff6a3a', 18, 140);
    showMessage(`${enemy.title || 'The boss'} flies into a rage!`, 1.8);
  } else {
    return false;
  }
  return true;
}

const bossExtraMoves = {
  golem: ['rock-fall', 'berserk'],
  'spider-queen': ['web-snare', 'blink-strike'],
  jacko: ['fire-bottle', 'blink-strike', 'lightning-strike'],
};

// Bosses with their own state machines fire an extra telegraphed move now and then while idle.
function updateBossExtras(enemy, dt) {
  if (enemy.berserkTimer > 0) {
    enemy.berserkTimer -= dt;
    if (enemy.berserkTimer <= 0) enemy.speed /= 1.5;
  }
  const moves = bossExtraMoves[enemy.kind];
  if (!moves || enemy.behavior !== 'jacko-idle') return;
  if (enemy.extraWindup > 0) {
    enemy.extraWindup -= dt;
    if (Math.random() < 0.3) addParticles(enemy.x, enemy.y, enemy.color, 2, 40);
    if (enemy.extraWindup <= 0) {
      performBossMove(enemy, enemy.extraMove, { x: player.x, y: player.y }, enemy.phase >= 2);
    }
    return;
  }
  enemy.extraCooldown = (enemy.extraCooldown ?? 5 + Math.random() * 3) - dt;
  if (enemy.extraCooldown <= 0) {
    enemy.extraMove = moves[(enemy.extraIndex || 0) % moves.length];
    enemy.extraIndex = (enemy.extraIndex || 0) + 1;
    enemy.extraWindup = 0.7;
    enemy.extraCooldown = enemy.phase >= 2 ? 5 : 8;
  }
}

function startLinkDash(enemy, toX, toY, kind) {
  enemy.linkDash = {
    fromX: enemy.x, fromY: enemy.y, toX, toY, kind, t: 0,
    windup: kind === 'roll' ? 0.2 : 0.3, duration: kind === 'roll' ? 0.5 : 0.4,
  };
  enemy.linkPrevSide = undefined;
}

// Linked twins somersault along their tether when it is crossed and pounce on a player standing on it.
function updateLinkedTwin(enemy, dt) {
  const twin = enemies.find((candidate) => candidate !== enemy && candidate.linkId === enemy.linkId);
  if (!twin) {
    enemy.linkDash = null;
    return false;
  }
  enemy.linkCooldown = Math.max(0, (enemy.linkCooldown ?? 2) - dt);
  const dash = enemy.linkDash;
  if (dash) {
    if (dash.windup > 0) {
      dash.windup -= dt;
      return true;
    }
    dash.t += dt / dash.duration;
    const progress = Math.min(1, dash.t);
    enemy.x = dash.fromX + (dash.toX - dash.fromX) * progress;
    enemy.y = dash.fromY + (dash.toY - dash.fromY) * progress;
    if (dash.t >= 1) {
      enemy.linkDash = null;
      enemy.linkCooldown = 3.5;
      twin.linkCooldown = Math.max(twin.linkCooldown || 0, 1.5);
    }
    return true;
  }
  const lineX = twin.x - enemy.x;
  const lineY = twin.y - enemy.y;
  const lengthSquared = lineX * lineX + lineY * lineY || 1;
  const toPlayerX = player.x - enemy.x;
  const toPlayerY = player.y - enemy.y;
  const along = (toPlayerX * lineX + toPlayerY * lineY) / lengthSquared;
  const cross = toPlayerX * lineY - toPlayerY * lineX;
  const side = Math.sign(cross);
  const crossed = side !== 0 && enemy.linkPrevSide && side !== enemy.linkPrevSide && along >= 0 && along <= 1;
  if (side !== 0) enemy.linkPrevSide = side;
  if (enemy.linkCooldown > 0 || twin.linkDash) return false;
  if (crossed) {
    startLinkDash(enemy, twin.x, twin.y, 'roll');
    return true;
  }
  if (along >= 0 && along <= 1 && Math.abs(cross) / Math.sqrt(lengthSquared) < 40) {
    startLinkDash(enemy, player.x, player.y, 'pounce');
    return true;
  }
  return false;
}

function slimeMotherCrash(enemy, phaseTwo) {
  triggerCameraShake('groundPound');
  if (distanceBetween(player, enemy) < player.radius + enemy.radius + 40) damagePlayer();
  createGroundHazard(enemy.x, enemy.y, 'ooze');
  const trails = phaseTwo ? 6 : 4;
  for (let index = 0; index < trails; index += 1) {
    const angle = index * Math.PI * 2 / trails + Math.random() * 0.4;
    const reach = 110 + Math.random() * 60;
    createGroundHazard(
      clamp(enemy.x + Math.cos(angle) * reach, 80, ROOM_W - 80),
      clamp(enemy.y + Math.sin(angle) * reach, 80, ROOM_H - 80),
      'ooze',
    );
  }
  for (let index = 0; index < (phaseTwo ? 3 : 2) && enemies.length < 8; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const spawn = findEnemySpawnPosition(enemy.x + Math.cos(angle) * 90, enemy.y + Math.sin(angle) * 90, 18, 0, enemy);
    if (!spawn) continue;
    const minion = createEnemy('slime', spawn.x, spawn.y);
    minion.archetype = 'ranged';
    minion.arrowShot = true;
    minion.behavior = 'hover';
    minion.surpriseSpawn = true;
    enemies.push(minion);
  }
  addParticles(enemy.x, enemy.y, '#d94e63', 20, 140);
}

function updateUniqueBoss(enemy, dt, directionX, directionY, distance, visible) {
  const phaseTwo = enemy.phase >= 2;
  if (enemy.behavior === 'signature-laser-windup') {
    if (enemy.stateTimer <= 0) {
      enemy.behavior = 'signature-laser';
      enemy.stateTimer = phaseTwo ? 0.72 : 0.52;
      enemy.laserHit = false;
    }
    return;
  }
  if (enemy.behavior === 'signature-laser') {
    const beamLength = Math.max(ROOM_W, ROOM_H);
    const beamEnd = {
      x: enemy.x + Math.cos(enemy.laserAngle) * beamLength,
      y: enemy.y + Math.sin(enemy.laserAngle) * beamLength,
    };
    const lineX = beamEnd.x - enemy.x;
    const lineY = beamEnd.y - enemy.y;
    const lengthSquared = lineX * lineX + lineY * lineY || 1;
    const projection = clamp(((player.x - enemy.x) * lineX + (player.y - enemy.y) * lineY) / lengthSquared, 0, 1);
    const closest = { x: enemy.x + projection * lineX, y: enemy.y + projection * lineY };
    if (!enemy.laserHit && hasLineOfSight(enemy, player) && distanceBetween(player, closest) < player.radius + 10) {
      enemy.laserHit = true;
      damagePlayer();
    }
    if (enemy.stateTimer <= 0) {
      fireBossRadial(enemy, phaseTwo ? 8 : 4, 205, 'void-orb', '#a98be4', enemy.laserAngle);
      enemy.behavior = 'signature-recover';
      enemy.stateTimer = 0.45;
      enemy.attackCooldown = phaseTwo ? 2.6 : 3.7;
    }
    return;
  }
  if (enemy.behavior === 'signature-charge') {
    const previous = { x: enemy.x, y: enemy.y };
    const speed = enemy.signatureChargeSpeed || 540;
    moveEnemy(enemy, enemy.leapX * speed, enemy.leapY * speed, dt);
    const lineX = enemy.x - previous.x;
    const lineY = enemy.y - previous.y;
    const lengthSquared = lineX * lineX + lineY * lineY || 1;
    const projection = clamp(((player.x - previous.x) * lineX + (player.y - previous.y) * lineY) / lengthSquared, 0, 1);
    const closest = { x: previous.x + projection * lineX, y: previous.y + projection * lineY };
    if (!enemy.chargeHit && distanceBetween(player, closest) < player.radius + enemy.radius * 0.72) {
      enemy.chargeHit = true;
      damagePlayer();
    }
    if (enemy.stateTimer <= 0) {
      if (enemy.signature === 'yeti-slam') {
        triggerCameraShake('groundPound');
        if (distanceBetween(player, enemy) < player.radius + (phaseTwo ? 112 : 82)) damagePlayer();
        createGroundHazard(enemy.x, enemy.y, 'web');
      }
      if (enemy.signature === 'slime-crash') slimeMotherCrash(enemy, phaseTwo);
      enemy.behavior = 'signature-recover';
      enemy.stateTimer = 0.45;
      enemy.attackCooldown = phaseTwo ? 2.6 : 3.8;
    }
    return;
  }
  if (enemy.behavior === 'signature-windup') {
    if (enemy.stateTimer <= 0) resolveUniqueBossAttack(enemy, phaseTwo);
    return;
  }
  if (enemy.behavior === 'signature-recover') {
    if (enemy.stateTimer <= 0) enemy.behavior = 'jacko-idle';
    return;
  }
  const spacing = distance > 90 ? 1 : 0;
  if (enemy.boss) {
    // Bosses never stand still: they strafe constantly while closing in.
    const strafe = Math.sin(elapsed * 0.9 + enemy.x * 0.01) >= 0 ? 1 : -1;
    moveEnemy(enemy,
      (directionX * (distance > 90 ? 1 : 0.3) - directionY * strafe * 0.55) * enemy.speed,
      (directionY * (distance > 90 ? 1 : 0.3) + directionX * strafe * 0.55) * enemy.speed, dt);
  } else {
    moveEnemy(enemy, directionX * enemy.speed * spacing, directionY * enemy.speed * spacing, dt);
  }
  if (!visible || enemy.attackCooldown > 0) return;
  enemy.signature = uniqueBossSignature(enemy.kind, enemy.bossAttackIndex || 0);
  if (bossAttackRotations[enemy.kind]) {
    enemy.bossAttackIndex = ((enemy.bossAttackIndex || 0) + 1) % bossAttackRotations[enemy.kind].length;
  }
  enemy.signatureTarget = { x: player.x, y: player.y };
  enemy.chargeHit = false;
  enemy.behavior = 'signature-windup';
  enemy.stateTimer = phaseTwo ? 0.42 : 0.68;
  enemy.attackCooldown = phaseTwo ? 2.6 : 3.7;
  playEnemyAttackSound(enemy, 0.24);
}

function updateArenaBoss(enemy, dt, directionX, directionY, distance, visible) {
  enemy.summonCooldown -= dt;
  const phaseTwo = enemy.phase >= 2;
  const movementMultiplier = phaseTwo ? 1.35 : 1;

  if (enemy.behavior === 'jacko-idle') {
    const tangentX = -directionY * enemy.strafeDirection;
    const tangentY = directionX * enemy.strafeDirection;
    let moveX = tangentX * enemy.speed * 0.55 * movementMultiplier;
    let moveY = tangentY * enemy.speed * 0.55 * movementMultiplier;
    if (distance > 90) {
      moveX += directionX * enemy.speed * 0.6 * movementMultiplier;
      moveY += directionY * enemy.speed * 0.6 * movementMultiplier;
    }
    moveEnemy(enemy, moveX, moveY, dt);

    if (enemy.summonCooldown <= 0 && enemies.length < 7) {
      enemy.behavior = 'jacko-summon';
      enemy.stateTimer = phaseTwo ? 0.72 : 1;
      enemy.summonCooldown = phaseTwo ? 11 + Math.random() * 4 : 15 + Math.random() * 5;
      enemy.attackCooldown = Math.max(enemy.attackCooldown, 1.2);
      playSound('ML/Skill00.ogg', 0.34);
      showMessage('"Come forth, my minions!"', 2.8);
    } else if (visible && enemy.attackCooldown <= 0) {
      const attackCount = phaseTwo ? 4 : 3;
      const attack = enemy.attackIndex % attackCount;
      enemy.attackIndex += 1;
      playEnemyAttackSound(enemy, 0.24);
      enemy.behavior = attack === 0 ? 'jacko-roll-windup'
        : attack === 1 ? 'jacko-jump-windup'
          : attack === 2 ? 'jacko-shot-windup' : 'jacko-ground-pound-windup';
      enemy.stateTimer = (phaseTwo ? 0.55 : 0.78) + (attack === 0 ? 0.18 : 0);
      enemy.attackCooldown = phaseTwo ? 3.2 + Math.random() * 0.8 : 3.8 + Math.random() * 1.1;
      enemy.groundPoundTarget = phaseTwo && attack === 3 ? { x: player.x, y: player.y } : null;
    }
    return;
  }

  if (enemy.behavior === 'jacko-summon') {
    if (enemy.stateTimer <= 0) {
      const kinds = enemyKindsForCurrentMap();
      for (let index = 0; index < 2 && enemies.length < 7; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const spawn = findEnemySpawnPosition(
          enemy.x + Math.cos(angle) * 76,
          enemy.y + Math.sin(angle) * 76,
        );
        if (spawn) enemies.push(createEnemy(kind, spawn.x, spawn.y));
      }
      fireJackoBurst(enemy, 6);
      enemy.behavior = 'jacko-idle';
    }
    return;
  }

  if (enemy.behavior === 'jacko-roll-windup') {
    if (enemy.stateTimer <= 0) {
      enemy.behavior = 'jacko-roll';
      enemy.leapX = directionX;
      enemy.leapY = directionY;
      enemy.stateTimer = phaseTwo ? 1.05 : 0.9;
    }
    return;
  }
  if (enemy.behavior === 'jacko-roll') {
    moveEnemy(enemy, enemy.leapX * 330 * movementMultiplier, enemy.leapY * 330 * movementMultiplier, dt);
    if (enemy.stateTimer <= 0) enemy.behavior = 'jacko-idle';
    return;
  }

  if (enemy.behavior === 'jacko-jump-windup') {
    if (enemy.stateTimer <= 0) {
      enemy.leapX = directionX;
      enemy.leapY = directionY;
      enemy.behavior = 'jacko-jump';
      enemy.stateTimer = phaseTwo ? 0.7 : 0.85;
      enemy.jumpBurstFired = false;
    }
    return;
  }
  if (enemy.behavior === 'jacko-jump') {
    moveEnemy(enemy, enemy.leapX * 225 * movementMultiplier, enemy.leapY * 225 * movementMultiplier, dt);
    if (enemy.stateTimer <= 0) {
      triggerCameraShake('jackoJumpLand');
      if (!enemy.jumpBurstFired) fireJackoBurst(enemy);
      enemy.jumpBurstFired = true;
      enemy.behavior = 'jacko-idle';
    }
    return;
  }

  if (enemy.behavior === 'jacko-shot-windup') {
    if (enemy.stateTimer <= 0) {
      fireEnemyProjectile(enemy);
      enemy.behavior = 'jacko-idle';
    }
    return;
  }

  if (enemy.behavior === 'jacko-ground-pound-windup') {
    if (enemy.stateTimer <= 0) {
      enemy.behavior = 'jacko-ground-pound-hidden';
      enemy.stateTimer = phaseTwo ? 0.48 : 0.65;
      enemy.x = -enemy.radius * 3;
      enemy.y = -enemy.radius * 3;
    }
    return;
  }

  if (enemy.behavior === 'jacko-ground-pound-hidden') {
    if (enemy.stateTimer <= 0) {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) {
        enemy.x = -enemy.radius * 2;
        enemy.y = clamp(player.y + (Math.random() - 0.5) * 180, 60, ROOM_H - 60);
      } else if (edge === 1) {
        enemy.x = ROOM_W + enemy.radius * 2;
        enemy.y = clamp(player.y + (Math.random() - 0.5) * 180, 60, ROOM_H - 60);
      } else if (edge === 2) {
        enemy.x = clamp(player.x + (Math.random() - 0.5) * 240, 60, ROOM_W - 60);
        enemy.y = -enemy.radius * 2;
      } else {
        enemy.x = clamp(player.x + (Math.random() - 0.5) * 240, 60, ROOM_W - 60);
        enemy.y = ROOM_H + enemy.radius * 2;
      }
      enemy.groundPoundTarget = { x: player.x, y: player.y };
      const angle = Math.atan2(enemy.groundPoundTarget.y - enemy.y, enemy.groundPoundTarget.x - enemy.x);
      enemy.leapX = Math.cos(angle);
      enemy.leapY = Math.sin(angle);
      enemy.chargeHit = false;
      enemy.behavior = 'jacko-ground-pound-charge';
      enemy.stateTimer = 1.8;
    }
    return;
  }

  if (enemy.behavior === 'jacko-ground-pound-charge') {
    const previous = { x: enemy.x, y: enemy.y };
    const chargeSpeed = phaseTwo ? 760 : 620;
    enemy.x += enemy.leapX * chargeSpeed * dt;
    enemy.y += enemy.leapY * chargeSpeed * dt;
    const targetReached = distanceBetween(enemy, enemy.groundPoundTarget) < chargeSpeed * dt + 16;
    if (!enemy.chargeHit) {
      const lineX = enemy.x - previous.x;
      const lineY = enemy.y - previous.y;
      const lengthSquared = lineX * lineX + lineY * lineY || 1;
      const projection = clamp(((player.x - previous.x) * lineX + (player.y - previous.y) * lineY) / lengthSquared, 0, 1);
      const closest = { x: previous.x + projection * lineX, y: previous.y + projection * lineY };
      if (distanceBetween(player, closest) < player.radius + enemy.radius * 0.7) {
        enemy.chargeHit = true;
        damagePlayer();
      }
    }
    if (targetReached || enemy.stateTimer <= 0) {
      enemy.x = enemy.groundPoundTarget.x;
      enemy.y = enemy.groundPoundTarget.y;
      enemy.behavior = 'jacko-ground-pound-land';
      enemy.stateTimer = 0.34;
      triggerCameraShake('groundPound');
      if (distanceBetween(player, enemy) < player.radius + 90) damagePlayer();
      fireJackoBurst(enemy, phaseTwo ? 12 : 8);
    }
    return;
  }

  if (enemy.behavior === 'jacko-ground-pound-land') {
    if (enemy.stateTimer <= 0) {
      enemy.resetFrom = { x: enemy.x, y: enemy.y };
      enemy.behavior = 'jacko-reset';
      enemy.stateTimer = 0.55;
    }
    return;
  }

  if (enemy.behavior === 'jacko-reset') {
    const progress = 1 - enemy.stateTimer / 0.55;
    enemy.x = enemy.resetFrom.x + (ROOM_W / 2 - enemy.resetFrom.x) * progress;
    enemy.y = enemy.resetFrom.y + (ROOM_H / 2 - enemy.resetFrom.y) * progress;
    if (enemy.stateTimer <= 0) {
      enemy.x = ROOM_W / 2;
      enemy.y = ROOM_H / 2;
      enemy.behavior = 'jacko-idle';
      enemy.attackCooldown = Math.max(enemy.attackCooldown, phaseTwo ? 0.8 : 1.2);
    }
  }
}

const MAX_ROOM_COINS = 10;
const SOFT_FLOOR_COINS = 6;
const MAX_FLOOR_COINS = 10;
let floorCoinsSpawned = 0;
let floorCoinCeiling = SOFT_FLOOR_COINS;
let floorOverflowRolled = false;

function resetFloorCoins() {
  floorCoinsSpawned = 0;
  floorCoinCeiling = SOFT_FLOOR_COINS;
  floorOverflowRolled = false;
}

// Once per map, the first coin past the budget rolls for a windfall; Luck Up raises the odds.
function reserveCoin() {
  if ((currentRoom?.coinsSpawned || 0) >= MAX_ROOM_COINS) return false;
  if (floorCoinsSpawned >= floorCoinCeiling) {
    if (floorOverflowRolled || floorCoinCeiling > SOFT_FLOOR_COINS) return false;
    floorOverflowRolled = true;
    if (Math.random() >= 0.05 + player.luck * 0.1) return false;
    floorCoinCeiling = Math.min(MAX_FLOOR_COINS, SOFT_FLOOR_COINS + 1 + Math.floor(Math.random() * 4));
  }
  floorCoinsSpawned += 1;
  if (currentRoom) currentRoom.coinsSpawned = (currentRoom.coinsSpawned || 0) + 1;
  return true;
}

function spawnCoin(x, y, extra = {}) {
  if (!reserveCoin()) return false;
  pickups.push({ x, y, kind: 'coin', ...extra });
  return true;
}

function createBossObstacle(x, y, sprite) {
  const obstacle = createBreakableAt(x, y, sprite);
  obstacle.bossSpawned = true;
  return obstacle;
}

function dropLoot(x, y, boss = false) {
  if (boss) {
    const abilityCount = ownedAbilityCount() + reservedAbilityCount();
    const abilities = shopItemCatalog.filter((item) => item.kind === 'ability' &&
      !ownedItems.has(item.id) && !reservedUpgradeIds.has(item.id) && abilityCount < 2);
    if (abilities.length > 0) {
      const ability = abilities[Math.floor(Math.random() * abilities.length)];
      pickups.push({ x, y, kind: 'upgrade', item: ability, room: currentRoom });
    }
    return;
  }
  if (Math.random() < 0.3) spawnCoin(x + 14, y);
  if (Math.random() < 0.14) pickups.push({ x, y, kind: 'heart' });
  if (Math.random() < 0.08) pickups.push({ x: x - 12, y, kind: 'bomb' });
}

function spawnEnemyOffspring(enemy) {
  if (currentFloor < 2 || enemy.spawnedOffspring || !['slime', 'mouboo'].includes(enemy.kind) || Math.random() >= 0.22) return;
  enemy.spawnedOffspring = true;
  const offsets = [{ x: -58, y: -18 }, { x: 58, y: 18 }];
  for (const offset of offsets) {
    const position = findEnemySpawnPosition(enemy.x + offset.x, enemy.y + offset.y, 10, 0);
    if (!position) continue;
    const offspring = createEnemy(enemy.kind, position.x, position.y);
    offspring.spawnedOffspring = true;
    offspring.isOffspring = true;
    offspring.radius *= 0.58;
    offspring.speed *= 1.35;
    offspring.hp = Math.max(2, strongestPlayerSingleHit() + 1);
    offspring.maxHp = offspring.hp;
    enemies.push(offspring);
  }
  if (enemies.some((candidate) => candidate.isOffspring)) {
    showMessage(`${enemy.kind === 'slime' ? 'The slime split!' : 'A mouboo calf joins the fight!'}`, 2.5);
    addParticles(enemy.x, enemy.y, enemy.color, 12, 85);
  }
}

function damageEnemy(enemy, damage, impactX = player.x, impactY = player.y, ignoreFirstHitCap = false) {
  if (enemy.linkId && enemy.linkShieldCharges > 0) {
    const twin = enemies.find((candidate) => candidate !== enemy && candidate.linkId === enemy.linkId);
    if (twin) {
      if (!enemy.linkShieldSeen) {
        enemy.linkShieldSeen = true;
        twin.linkShieldSeen = true;
        recordEnemyAbilityDiscovery('twin-shield', 'linked-twins');
      }
      const remainingCharges = enemy.linkShieldCharges - 1;
      enemy.linkShieldCharges = remainingCharges;
      twin.linkShieldCharges = remainingCharges;
      addParticles(enemy.x, enemy.y, '#d8e6ff', 8, 70);
      if (remainingCharges === 0) showMessage('The linked armor breaks!', 1.8);
      return;
    }
    enemy.linkShieldCharges = 0;
  }
  // A full-health enemy always survives its first hit.
  if (!ignoreFirstHitCap && enemy.hp === enemy.maxHp && enemy.maxHp > 1) damage = Math.min(damage, enemy.hp - 1);
  enemy.hp -= damage;
  enemy.hitFlash = 0.16;
  const impactXDirection = enemy.x - impactX;
  const impactYDirection = enemy.y - impactY;
  const fallbackAngle = Math.atan2(player.lookY, player.lookX);
  const impactAngle = impactXDirection || impactYDirection
    ? Math.atan2(impactYDirection, impactXDirection) : fallbackAngle;
  const recoilDistance = enemy.boss ? 0 : enemy.miniBoss ? 6 : 10;
  if (recoilDistance > 0) {
    moveEnemy(enemy, Math.cos(impactAngle) * recoilDistance / 0.06,
      Math.sin(impactAngle) * recoilDistance / 0.06, 0.06);
  }
  hitStopTimer = Math.max(hitStopTimer, enemy.boss ? 0.04 : 0.025);
  if ((enemy.boss || enemy.miniBoss) && enemy.phase === 1 && enemy.hp <= enemy.maxHp * 0.5) {
    enemy.phase = 2;
    enemy.attackCooldown = Math.min(enemy.attackCooldown, 0.7);
    enemy.summonCooldown = Math.min(enemy.summonCooldown, 4);
    if (enemy.kind === 'yetiking' || enemy.kind === 'yeti') {
      enemy.yetiBaseSpeed = enemy.speed;
      enemy.behavior = 'yeti-berserk-windup';
      enemy.stateTimer = 0.55;
      enemy.signatureTarget = { x: player.x, y: player.y };
    }
    showMessage(`${enemy.title} enters Phase II!`, 3);
    addParticles(enemy.x, enemy.y, '#ff8e38', 24, 150);
  }
  if (enemy.hp <= 0) {
    score += enemy.boss ? 100 : 10;
    killStreak = killStreakTimer > 0 ? killStreak + 1 : 1;
    killStreakTimer = 3.2;
    if (killStreak % 3 === 0) {
      const bonusCoin = reserveCoin();
      if (bonusCoin) coins += 1;
      streakCallout.timer = streakCallout.duration;
      streakCallout.x = player.x;
      streakCallout.y = player.y - 42;
      streakCallout.text = `${killStreak} CHAIN${bonusCoin ? '  +1 ZENNY' : ''}`;
      addParticles(enemy.x, enemy.y, '#ffe08b', 8, 95);
      playSound('special/fanfare.ogg', 0.12);
    }
    playSound(enemy.kind === 'jacko' ? 'monsters/pumpkin/die1.ogg' : 'monsters/zombie/zombiedie.ogg',
      enemy.boss ? 0.65 : 0.38);
    dropLoot(enemy.x, enemy.y, enemy.boss);
    const linkedTwin = enemy.linkId
      ? enemies.find((candidate) => candidate !== enemy && candidate.linkId === enemy.linkId)
      : null;
    if (!enemy.boss && enemy.kind === 'croc' && Math.random() < 0.22 && breakables.length < 8) {
      breakables.push(createBreakableAt(
        clamp(enemy.x + (Math.random() - 0.5) * 48, 90, ROOM_W - 90),
        clamp(enemy.y + (Math.random() - 0.5) * 48, 90, ROOM_H - 90),
      ));
    }
    const wasBoss = enemy.boss;
    const wasMiniBoss = enemy.miniBoss === true;
    enemies.splice(enemies.indexOf(enemy), 1);
    if (linkedTwin) {
      linkedTwin.linkId = null;
      linkedTwin.linkShieldCharges = 0;
      linkedTwin.linkShieldSeen = false;
      linkedTwin.speed /= 1.08;
      addParticles(linkedTwin.x, linkedTwin.y, '#d8e6ff', 8, 80);
      showMessage(`${linkedTwin.title || linkedTwin.kind} loses its linked armor.`, 2.5);
    }
    spawnEnemyOffspring(enemy);
    if (wasBoss) {
      playSound('special/fanfare.ogg', 0.45);
      save.arcanist = true;
      queueChapter('character:arcanist', characterChapters.arcanist);
      const unlockedId = ({
        'slime-mother': 'tulimshar-guard', bosspinkie: 'candor-runner',
        jacko: 'hurnscald-herbalist', golem: 'artis-archivist',
        reaper: 'graveyard-keeper', banditlord: 'halinarzo-ranger',
        'snowman-boss': 'nivalis-oracle', yetiking: 'frostia-reclaimer',
        forestdragon: 'fortress-keeper', nightdragon: 'world-edge-veteran',
      })[enemy.kind];
      const newlyUnlocked = unlockedId ? unlockCharacter(unlockedId) : false;
      const unlockedName = characterRoster.find((entry) => entry.id === unlockedId)?.name;
      recordStory(`${enemy.title} defeated`, `${enemy.title} has fallen. ${newlyUnlocked && unlockedName ? `${unlockedName} is now available. ` : ''}This guardian belongs to the side-story and does not alter TMW quest history.`);
      recordStory(`${currentFloorTheme().name} · echo`, regionalBossClues[currentRegionId()]);
      persistSave();
      const unlockNotice = newlyUnlocked && unlockedName ? ` ${unlockedName} is now selectable.` : '';
      showMessage(enemies.length === 0
        ? `${enemy.title} falls.${unlockNotice} The seal opens.`
        : `${enemy.title} falls.${unlockNotice} Clear the remaining monsters to open the seal.`, 5);
    } else if (wasMiniBoss) {
      const regionalUnlockId = ({ bosspinkie: 'candor-runner', 'spider-queen': 'glass-quill' })[enemy.kind];
      const regionalUnlock = regionalUnlockId ? unlockCharacter(regionalUnlockId) : false;
      const newlyUnlocked = unlockCharacter('ironbound');
      const regionalName = characterRoster.find((entry) => entry.id === regionalUnlockId)?.name;
      const unlocks = [regionalUnlock && regionalName, newlyUnlocked && 'Ironbound'].filter(Boolean);
      showMessage(`${enemy.title || 'The sentinel'} defeated.${unlocks.length ? ` ${unlocks.join(' and ')} now selectable.` : ''}`, 4);
    }
  }
}

function placeBomb() {
  if (mode !== 'playing' || bombsHeld <= 0 ||
    bombs.some((bomb) => bomb.owner !== 'enemy' && bomb.fuse > 0)) return;
  bombsHeld -= 1;
  bombs.push({ owner: 'player', x: player.x, y: player.y, fuse: 1.7, radius: 110 });
  playSound('system/click.ogg', 0.35);
  updateHud();
}

function explodeBomb(bomb) {
  triggerCameraShake('bomb');
  playSound('special/nature-thunder.ogg', bomb.owner === 'enemy' ? 0.32 : 0.55);
  const hurtByBlast = (target) => distanceBetween(bomb, target) <= bomb.radius && hasLineOfSight(bomb, target);
  if (hurtByBlast(player)) damagePlayer(3);
  if (bomb.owner !== 'enemy') {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const target = enemies[i];
      if (!hurtByBlast(target)) continue;
      if (target.boss || target.miniBoss) {
        // Bombs take 30% of a boss's current health and can never land the finishing blow.
        const blast = Math.min(Math.ceil(target.hp * 0.3), target.hp - 1);
        if (blast > 0) damageEnemy(target, blast, bomb.x, bomb.y, true);
      } else {
        damageEnemy(target, target.hp + target.maxHp, bomb.x, bomb.y, true);
      }
    }
    triggerSporeBloom(bomb);
  }
  for (let i = breakables.length - 1; i >= 0; i -= 1) {
    if (!breakables[i].broken && distanceBetween(bomb, breakables[i]) <= bomb.radius) {
      damageObstacle(breakables[i], breakables[i].hp, 'bomb');
    }
  }
  updateHud();
  const secret = bomb.owner !== 'enemy' ? currentRoom.secretExit : null;
  if (secret) {
    const direction = directions.find((item) => item.name === secret.direction);
    const wallPoint = {
      x: direction.name === 'left' ? 24 : direction.name === 'right' ? ROOM_W - 24 : bomb.x,
      y: direction.name === 'up' ? 24 : direction.name === 'down' ? ROOM_H - 24 : bomb.y,
    };
    const alongWall = direction.dx === 0
      ? Math.abs(bomb.x - ROOM_W / 2) < 78
      : Math.abs(bomb.y - ROOM_H / 2) < 78;
    if (secret.room.hidden && alongWall && distanceBetween(bomb, wallPoint) < bomb.radius + 60) {
      secret.room.hidden = false;
      recordStory('A hidden passage', 'A bomb opened a concealed room. Its relics are your discovery in this side-story, not a change to a canonical TMW quest.');
      if (!secret.keyDropped) {
        pickups.push({ x: bomb.x, y: bomb.y, kind: 'key' });
        secret.keyDropped = true;
      }
      showMessage('The cracked wall gives way. A key lies beside the hidden passage.', 4);
    }
  }
}

function isPlayerNearDoor(direction) {
  const verticalDoor = direction === 'up' || direction === 'down';
  const perpendicularPosition = verticalDoor ? player.x : player.y;
  const center = (verticalDoor ? ROOM_W : ROOM_H) / 2;
  const aligned = Math.abs(perpendicularPosition - center) <=
    DOORWAY_HALF_WIDTH - player.radius - WALL_COLLISION_PADDING;
  const reach = ROOM_WALL_THICKNESS + player.radius + 20;
  const nearWall = direction === 'up' ? player.y <= reach
    : direction === 'down' ? player.y >= ROOM_H - reach
      : direction === 'left' ? player.x <= reach
        : player.x >= ROOM_W - reach;
  return aligned && nearWall;
}

function shopPedestalPosition(index) {
  return { x: 260 + index * 220, y: 372 };
}

let walkInCooldown = 0;

function bankPadPosition(withdraw) {
  return { x: ROOM_W / 2 + (withdraw ? 130 : -130), y: ROOM_H / 2 + 140 };
}

// Shop items, the bank pad, the menhir, the descent pad, and key doors all trigger on contact.
function updateWalkInInteractions(dt) {
  walkInCooldown = Math.max(0, walkInCooldown - dt);
  if (currentRoom.type === 'boss' && currentRoom.cleared &&
      distanceBetween(player, { x: ROOM_W * 0.72, y: ROOM_H / 2 }) > 70) {
    currentRoom.descendArmed = true;
  }
  if (walkInCooldown > 0) return;
  if (currentRoom.type === 'shop' && currentRoom.shopStock) {
    const index = currentRoom.shopStock.findIndex((item, slot) => !item.purchased &&
      distanceBetween(player, shopPedestalPosition(slot)) < player.radius + 26);
    if (index >= 0) {
      walkInCooldown = 1.1;
      buyShopItem(index);
      return;
    }
  }
  if (currentRoom.type === 'bank') {
    if (coins > 0 && distanceBetween(player, bankPadPosition(false)) < 44) {
      walkInCooldown = 1.5;
      interact();
      return;
    }
    if (save.bankedZenny > 0 && distanceBetween(player, bankPadPosition(true)) < 44) {
      walkInCooldown = 1.5;
      interact(true);
      return;
    }
  }
  if (currentRoom.type === 'start' && distanceBetween(player, soulMenhirPosition()) < 60) {
    walkInCooldown = 8;
    interact();
    return;
  }
  if (currentRoom.type === 'boss' && currentRoom.cleared && currentRoom.descendArmed &&
      distanceBetween(player, { x: ROOM_W * 0.72, y: ROOM_H / 2 }) < 40) {
    walkInCooldown = 1;
    interact();
    return;
  }
  const lockedDoor = directions.find((direction) => currentRoom.cleared &&
    isPlayerNearDoor(direction.name) && currentRoom.links[direction.name] &&
    currentRoom.lockedDoors[direction.name]);
  if (lockedDoor) {
    walkInCooldown = keysHeld > 0 ? 0.6 : 2;
    enterDoor(lockedDoor.name);
  }
}

function interact(withdrawFromBank = false) {
  if (mode !== 'playing') return;
  if (currentRoom.type === 'start' && distanceBetween(player, soulMenhirPosition()) < 86) {
    recordStory('Soul Menhir', `You touched the Soul Menhir at the start of ${currentFloorTheme().name}; this descent is saved from here.`);
    saveRunState();
    showMessage('Soul Menhir touched. Your descent is saved here.', 2.5);
    return;
  }
  if (currentRoom.type === 'boss' && currentRoom.cleared) {
    if (distanceBetween(player, { x: ROOM_W * 0.72, y: ROOM_H / 2 }) > 76) {
      showMessage('The seal is open. Approach the descent at the back of the chamber.', 2.5);
      return;
    }
    if (currentFloor === finalFloor) {
      mode = 'won';
      save.completedRuns += 1;
      unlockCharacter('vault-delver');
      persistSave();
      clearSavedRun();
      showMessage("The mana current flows toward Candor again. The Mana Tree's light steadies.", 8);
      return;
    }
    currentFloor += 1;
    if (currentRegionId() === 'hurnscald' && unlockCharacter('hurnscald-herbalist')) {
      showMessage('Unlocked: Hurnscald Herbalist.', 3);
    }
    if (currentRegionId() === 'artis' && unlockCharacter('artis-archivist')) {
      showMessage('Unlocked: Artis Archivist.', 3);
    }
    resetFloorCoins();
    const generated = generateDungeon();
    rooms = generated.rooms;
    currentRoom = generated.startRoom;
    player.x = ROOM_W / 2;
    player.y = ROOM_H / 2;
    spawnRoom(currentRoom);
    saveRunState();
    discoverRegion();
    showMessage(`Chapter ${currentFloor}: the trail descends deeper into the sanctum.`, 5);
    return;
  }
  if (currentRoom.type === 'bank' &&
      distanceBetween(player, { x: ROOM_W / 2, y: ROOM_H / 2 }) < 240) {
    if (withdrawFromBank) {
      const amount = save.bankedZenny;
      if (amount <= 0) showMessage('Your vault is empty.', 2);
      else if (persistBankedZenny(0)) {
        coins += amount;
        persistRunAfterBankTransaction();
        showMessage(`Withdrew ${amount} zenny from the vault.`, 2.5);
      }
    } else if (coins <= 0) {
      showMessage('You have no zenny to deposit.', 2);
    } else {
      const amount = coins;
      if (persistBankedZenny(save.bankedZenny + amount)) {
        coins = 0;
        persistRunAfterBankTransaction();
        showMessage(`Deposited ${amount} zenny. The vault now holds ${save.bankedZenny}.`, 2.5);
      }
    }
    updateHud();
    saveRunState();
    return;
  }
  if (currentRoom.type === 'shop' && distanceBetween(player, { x: ROOM_W / 2, y: ROOM_H / 2 }) < 150) {
    showMessage('Walk into an item on a pedestal to buy it.', 2);
    return;
  }

  const door = directions.find((direction) => {
    return isPlayerNearDoor(direction.name) &&
      currentRoom.links[direction.name] && currentRoom.lockedDoors[direction.name];
  });
  if (door && currentRoom.cleared) {
    enterDoor(door.name);
    return;
  }
  const openDoor = directions.find((direction) => {
    return isPlayerNearDoor(direction.name) &&
      (currentRoom.links[direction.name] ||
        (currentRoom.secretExit?.direction === direction.name && !currentRoom.secretExit.room.hidden)) &&
      !currentRoom.lockedDoors[direction.name];
  });
  if (openDoor && currentRoom.cleared) {
    enterDoor(openDoor.name);
    return;
  }
  showMessage('Nothing to interact with here.', 1.2);
}

function buyShopItem(index) {
  const item = currentRoom.shopStock[index];
  if (!item || item.purchased) return;
  if (item.kind === 'companion' && companions.length >= 2) {
    showMessage('Only two familiars can travel with you on a descent.', 2.5);
    return;
  }
  if (item.kind === 'ability' && (ownedItems.has(item.id) || ownedAbilityCount() >= 2)) {
    showMessage('Your two ability slots are already filled.', 2);
    return;
  }
  if (item.kind === 'skill' && combatStyles.has(item.style)) {
    showMessage(`You already know how to ${item.style === 'melee' ? 'brawl' : item.style === 'bow' ? 'use a bow' : 'cast magic'}.`, 2);
    return;
  }
  if (item.kind !== 'consumable' && ownedItems.has(item.id)) {
    showMessage(`${item.name} is already equipped.`, 2);
    return;
  }
  if (coins < item.cost) {
    showMessage(`${item.name} costs ${item.cost} zenny.`, 2);
    return;
  }
  coins -= item.cost;
  item.purchased = true;
  if (['passive', 'skill', 'weapon', 'clothing', 'ability', 'element'].includes(item.kind)) {
    if (!grantUpgrade(item, 'shop')) {
      coins += item.cost;
      item.purchased = false;
      updateHud();
      return;
    }
    if (['ability', 'element'].includes(item.kind) && !save.purchasedAbilityIds.includes(item.id)) {
      save.purchasedAbilityIds.push(item.id);
      persistSave();
    }
  } else if (item.kind === 'companion') {
    ownedItems.add(item.id);
    companions.push(createCompanion(item));
  } else if (item.kind === 'consumable') {
    const stack = consumables.find((entry) => entry.id === item.id);
    if (stack) stack.count += 1;
    else consumables.push({ id: item.id, name: item.name, count: 1 });
  }
  updateHud();
  if (!['passive', 'skill', 'weapon', 'clothing', 'ability', 'element'].includes(item.kind)) {
    showMessage(`${item.name} acquired: ${item.description}.${item.kind === 'consumable' ? ' Press Q to use it.' : ''}`, 3);
  }
}

function createCompanion(item) {
  const kind = item.companion;
  const source = createEnemy(kind, player.x, player.y);
  return {
    kind,
    color: source.color,
    x: player.x + (Math.random() - 0.5) * 20,
    y: player.y + 24,
    attackCooldown: 0.5 + Math.random(),
    followAngle: Math.random() * Math.PI * 2,
    hp: 2,
    maxHp: 2,
    respawnTimer: 0,
    hitCooldown: 0,
    enemyCooldowns: new Map(),
  };
}

function useConsumable() {
  const available = consumables.filter((item) => item.count > 0);
  if (available.length === 0) {
    showMessage('No consumables ready. Find one in a shop.', 1.8);
    return;
  }
  for (const item of available) {
    if (item.id === 'mana-tonic' && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 2);
    } else if (item.id === 'bomb-bundle') {
      bombsHeld += 2;
    } else if (item.id === 'mana-burst' && enemies.length > 0) {
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const enemy = enemies[i];
        addParticles(enemy.x, enemy.y, '#9a7bff', 10, 130);
        damageEnemy(enemy, 8, player.x, player.y);
      }
    } else {
      continue;
    }
    item.count -= 1;
    updateHud();
    showMessage(`${item.name} used.`, 2.2);
    return;
  }
  showMessage('None of your consumables can help right now.', 2);
}

function useFrostNova() {
  if (mode !== 'playing' || !ownedItems.has('frost-rune')) return;
  if (frostNovaCooldown > 0) {
    showMessage(`Frost Rune recharging: ${Math.ceil(frostNovaCooldown)}s.`, 1.5);
    return;
  }
  const radius = 250;
  let affected = 0;
  for (const enemy of enemies) {
    if (distanceBetween(player, enemy) > radius) continue;
    if (enemy.boss) enemy.slowTimer = Math.max(enemy.slowTimer || 0, 3);
    else enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, 2.4);
    addParticles(enemy.x, enemy.y, '#67d9ff', 12, 110);
    affected += 1;
  }
  frostNovaCooldown = 12;
  addParticles(player.x, player.y, '#7be6ff', 20, 170);
  showMessage(affected ? 'Frost Rune! Nearby foes are frozen; bosses are slowed.' : 'Frost Rune pulsed, but no foes were in range.', 2.5);
  saveRunState();
}

function triggerSporeBloom(bomb) {
  if (bomb.owner === 'enemy' || !ownedItems.has('spore-bloom')) return;
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    projectiles.push({
      x: bomb.x,
      y: bomb.y,
      vx: Math.cos(angle) * 180,
      vy: Math.sin(angle) * 180,
      radius: 6,
      size: 1.1,
      color: '#d78be7',
      type: 'spore-shard',
      damage: Math.max(1, Math.ceil((player.damage + weapon.damageBonus) * 0.75)),
      ttl: 1.1,
      trailTimer: 0,
      owner: 'player',
    });
  }
  addParticles(bomb.x, bomb.y, '#e5a0f2', 12, 78);
  playSound('monsters/mushroom/spawn2.ogg', 0.2);
}

function vibrateController(damageAmount) {
  if (typeof navigator.getGamepads !== 'function') return;
  const gamepad = Array.from(navigator.getGamepads()).find((candidate) => candidate?.connected);
  if (!gamepad) return;
  const duration = damageAmount > 1 ? 180 : 90;
  const magnitude = damageAmount > 1 ? 0.85 : 0.48;
  try {
    if (gamepad.vibrationActuator?.playEffect) {
      gamepad.vibrationActuator.playEffect('dual-rumble', {
        duration,
        strongMagnitude: magnitude,
        weakMagnitude: magnitude * 0.65,
      }).catch(() => {});
    } else if (gamepad.hapticActuators?.[0]?.pulse) {
      gamepad.hapticActuators[0].pulse(magnitude, duration);
    }
  } catch (error) {
    return;
  }
}

function damagePlayer(damageAmount = 1) {
  if (player.invuln > 0 || mode !== 'playing') return;
  if (ownedItems.has('bonded-aegis') && player.aegisCharges > 0) {
    player.aegisCharges -= 1;
    player.invuln = 0.45;
    addParticles(player.x, player.y, '#d3e2ff', 12, 95);
    showMessage(`Bonded Aegis absorbed the hit. ${player.aegisCharges} charge${player.aegisCharges === 1 ? '' : 's'} remain.`, 1.6);
    saveRunState();
    updateHud();
    return;
  }
  const incomingDamage = Math.max(1, Math.floor(damageAmount));
  player.damageFlashTimer = 0.28;
  vibrateController(incomingDamage);
  let remainingDamage = incomingDamage;
  if (player.armor > 0) {
    player.armor -= 1;
    remainingDamage -= 1;
    showMessage('Your clothing absorbs the hit.', 1.4);
  }
  if (remainingDamage > 0) player.hp -= remainingDamage;
  if (incomingDamage > 1) triggerCameraShake('playerHeavyHit');
  player.invuln = 0.9;
  if (player.hp <= 0) {
    mode = 'gameover';
    clearSavedRun();
    showMessage('The sanctum claims another delver. Select a character to try again.', 5);
  }
  updateHud();
}

function shieldWithCompanion(projectile) {
  const companion = companions
    .filter((candidate) => candidate.hp > 0 && candidate.hitCooldown <= 0)
    .sort((first, second) => distanceBetween(first, projectile) - distanceBetween(second, projectile))
    .find((candidate) => distanceBetween(candidate, projectile) < 19 + projectile.radius);
  if (!companion) return false;
  companion.hp -= 1;
  companion.hitCooldown = 0.8;
  addParticles(companion.x, companion.y, '#bcf0a3', 9, 100);
  if (companion.hp <= 0) {
    companion.respawnTimer = 10;
    showMessage(`${companion.kind} familiar was knocked out and will return in 10 seconds.`, 2.5);
  }
  return true;
}

function moveEnemy(enemy, vx, vy, dt) {
  const wallClearance = ROOM_WALL_THICKNESS + enemy.radius + WALL_COLLISION_PADDING;
  enemy.x = clamp(enemy.x + vx * dt, wallClearance, ROOM_W - wallClearance);
  enemy.y = clamp(enemy.y + vy * dt, wallClearance, ROOM_H - wallClearance);
  for (const obstacle of breakables) {
    if (obstacle.broken) continue;
    const distance = distanceBetween(enemy, obstacle);
    const minimumDistance = enemy.radius + obstacle.radius;
    if (distance < minimumDistance) {
      const pushX = distance === 0 ? 1 : (enemy.x - obstacle.x) / distance;
      const pushY = distance === 0 ? 0 : (enemy.y - obstacle.y) / distance;
      enemy.x += pushX * (minimumDistance - distance);
      enemy.y += pushY * (minimumDistance - distance);
    }
  }
}

function updateEnemy(enemy, dt) {
  enemy.freezeTimer = Math.max(0, enemy.freezeTimer || 0);
  enemy.slowTimer = Math.max(0, enemy.slowTimer || 0);
  if (enemy.freezeTimer > 0) {
    enemy.freezeTimer = Math.max(0, enemy.freezeTimer - dt);
    if (enemy.freezeTimer > 0) return;
  }
  if (enemy.slowTimer > 0) {
    enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
    dt *= 0.4;
  }
  enemy.wetTimer = Math.max(0, (enemy.wetTimer || 0) - dt);
  enemy.burnTimer = Math.max(0, (enemy.burnTimer || 0) - dt);
  enemy.burnCooldown = Math.max(0, (enemy.burnCooldown || 0) - dt);
  if (enemy.burnTimer > 0 && enemy.burnCooldown <= 0) {
    enemy.burnCooldown = 0.8;
    damageEnemy(enemy, 1, enemy.x, enemy.y);
    if (!enemies.includes(enemy)) return;
  }
  enemy.wetTimer = Math.max(0, (enemy.wetTimer || 0) - dt);
  enemy.burnTimer = Math.max(0, (enemy.burnTimer || 0) - dt);
  enemy.burnCooldown = Math.max(0, (enemy.burnCooldown || 0) - dt);
  if (enemy.burnTimer > 0 && enemy.burnCooldown <= 0) {
    enemy.burnCooldown = 0.8;
    damageEnemy(enemy, 1, enemy.x, enemy.y);
    if (!enemies.includes(enemy)) return;
  }
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const directionX = dx / distance;
  const directionY = dy / distance;
  const visible = distance < 430 && hasLineOfSight(enemy, player);
  enemy.attackCooldown -= dt * (enemy.boss || enemy.miniBoss
    ? 1 + Math.max(0, currentFloor - 1) * 0.06 : 1) * (enemy.boss ? 1.3 : 1);
  enemy.stateTimer -= dt;
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  enemy.spitFlash = Math.max(0, enemy.spitFlash - dt);

  if (enemy.boss || enemy.miniBoss) {
    updateBossExtras(enemy, dt);
    if (enemy.kind === 'spider-queen') {
      updateSpiderQueen(enemy, dt, directionX, directionY, distance, visible);
    } else if (enemy.kind === 'golem') {
      updateGolemBoss(enemy, dt, directionX, directionY, distance, visible);
    } else if (enemy.kind === 'jacko') {
      updateArenaBoss(enemy, dt, directionX, directionY, distance, visible);
    } else {
      updateUniqueBoss(enemy, dt, directionX, directionY, distance, visible);
    }
    return;
  }

  if (enemy.linkId && updateLinkedTwin(enemy, dt)) return;

  if (enemy.archetype === 'cluster-caster') {
    if (enemy.behavior === 'cluster-windup') {
      if (enemy.stateTimer <= 0) {
        throwClusterOrb(enemy);
        enemy.behavior = 'hover';
        enemy.attackCooldown = 5.2;
      }
      return;
    }
    const spacing = distance < 185 ? -1 : distance > 275 ? 1 : 0;
    moveEnemy(enemy, directionX * enemy.speed * spacing, directionY * enemy.speed * spacing, dt);
    if (visible && distance < 370 && enemy.attackCooldown <= 0) {
      enemy.behavior = 'cluster-windup';
      enemy.stateTimer = 1.05;
      enemy.attackCooldown = 5.2;
      playSound('monsters/mushroom/spawn2.ogg', 0.16);
      addParticles(enemy.x, enemy.y, '#d490e9', 6, 28);
    }
    return;
  }

  if (enemy.archetype === 'summoner') {
    enemy.summonCooldown -= dt;
    const spacing = distance < 170 ? -1 : distance > 245 ? 1 : 0;
    moveEnemy(enemy, directionX * enemy.speed * spacing, directionY * enemy.speed * spacing, dt);
    const fluffyCount = enemies.filter((candidate) => candidate.kind === 'fluffy').length;
    if (visible && distance < 380 && enemy.summonCooldown <= 0 && fluffyCount < 4) {
      const angle = Math.random() * Math.PI * 2;
      const spawn = findEnemySpawnPosition(enemy.x + Math.cos(angle) * 54,
        enemy.y + Math.sin(angle) * 54, 16, 0, enemy);
      if (spawn) {
        enemies.push(createEnemy('fluffy', spawn.x, spawn.y));
        addParticles(spawn.x, spawn.y, '#f5e5c8', 9, 42);
        playSound('monsters/fluffy/hit.ogg', 0.12);
      }
      enemy.summonCooldown = 9 + Math.random() * 3;
    }
    return;
  }

  if (enemy.archetype === 'trailer') {
    if (!Number.isFinite(enemy.snailHeading)) {
      enemy.snailHeading = Math.round(enemy.wanderAngle / (Math.PI / 4)) * (Math.PI / 4);
    }
    enemy.trailCooldown -= dt;
    const headingX = Math.cos(enemy.snailHeading);
    const headingY = Math.sin(enemy.snailHeading);
    if (enemy.behavior === 'snail-windup') {
      if (enemy.stateTimer <= 0) {
        enemy.behavior = 'snail-charge';
        enemy.snailChargeDistance = 340;
        enemy.snailChargeHit = false;
      }
      return;
    }
    if (enemy.behavior === 'snail-charge') {
      const previous = { x: enemy.x, y: enemy.y };
      const next = { x: enemy.x + headingX * 390 * dt, y: enemy.y + headingY * 390 * dt };
      const hitsObstacle = breakables.some((obstacle) => !obstacle.broken &&
        distanceBetween(next, obstacle) < enemy.radius + obstacle.radius + 4);
      const hitsWall = next.x < ROOM_WALL_THICKNESS + enemy.radius ||
        next.x > ROOM_W - ROOM_WALL_THICKNESS - enemy.radius ||
        next.y < ROOM_WALL_THICKNESS + enemy.radius ||
        next.y > ROOM_H - ROOM_WALL_THICKNESS - enemy.radius;
      if (hitsObstacle || hitsWall || enemy.snailChargeDistance <= 0) {
        enemy.behavior = 'crawl';
        enemy.snailHeading = (enemy.snailHeading + Math.PI / 2) % (Math.PI * 2);
        enemy.attackCooldown = 2.4;
      } else {
        moveEnemy(enemy, headingX * 390, headingY * 390, dt);
        const lineX = enemy.x - previous.x;
        const lineY = enemy.y - previous.y;
        const lengthSquared = lineX * lineX + lineY * lineY || 1;
        const projection = clamp(((player.x - previous.x) * lineX + (player.y - previous.y) * lineY) / lengthSquared, 0, 1);
        const closest = { x: previous.x + lineX * projection, y: previous.y + lineY * projection };
        if (!enemy.snailChargeHit && distanceBetween(player, closest) < player.radius + enemy.radius) {
          enemy.snailChargeHit = true;
          damagePlayer();
        }
        enemy.snailChargeDistance -= 390 * dt;
        if (enemy.trailCooldown <= 0 && groundHazards.length < 36) {
          createGroundHazard(enemy.x, enemy.y, 'snailTrail');
          enemy.trailCooldown = 0.24;
        }
      }
      return;
    }
    const next = { x: enemy.x + headingX * enemy.speed * dt, y: enemy.y + headingY * enemy.speed * dt };
    const hitsObstacle = breakables.some((obstacle) => !obstacle.broken &&
      distanceBetween(next, obstacle) < enemy.radius + obstacle.radius + 4);
    const hitsWall = next.x < ROOM_WALL_THICKNESS + enemy.radius ||
      next.x > ROOM_W - ROOM_WALL_THICKNESS - enemy.radius ||
      next.y < ROOM_WALL_THICKNESS + enemy.radius ||
      next.y > ROOM_H - ROOM_WALL_THICKNESS - enemy.radius;
    if (hitsObstacle || hitsWall) {
      enemy.snailHeading = (enemy.snailHeading + Math.PI / 2) % (Math.PI * 2);
    } else {
      moveEnemy(enemy, headingX * enemy.speed, headingY * enemy.speed, dt);
    }
    if (enemy.trailCooldown <= 0 && groundHazards.length < 36) {
      createGroundHazard(enemy.x, enemy.y, 'snailTrail');
      enemy.trailCooldown = 0.45;
    }
    const laneX = player.x - enemy.x;
    const laneY = player.y - enemy.y;
    const forwardDistance = laneX * headingX + laneY * headingY;
    const laneDistance = Math.abs(laneX * headingY - laneY * headingX);
    if (forwardDistance > 0 && forwardDistance < 340 &&
        laneDistance < enemy.radius + player.radius + 18 && enemy.attackCooldown <= 0) {
      enemy.behavior = 'snail-windup';
      enemy.stateTimer = 0.5;
      enemy.attackCooldown = 3.2;
      playEnemyAttackSound(enemy, 0.14);
    }
    return;
  }

  if (enemy.archetype === 'web-spitter') {
    if (enemy.behavior === 'shoot-windup') {
      if (enemy.stateTimer <= 0) {
        fireEnemyProjectile(enemy);
        enemy.behavior = 'hover';
        enemy.attackCooldown = 2.8;
      }
    } else {
      const spacing = enemy.miniBoss ? (distance > 90 ? 1 : 0) : distance < 180 ? -1 : distance > 270 ? 1 : 0;
      const tangentX = -directionY * enemy.strafeDirection;
      const tangentY = directionX * enemy.strafeDirection;
      moveEnemy(enemy, directionX * enemy.speed * spacing + tangentX * enemy.speed * 0.3,
        directionY * enemy.speed * spacing + tangentY * enemy.speed * 0.3, dt);
      if (visible && distance < 330 && enemy.attackCooldown <= 0) {
        enemy.behavior = 'shoot-windup';
        enemy.stateTimer = 0.48;
        enemy.attackCooldown = 2.8;
        enemy.leapX = directionX;
        enemy.leapY = directionY;
      }
    }
    return;
  }

  if (enemy.laserMode) {
    if (enemy.behavior === 'laser-charge' && enemy.stateTimer <= 0) {
      enemy.behavior = 'laser';
      enemy.stateTimer = 0.34;
      enemy.laserHit = false;
    } else if (enemy.behavior === 'laser' && enemy.stateTimer <= 0) {
      enemy.behavior = 'hover';
      enemy.attackCooldown = 3.4;
      fireEnemyProjectile(enemy);
    } else if (enemy.behavior !== 'laser-charge' && enemy.behavior !== 'laser' && visible && enemy.attackCooldown <= 0) {
      enemy.behavior = 'laser-charge';
      enemy.stateTimer = 0.72;
      enemy.laserAngle = Math.atan2(dy, dx);
      enemy.attackCooldown = 3.4;
    }
    if (enemy.behavior === 'laser') {
      const beamEnd = {
        x: enemy.x + Math.cos(enemy.laserAngle) * Math.max(ROOM_W, ROOM_H),
        y: enemy.y + Math.sin(enemy.laserAngle) * Math.max(ROOM_W, ROOM_H),
      };
      const lineX = beamEnd.x - enemy.x;
      const lineY = beamEnd.y - enemy.y;
      const lineLengthSquared = lineX * lineX + lineY * lineY || 1;
      const projection = clamp(((player.x - enemy.x) * lineX + (player.y - enemy.y) * lineY) / lineLengthSquared, 0, 1);
      const closest = { x: enemy.x + projection * lineX, y: enemy.y + projection * lineY };
      if (!enemy.laserHit && hasLineOfSight(enemy, player) &&
        distanceBetween(player, closest) < player.radius + 10) {
        enemy.laserHit = true;
        damagePlayer();
      }
    }
    return;
  }

  if (enemy.behavior === 'bomb-windup') {
    if (enemy.stateTimer <= 0) {
      throwEnemyBomb(enemy);
      enemy.behavior = 'hover';
      enemy.attackCooldown = 4.8;
    }
    return;
  }

  if (enemy.behavior === 'shoot-windup') {
    if (enemy.stateTimer <= 0) {
      fireEnemyProjectile(enemy);
      enemy.behavior = 'hover';
      enemy.spitFlash = 0.18;
      enemy.attackCooldown = 2.4;
    }
    return;
  }

  if (enemy.archetype === 'stalker') {
    if (enemy.behavior === 'stalker-windup') {
      if (enemy.stateTimer <= 0) {
        enemy.behavior = 'stalker-lunge';
        enemy.stateTimer = 0.38;
      }
    } else if (enemy.behavior === 'stalker-lunge') {
      moveEnemy(enemy, enemy.leapX * enemy.speed * 3.2, enemy.leapY * enemy.speed * 3.2, dt);
      if (enemy.stateTimer <= 0) enemy.behavior = 'hover';
    } else {
      const moveToward = distance > 145 ? 1 : distance < 100 ? -1 : 0;
      const tangentX = -directionY * enemy.strafeDirection;
      const tangentY = directionX * enemy.strafeDirection;
      moveEnemy(enemy,
        directionX * enemy.speed * moveToward + tangentX * enemy.speed * 0.3,
        directionY * enemy.speed * moveToward + tangentY * enemy.speed * 0.3,
        dt);
      if (visible && distance < 230 && enemy.attackCooldown <= 0) {
        playEnemyAttackSound(enemy, 0.1);
        enemy.behavior = 'stalker-windup';
        enemy.stateTimer = 0.55;
        enemy.attackCooldown = 3;
        enemy.leapX = directionX;
        enemy.leapY = directionY;
      }
    }
    return;
  }

  if (enemy.archetype === 'leaper') {
    if (enemy.behavior === 'leap-windup') {
      if (enemy.stateTimer <= 0) {
        enemy.behavior = 'leap';
        enemy.stateTimer = enemy.leapDuration;
      }
    } else if (enemy.behavior === 'leap') {
      moveEnemy(enemy, enemy.leapX * enemy.speed * enemy.leapMultiplier,
        enemy.leapY * enemy.speed * enemy.leapMultiplier, dt);
      if (enemy.stateTimer <= 0) enemy.behavior = 'crawl';
    } else if (visible && distance < 300) {
      moveEnemy(enemy, directionX * enemy.speed, directionY * enemy.speed, dt);
      if (distance < 260 && enemy.attackCooldown <= 0) {
        playEnemyAttackSound(enemy, 0.1);
        enemy.behavior = 'leap-windup';
        enemy.stateTimer = enemy.leapWindup;
        enemy.attackCooldown = enemy.leapCooldown;
        enemy.leapX = directionX;
        enemy.leapY = directionY;
        addParticles(enemy.x, enemy.y, enemy.color, 5, 45);
      }
    } else {
      enemy.wanderAngle += (Math.random() - 0.5) * dt * 2;
      moveEnemy(enemy, Math.cos(enemy.wanderAngle) * enemy.speed * 0.35,
        Math.sin(enemy.wanderAngle) * enemy.speed * 0.35, dt);
    }
    return;
  }

  if (enemy.archetype === 'charger') {
    if (enemy.behavior === 'windup') {
      if (enemy.stateTimer <= 0) {
        enemy.behavior = 'roll';
        enemy.stateTimer = enemy.kind === 'mouboo' ? 0.72 : 0.55;
        enemy.leapX = directionX;
        enemy.leapY = directionY;
      }
    } else if (enemy.behavior === 'roll') {
      moveEnemy(enemy, enemy.leapX * 265, enemy.leapY * 265, dt);
      if (enemy.stateTimer <= 0) {
        enemy.behavior = 'patrol';
        enemy.attackCooldown = 1.8;
      }
    } else {
      enemy.wanderAngle += (Math.random() - 0.5) * dt * 1.5;
      moveEnemy(enemy, Math.cos(enemy.wanderAngle) * enemy.speed,
        Math.sin(enemy.wanderAngle) * enemy.speed, dt);
      if (visible && distance < 360 && enemy.attackCooldown <= 0) {
        playEnemyAttackSound(enemy, 0.1);
        enemy.behavior = 'windup';
        enemy.stateTimer = enemy.kind === 'mouboo' ? 0.9 : 0.65;
        enemy.attackCooldown = enemy.kind === 'mouboo' ? 3.8 : 2.8;
      }
      enemy.spawnCooldown -= dt;
      if (enemy.kind === 'croc' && enemy.spawnCooldown <= 0 && breakables.length < 8) {
        const offset = Math.random() * Math.PI * 2;
        const x = clamp(enemy.x + Math.cos(offset) * 54, 80, ROOM_W - 80);
        const y = clamp(enemy.y + Math.sin(offset) * 54, 80, ROOM_H - 80);
        const obstaclePool = obstacleSpritesByFloor[currentFloor] || obstacleSpritesByFloor[3];
        const sprite = obstaclePool[Math.floor(Math.random() * obstaclePool.length)];
        if (distanceBetween(player, { x, y }) > player.radius + 50) {
          breakables.push(createBreakableAt(x, y, sprite));
        }
        enemy.spawnCooldown = 7 + Math.random() * 4;
      }
    }
    return;
  }

  if (enemy.archetype === 'diver') {
    if (enemy.behavior === 'dive') {
      moveEnemy(enemy, enemy.leapX * enemy.speed * 2.5, enemy.leapY * enemy.speed * 2.5, dt);
      if (enemy.stateTimer <= 0) {
        enemy.behavior = 'recover';
        enemy.stateTimer = 0.45;
        enemy.attackCooldown = 1.7;
      }
    } else if (enemy.behavior === 'recover') {
      if (enemy.stateTimer <= 0) enemy.behavior = 'hover';
      else moveEnemy(enemy, -directionX * enemy.speed * 0.4, -directionY * enemy.speed * 0.4, dt);
    } else if (visible && enemy.attackCooldown <= 0) {
      playEnemyAttackSound(enemy, 0.1);
      enemy.leapX = directionX;
      enemy.leapY = directionY;
      enemy.behavior = 'dive';
      enemy.stateTimer = 0.5;
    } else {
      enemy.wanderAngle += (Math.random() - 0.5) * dt * 1.8;
      moveEnemy(enemy, Math.cos(enemy.wanderAngle) * enemy.speed * 0.55,
        Math.sin(enemy.wanderAngle) * enemy.speed * 0.55, dt);
    }
    return;
  }

  const tangentX = -directionY * enemy.strafeDirection;
  const tangentY = directionX * enemy.strafeDirection;
  let moveX = tangentX * enemy.speed * 0.7;
  let moveY = tangentY * enemy.speed * 0.7;
  if (distance > 255) {
    moveX += directionX * enemy.speed * 0.65;
    moveY += directionY * enemy.speed * 0.65;
  } else if (distance < 155) {
    moveX -= directionX * enemy.speed;
    moveY -= directionY * enemy.speed;
  }
  moveEnemy(enemy, moveX, moveY + Math.sin(elapsed * 5 + enemy.x) * 12, dt);
  if (visible && enemy.attackCooldown <= 0) {
    if (enemy.bombTosser && distance > 120 && distance < 360) {
      enemy.behavior = 'bomb-windup';
      enemy.stateTimer = enemy.bombWindup;
      enemy.attackCooldown = 4.8;
      enemy.bombTarget = {
        x: clamp(player.x + (Math.random() - 0.5) * 48, ROOM_WALL_THICKNESS + 18, ROOM_W - ROOM_WALL_THICKNESS - 18),
        y: clamp(player.y + (Math.random() - 0.5) * 48, ROOM_WALL_THICKNESS + 18, ROOM_H - ROOM_WALL_THICKNESS - 18),
      };
    } else {
      enemy.behavior = 'shoot-windup';
      enemy.stateTimer = 0.38;
      enemy.attackCooldown = 2.4;
      if (Math.random() < 0.35) enemy.strafeDirection *= -1;
    }
  }
}

function updateCompanions(dt) {
  companions.forEach((companion, index) => {
    if (companion.hp <= 0) {
      companion.respawnTimer -= dt;
      if (companion.respawnTimer <= 0) {
        companion.hp = companion.maxHp;
        companion.hitCooldown = 0;
        companion.enemyCooldowns.clear();
        showMessage(`${companion.kind} familiar has returned.`, 1.5);
      }
      companion.hp = Math.min(companion.maxHp, companion.hp);
      return;
    }
    companion.hitCooldown = Math.max(0, companion.hitCooldown - dt);
    for (const [enemy, cooldown] of companion.enemyCooldowns) {
      const nextCooldown = cooldown - dt;
      if (nextCooldown <= 0 || !enemies.includes(enemy)) companion.enemyCooldowns.delete(enemy);
      else companion.enemyCooldowns.set(enemy, nextCooldown);
    }
    const orbit = elapsed * 0.9 + companion.followAngle + index * (Math.PI * 2 / Math.max(1, companions.length));
    const targetX = player.x + Math.cos(orbit) * 52;
    const targetY = player.y + Math.sin(orbit) * 42;
    companion.x += (targetX - companion.x) * Math.min(1, dt * 5);
    companion.y += (targetY - companion.y) * Math.min(1, dt * 5);
    for (const enemy of [...enemies]) {
      if (distanceBetween(companion, enemy) < enemy.radius + 13 && !companion.enemyCooldowns.has(enemy)) {
        companion.enemyCooldowns.set(enemy, 0.65);
        damageEnemy(enemy, 2, companion.x, companion.y);
        addParticles(enemy.x, enemy.y, '#bde8a0', 7, 90);
      }
    }
    companion.attackCooldown -= dt;
    if (companion.attackCooldown > 0) return;
    const target = enemies
      .filter((enemy) => distanceBetween(companion, enemy) < 420 && hasLineOfSight(companion, enemy))
      .sort((first, second) => distanceBetween(companion, first) - distanceBetween(companion, second))[0];
    if (!target) return;
    const angle = Math.atan2(target.y - companion.y, target.x - companion.x);
    const speed = 400;
    const colors = { ratto: '#f0c884', croc: '#9ce28f', wisp: '#c8a6ff' };
    projectiles.push({
      x: companion.x,
      y: companion.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 5,
      size: 0.8,
      color: colors[companion.kind] || companion.color || '#9ce28f',
      damage: 1,
      ttl: 1.2,
      trailTimer: 0,
      owner: 'companion',
    });
    addParticles(companion.x, companion.y, colors[companion.kind], 2, 25);
    companion.attackCooldown = 1.25;
  });
}

function resolveDoorCrossing() {
  const canExit = (direction) => {
    const verticalDoor = direction === 'up' || direction === 'down';
    const perpendicularPosition = verticalDoor ? player.x : player.y;
    const doorwayAligned = Math.abs(perpendicularPosition -
      (verticalDoor ? ROOM_W : ROOM_H) / 2) <=
      DOORWAY_HALF_WIDTH - player.radius - WALL_COLLISION_PADDING;
    return doorwayAligned && currentRoom.cleared &&
      !currentRoom.lockedDoors[direction] &&
      (currentRoom.links[direction] ||
        (currentRoom.secretExit?.direction === direction && !currentRoom.secretExit.room.hidden));
  };
  if (player.y < 22 && canExit('up')) enterDoor('up');
  else if (player.x > ROOM_W - 22 && canExit('right')) enterDoor('right');
  else if (player.y > ROOM_H - 22 && canExit('down')) enterDoor('down');
  else if (player.x < 22 && canExit('left')) enterDoor('left');

  const sideWallClearance = ROOM_WALL_THICKNESS + PLAYER_VISUAL_HALF_WIDTH + WALL_COLLISION_PADDING;
  const bottomWallClearance = ROOM_WALL_THICKNESS + player.radius + WALL_COLLISION_PADDING;
  const topWallClearance = ROOM_WALL_THICKNESS + player.radius + WALL_COLLISION_PADDING;
  if (player.x < sideWallClearance && !canExit('left')) player.x = sideWallClearance;
  if (player.x > ROOM_W - sideWallClearance && !canExit('right')) player.x = ROOM_W - sideWallClearance;
  if (player.y < topWallClearance && !canExit('up')) player.y = topWallClearance;
  if (player.y > ROOM_H - bottomWallClearance && !canExit('down')) {
    player.y = ROOM_H - bottomWallClearance;
  }
}

function update(dt) {
  if (hitStopTimer > 0) {
    const stoppedTime = Math.min(dt, hitStopTimer);
    hitStopTimer -= stoppedTime;
    dt -= stoppedTime;
    if (dt <= 0) return;
  }
  elapsed += dt;
  if (cameraShake.remaining > 0) {
    cameraShake.remaining = Math.max(0, cameraShake.remaining - dt);
    cameraShake.phase += dt;
  }
  if (mode === 'playing') {
    save.playtimeSeconds += dt;
    unlockPlaytimeItems();
    profileSaveTimer += dt;
    if (profileSaveTimer >= 10) {
      profileSaveTimer = 0;
      persistSave();
    }
    frostNovaCooldown = Math.max(0, frostNovaCooldown - dt);
    killStreakTimer = Math.max(0, killStreakTimer - dt);
    if (killStreakTimer === 0) killStreak = 0;
    streakCallout.timer = Math.max(0, streakCallout.timer - dt);
    autosaveTimer += dt;
    if (autosaveTimer >= 2) {
      autosaveTimer = 0;
      saveRunState();
    }
  }
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0 && mode === 'playing') {
      messageEl.textContent = currentRoom.cleared ? 'Room clear. Move to a doorway to continue.' : 'Clear the room to open its doors.';
    }
  }
  if (mode !== 'playing' || showMap || showStoryJournal) return;
  updateBreakables(dt);
  player.groundSlowTimer = Math.max(0, player.groundSlowTimer - dt);
  updateGroundHazards(dt);
  for (let index = lightningArcs.length - 1; index >= 0; index -= 1) {
    lightningArcs[index].ttl -= dt;
    if (lightningArcs[index].ttl <= 0) lightningArcs.splice(index, 1);
  }

  const keyboardMoveX = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
  const keyboardMoveY = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
  const moveX = clamp(keyboardMoveX + gamepadInput.moveX, -1, 1);
  const moveY = clamp(keyboardMoveY + gamepadInput.moveY, -1, 1);
  const keyboardLength = Math.hypot(keyboardMoveX, keyboardMoveY);
  if (keyboardLength > 0 && !gamepadInput.dpadFacing && !gamepadInput.aimActive &&
      !pointer.down && !keys[' '] && !gamepadInput.shoot) {
    player.lookX = keyboardMoveX / keyboardLength;
    player.lookY = keyboardMoveY / keyboardLength;
  }
  const length = Math.hypot(moveX, moveY) || 1;
  const groundSpeed = player.speed * (player.groundSlowTimer > 0 ? 0.55 : 1);
  player.moving = moveX !== 0 || moveY !== 0;
  player.x += (moveX / length) * groundSpeed * dt;
  player.y += (moveY / length) * groundSpeed * dt;
  if (player.windPush?.timer > 0) {
    player.windPush.timer -= dt;
    player.x += player.windPush.vx * dt;
    player.y += player.windPush.vy * dt;
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
        damagePlayer(2);
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
  resolveDoorCrossing();
  updateWalkInInteractions(dt);

  if (pointer.down || keys[' '] || gamepadInput.shoot) shoot();
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.damageFlashTimer = Math.max(0, player.damageFlashTimer - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.attackPulse = Math.max(0, player.attackPulse - dt);
  player.attackAnimationTimer = Math.max(0, player.attackAnimationTimer - dt);
  player.meleeSwings = player.meleeSwings.filter((swing) => {
    swing.timer -= dt;
    return swing.timer > 0;
  });

  for (const enemy of enemies) {
    updateEnemy(enemy, dt);
    if (distanceBetween(player, enemy) < enemy.radius + player.radius + 2) {
      if (player.invuln <= 0 && enemy.behavior === 'roll') triggerCameraShake('charge');
      damagePlayer();
    }
  }
  updateCompanions(dt);

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
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.ttl -= dt;
    projectile.trailTimer -= dt;
    if (projectile.trailTimer <= 0) {
      particles.push({
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
    const rockIndex = breakables.findIndex((rock) => !rock.broken &&
      !(projectile.piercesWalls && rock.type === 'solid') &&
      distanceBetween(projectile, rock) < projectile.radius + rock.radius);
    const enemy = enemies.find((candidate) => distanceBetween(projectile, candidate) < projectile.radius + candidate.radius);
    if (rockIndex >= 0) {
      damageObstacle(breakables[rockIndex], 1, 'projectile');
      applyMorphLanding(projectile, null);
      projectiles.splice(i, 1);
    } else if (enemy) {
      if (projectile.element) resolveElementalImpact(projectile, enemy);
      else damageEnemy(enemy, projectile.damage,
        projectile.x - projectile.vx * 0.02, projectile.y - projectile.vy * 0.02);
      if (projectile.type === 'spore-shard') {
        enemy.slowTimer = Math.max(enemy.slowTimer || 0, 0.75);
      }
      if (projectile.slowOnHit) enemy.slowTimer = Math.max(enemy.slowTimer || 0, projectile.slowOnHit);
      applyMorphLanding(projectile, enemy);
      addParticles(projectile.x, projectile.y, projectile.color, 6, 100);
      projectiles.splice(i, 1);
    } else if (projectile.ttl <= 0 || projectile.x < 0 || projectile.x > ROOM_W || projectile.y < 0 || projectile.y > ROOM_H) {
      applyMorphLanding(projectile, null);
      projectiles.splice(i, 1);
    }
  }

  for (let i = enemyProjectiles.length - 1; i >= 0; i -= 1) {
    const projectile = enemyProjectiles[i];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.ttl -= dt;
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
      damagePlayer();
    } else if (projectileExpired) {
      enemyProjectiles.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.96;
    particle.vy *= 0.96;
    particle.ttl -= dt;
    if (particle.ttl <= 0) particles.splice(i, 1);
  }

  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pickup = pickups[i];
    if (distanceBetween(player, pickup) > player.radius + 14) continue;
    if (pickup.kind === 'coin') coins += 1;
    if (pickup.kind === 'heart') player.hp = Math.min(player.maxHp, player.hp + 1);
    if (pickup.kind === 'key') keysHeld += 1;
    if (pickup.kind === 'bomb') bombsHeld += 1;
    if (pickup.guaranteedTreasure && pickup.room) pickup.room.treasureClaimed = true;
    if (pickup.kind === 'upgrade') {
      pickup.room.rewardClaimed = true;
      grantUpgrade(pickup.item);
    }
    pickups.splice(i, 1);
    updateHud();
  }

  for (let i = bombs.length - 1; i >= 0; i -= 1) {
    const bomb = bombs[i];
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
      bomb.fuse -= dt;
    }
    if ((bomb.flightTimer === undefined || bomb.flightTimer <= 0) && bomb.fuse <= 0) {
      explodeBomb(bomb);
      bombs.splice(i, 1);
    }
  }

  if (enemies.length === 0 && !currentRoom.cleared && currentRoom.type !== 'start' && currentRoom.type !== 'shop') {
    currentRoom.cleared = true;
    if (['miniboss', 'shrine'].includes(currentRoom.type) && currentRoom.rewardUpgrade && !currentRoom.rewardClaimed) {
      pickups.push({
        x: ROOM_W / 2,
        y: ROOM_H / 2,
        kind: 'upgrade',
        item: currentRoom.rewardUpgrade,
        room: currentRoom,
      });
    }
    if (currentRoom.type === 'boss') {
      showMessage('The guardian is defeated. The seal opens; the descent continues.', 5);
    } else {
      showMessage('Room clear. Doors unlocked.', 2.5);
    }
  }
  updateHud();
}

function drawRoomFloor() {
  const theme = currentFloorTheme();
  if (currentRoom.type === 'secret' && sacredRoomTiles.complete && sacredRoomTiles.naturalWidth > 0) {
    ctx.fillStyle = '#16131b';
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    for (let y = 64; y < ROOM_H - 64; y += 32) {
      for (let x = 64; x < ROOM_W - 64; x += 32) {
        const variation = (Math.floor(x / 32) + Math.floor(y / 32) * 3) % sacredRoomFloorTileIds.length;
        const tileId = sacredRoomFloorTileIds[variation];
        const sourceX = (tileId % 16) * 32;
        const sourceY = Math.floor(tileId / 16) * 32;
        ctx.drawImage(sacredRoomTiles, sourceX, sourceY, 32, 32, x, y, 32, 32);
      }
    }
    ctx.fillStyle = 'rgba(22, 18, 25, 0.74)';
    ctx.fillRect(64, 64, ROOM_W - 128, 32);
    ctx.fillStyle = '#ead8ac';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SACRED HIDDEN SANCTUM', ROOM_W / 2, 61);
  } else {
    const terrain = terrainTiles[currentRegionId()] || terrainTiles.tulimshar;
    const image = terrain.image;
    if (image.complete && image.naturalWidth >= 32 && image.naturalHeight >= 32) {
      const regionId = currentRegionId();
      const terrainKey = `${regionId}:${ROOM_W}x${ROOM_H}`;
      let terrainBackground = terrainBackgroundCache.get(terrainKey);
      if (!terrainBackground) {
        terrainBackground = document.createElement('canvas');
        terrainBackground.width = ROOM_W;
        terrainBackground.height = ROOM_H;
        const terrainContext = terrainBackground.getContext('2d');
        terrainContext.fillStyle = theme.wall;
        terrainContext.fillRect(0, 0, ROOM_W, ROOM_H);
        terrainContext.save();
        if (regionId === 'artis' || regionId === 'graveyard' || regionId === 'fortress') {
          terrainContext.filter = 'hue-rotate(205deg) saturate(0.75) brightness(0.72)';
        }
        const tileColumns = Math.floor(image.naturalWidth / 32);
        for (let row = 2; row * 32 < ROOM_H - 64; row += 1) {
          for (let column = 2; column * 32 < ROOM_W - 64; column += 1) {
            const tileId = terrain.tileIds[(column * 7 + row * 13) % terrain.tileIds.length];
            const sourceX = (tileId % tileColumns) * 32;
            const sourceY = Math.floor(tileId / tileColumns) * 32;
            terrainContext.drawImage(image, sourceX, sourceY, 32, 32, column * 32, row * 32, 32, 32);
          }
        }
        terrainContext.restore();
        terrainBackgroundCache.set(terrainKey, terrainBackground);
      }
      ctx.drawImage(terrainBackground, 0, 0);
      if (castleWallTiles.complete && castleWallTiles.naturalWidth >= 512 && castleWallTiles.naturalHeight >= 32) {
        const drawWallTile = (tileIndex, x, y) => {
          const tileId = castleWallTileIds[tileIndex % castleWallTileIds.length];
          ctx.drawImage(
            castleWallTiles,
            (tileId % 16) * 32,
            Math.floor(tileId / 16) * 32,
            32,
            32,
            x,
            y,
            32,
            32,
          );
        };
        const hasOpenDoor = (direction) =>
          currentRoom.cleared && (currentRoom.links[direction] ||
            (currentRoom.secretExit?.direction === direction && !currentRoom.secretExit.room.hidden));
        for (let x = 0; x < ROOM_W; x += 32) {
          const tileIndex = Math.floor(x / 32);
          const atVerticalDoor = x < ROOM_W / 2 + 48 && x + 32 > ROOM_W / 2 - 48;
          if (!(atVerticalDoor && hasOpenDoor('up'))) {
            drawWallTile(tileIndex, x, 0);
            drawWallTile(tileIndex + 1, x, 32);
          }
          if (!(atVerticalDoor && hasOpenDoor('down'))) {
            drawWallTile(tileIndex + 1, x, ROOM_H - 64);
            drawWallTile(tileIndex + 2, x, ROOM_H - 32);
          }
        }
        for (let y = 32; y < ROOM_H - 32; y += 32) {
          const tileIndex = Math.floor(y / 32);
          const atHorizontalDoor = y < ROOM_H / 2 + 48 && y + 32 > ROOM_H / 2 - 48;
          if (!(atHorizontalDoor && hasOpenDoor('left'))) {
            drawWallTile(tileIndex, 0, y);
            drawWallTile(tileIndex + 1, 32, y);
          }
          if (!(atHorizontalDoor && hasOpenDoor('right'))) {
            drawWallTile(tileIndex + 1, ROOM_W - 64, y);
            drawWallTile(tileIndex + 2, ROOM_W - 32, y);
          }
        }
      }
    } else {
      ctx.fillStyle = theme.wall;
      ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    }
  }

  ctx.strokeStyle = `${theme.trim}66`;
  ctx.lineWidth = 3;
  ctx.strokeRect(63, 63, ROOM_W - 126, ROOM_H - 126);

  for (const direction of directions) {
    const secretDoor = currentRoom.secretExit?.direction === direction.name &&
      !currentRoom.secretExit.room.hidden;
    const hasDoor = (currentRoom.links[direction.name] || secretDoor) && currentRoom.cleared;
    if (!hasDoor) continue;
    const locked = currentRoom.lockedDoors[direction.name] === true;
    ctx.fillStyle = locked ? '#a77d42' : '#5f7652';
    if (direction.name === 'up' || direction.name === 'down') {
      ctx.fillRect(ROOM_W / 2 - 42, direction.name === 'up' ? 40 : ROOM_H - 64, 84, 24);
      ctx.fillStyle = locked ? '#fff0bd' : '#dce8c8';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(locked ? (keysHeld > 0 ? 'KEY' : 'LOCKED') : 'OPEN', ROOM_W / 2, direction.name === 'up' ? 56 : ROOM_H - 48);
    } else {
      ctx.fillRect(direction.name === 'left' ? 40 : ROOM_W - 64, ROOM_H / 2 - 42, 24, 84);
      ctx.save();
      ctx.translate(direction.name === 'left' ? 52 : ROOM_W - 52, ROOM_H / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = locked ? '#fff0bd' : '#dce8c8';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(locked ? (keysHeld > 0 ? 'KEY' : 'LOCKED') : 'OPEN', 0, 4);
      ctx.restore();
    }
  }

  if (currentRoom.secretExit?.room.hidden) {
    const direction = currentRoom.secretExit.direction;
    ctx.strokeStyle = '#b78f69';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (direction === 'up' || direction === 'down') {
      const y = direction === 'up' ? 38 : ROOM_H - 38;
      ctx.moveTo(ROOM_W / 2 - 26, y - 8);
      ctx.lineTo(ROOM_W / 2 + 26, y + 8);
      ctx.moveTo(ROOM_W / 2 + 18, y - 8);
      ctx.lineTo(ROOM_W / 2 - 18, y + 8);
    } else {
      const x = direction === 'left' ? 38 : ROOM_W - 38;
      ctx.moveTo(x - 8, ROOM_H / 2 - 24);
      ctx.lineTo(x + 8, ROOM_H / 2 + 24);
      ctx.moveTo(x - 8, ROOM_H / 2 + 18);
      ctx.lineTo(x + 8, ROOM_H / 2 - 18);
    }
    ctx.stroke();
  }
}

function drawEnemy(enemy) {
  if (enemy.linkId) {
    const twin = enemies.find((candidate) => candidate !== enemy && candidate.linkId === enemy.linkId);
    if (twin && enemies.indexOf(enemy) < enemies.indexOf(twin)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(160, 205, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(twin.x, twin.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (player.hook) {
    const hooker = enemies.find((candidate) => candidate.kind === player.hook.kind);
    if (hooker === enemy) {
      ctx.save();
      ctx.strokeStyle = '#b79a6c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(player.x, player.y - 20);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (enemy.boss && enemy.kind === 'jacko' &&
    (enemy.behavior === 'jacko-ground-pound-hidden' ||
      enemy.x < 0 || enemy.x > ROOM_W || enemy.y < 0 || enemy.y > ROOM_H)) return;
  if (enemy.linkId) {
    const twin = enemies.find((candidate) => candidate !== enemy && candidate.linkId === enemy.linkId);
    if (twin) {
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = '#f4d474';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(twin.x, twin.y);
      ctx.stroke();
      ctx.restore();
    }
    if (enemy.linkShieldCharges > 0) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = '#b9d5ff';
      ctx.shadowBlur = 8;
      if (linkedShieldImage.complete && linkedShieldImage.naturalWidth > 0) {
        ctx.drawImage(linkedShieldImage, enemy.x - enemy.radius - 9, enemy.y - enemy.radius - 13, 20, 20);
      } else {
        ctx.fillStyle = '#b9d5ff';
        ctx.beginPath();
        ctx.arc(enemy.x - enemy.radius, enemy.y - enemy.radius, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff2c9';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(enemy.linkShieldCharges), enemy.x - enemy.radius + 1, enemy.y - enemy.radius - 1);
      ctx.restore();
    }
  }
  const sprite = monsterSprites[enemy.kind];
  if (!sprite.image.complete || sprite.image.naturalWidth === 0) {
    ctx.fillStyle = enemy.freezeTimer > 0 ? '#56cfff'
      : enemy.slowTimer > 0 ? '#7ebee8' : enemy.color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    let frame = 0;
    if (enemy.kind === 'ratto') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
      const direction = [6, 7, 0, 1, 2, 3, 4, 5][directionIndex];
      const frameSets = [[22, 23, 24, 21], [15, 16, 17, 14], [8, 9, 10, 7], [57, 58, 59, 56],
        [50, 51, 52, 49], [43, 44, 45, 42], [36, 37, 38, 35], [29, 30, 31, 28]];
      const set = frameSets[direction];
      frame = set[Math.floor(elapsed * 7) % set.length];
    } else if (enemy.kind === 'croc') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
      const direction = [6, 7, 0, 1, 2, 3, 4, 5][directionIndex];
      const frameSets = [[49, 48, 50, 48], [57, 56, 58, 56], [1, 0, 2, 0], [9, 8, 10, 8],
        [17, 16, 18, 16], [25, 24, 26, 24], [33, 32, 34, 32], [41, 40, 42, 40]];
      const set = frameSets[direction];
      frame = set[Math.floor(elapsed * 5) % set.length];
    } else if (['slime-mother', 'banditlord'].includes(enemy.kind)) {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
        ? Math.cos(angle) < 0 ? 1 : 3
        : Math.sin(angle) < 0 ? 2 : 0;
      const bases = [0, 18, 36, 54];
      const attackBases = enemy.kind === 'banditlord' ? [13, 31, 49, 67] : [9, 27, 45, 63];
      const attackFrameCount = enemy.kind === 'banditlord' ? 5 : 4;
      const moving = Math.hypot(player.x - enemy.x, player.y - enemy.y) > enemy.radius + player.radius + 4;
      const attacking = enemy.behavior !== 'jacko-idle';
      if (attacking) frame = attackBases[direction] + Math.floor(elapsed * 13) % attackFrameCount;
      else if (moving) frame = bases[direction] + 1 + Math.floor(elapsed * 13) % 6;
      else frame = bases[direction];
    } else if (enemy.kind === 'reaper') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
        ? Math.cos(angle) < 0 ? 1 : 3
        : Math.sin(angle) < 0 ? 2 : 0;
      const walkFrames = [[25, 26, 25, 24], [28, 27, 28, 27], [19, 20, 19, 18], [22, 21, 22, 21]];
      const attackFrames = [[0, 1, 2, 3, 4, 5, 4, 3, 2, 1], [17, 16, 15, 16, 17],
        [6, 7, 8, 9, 10, 11, 10, 9, 8, 7], [12, 13, 14, 13, 12]];
      const frames = enemy.behavior !== 'jacko-idle' ? attackFrames[direction] : walkFrames[direction];
      frame = frames[Math.floor(elapsed * (enemy.behavior !== 'jacko-idle' ? 12 : 8)) % frames.length];
    } else if (enemy.kind === 'serqet') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
        ? Math.cos(angle) < 0 ? 1 : 3
        : Math.sin(angle) < 0 ? 0 : 2;
      const standFrames = [[22, 23], [11, 12], [33, 34], [0, 1]];
      const walkFrames = [[24, 25, 26, 27], [13, 14, 15, 16], [35, 36, 37, 38], [2, 3, 4, 5]];
      const attackFrames = [[28, 29], [17, 18], [39, 40], [6, 7]];
      const attacking = enemy.behavior !== 'jacko-idle';
      const frames = attacking ? attackFrames[direction]
        : Math.hypot(player.x - enemy.x, player.y - enemy.y) > enemy.radius + player.radius + 4
          ? walkFrames[direction] : standFrames[direction];
      frame = frames[Math.floor(elapsed * (attacking ? 12 : 8)) % frames.length];
    } else if (enemy.kind === 'yetiking') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
        ? Math.cos(angle) < 0 ? 1 : 3
        : Math.sin(angle) < 0 ? 0 : 2;
      const standFrames = [[3], [10], [31], [20]];
      const walkFrames = [[1, 2, 3, 4], [11, 12, 13, 14], [31, 32, 33, 34], [21, 22, 23, 24]];
      const attackFrames = [[5, 6, 7, 8], [15, 16, 17, 18], [35, 36, 37, 38], [25, 26, 27, 28]];
      const attacking = enemy.behavior !== 'jacko-idle';
      const frames = attacking ? attackFrames[direction]
        : Math.hypot(player.x - enemy.x, player.y - enemy.y) > enemy.radius + player.radius + 4
          ? walkFrames[direction] : standFrames[direction];
      frame = frames[Math.floor(elapsed * (attacking ? 14 : 9)) % frames.length];
    } else if (['forestdragon', 'nightdragon'].includes(enemy.kind)) {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
        ? Math.cos(angle) < 0 ? 3 : 2
        : Math.sin(angle) < 0 ? 1 : 0;
      const base = [0, 8, 16, 24][direction];
      const attacking = enemy.behavior !== 'jacko-idle';
      frame = attacking ? base + 2 + Math.floor(elapsed * 11) % 6
        : base + (Math.floor(elapsed * 2) % 5 === 0 ? 1 : 0);
    } else if (enemy.kind === 'spider-queen') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
      const standFrames = [36, 18, 0, 126, 108, 90, 72, 54];
      const base = standFrames[directionIndex];
      const attacking = enemy.behavior !== 'jacko-idle' && enemy.behavior !== 'jacko-ground-pound-hidden';
      frame = attacking
        ? base + 9 + Math.floor(elapsed * (enemy.phase >= 2 ? 12 : 8)) % 9
        : base + Math.floor(elapsed * 6) % 9;
    } else if (enemy.kind === 'golem' || enemy.kind === 'snowman-boss') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
      const xmlDirection = [2, 1, 0, 7, 6, 5, 4, 3][directionIndex];
      const walkStarts = [12, 24, 36, 48, 60, 72, 84, 96];
      const attacking = enemy.behavior !== 'jacko-idle' && enemy.behavior !== 'jacko-ground-pound-hidden';
      const attackStarts = [108, 120, 132, 144, 156, 168, 180, 192];
      const start = attacking ? attackStarts[xmlDirection] : walkStarts[xmlDirection];
      const frameCount = attacking ? 11 : 12;
      frame = start + Math.floor(elapsed * (enemy.phase >= 2 ? 12 : 7)) % frameCount;
      if (enemy.behavior === 'jacko-idle') frame = xmlDirection;
    } else if (enemy.kind === 'jacko') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const direction = Math.abs(angle) < Math.PI / 4 ? 1
        : angle > Math.PI / 4 && angle < Math.PI * 3 / 4 ? 0
          : Math.abs(angle) > Math.PI * 3 / 4 ? 2 : 3;
      const animationFrame = Math.floor(elapsed * 7) % 3;
      frame = (enemy.behavior === 'jacko-idle' ? 0 : 12) + direction * 3 + animationFrame;
    } else if (enemy.kind === 'spore-sower' && enemy.behavior === 'cluster-windup') {
      frame = 5 + Math.floor(elapsed * 8) % 4;
    } else {
      const frames = sprite.frames || [0, 1, 2, 3];
      frame = frames[Math.floor(elapsed * (enemy.phase >= 2 ? 10 : 6)) % frames.length];
    }
    const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
    const sourceX = (frame % columns) * sprite.frameWidth;
    const sourceY = Math.floor(frame / columns) * sprite.frameHeight;
    const scale = sprite.scale * (enemy.boss && enemy.kind !== 'jacko' ? 1.4 : 1) *
      (enemy.isOffspring ? 0.58 : 1);
    const width = sprite.frameWidth * scale;
    const height = sprite.frameHeight * scale;
    const hop = enemy.linkDash && enemy.linkDash.windup <= 0
      ? Math.sin(Math.min(1, enemy.linkDash.t) * Math.PI) * 38
      : enemy.archetype === 'leaper' && enemy.behavior === 'leap'
      ? Math.sin((enemy.leapDuration - enemy.stateTimer) / enemy.leapDuration * Math.PI) * enemy.leapHeight
      : enemy.kind === 'spider-queen' && enemy.behavior === 'spider-pounce'
        ? Math.sin(((enemy.phase >= 2 ? 0.34 : 0.48) - enemy.stateTimer) /
          (enemy.phase >= 2 ? 0.34 : 0.48) * Math.PI) * (enemy.phase >= 2 ? 72 : 54)
      : enemy.kind === 'jacko' && enemy.behavior === 'jacko-jump'
        ? Math.sin(((enemy.phase >= 2 ? 0.7 : 0.85) - enemy.stateTimer) /
          (enemy.phase >= 2 ? 0.7 : 0.85) * Math.PI) * (enemy.phase >= 2 ? 86 : 56)
        : enemy.kind === 'wisp' ? Math.sin(elapsed * 5 + enemy.x) * 5 : 0;
    ctx.save();
    if (enemy.hitFlash > 0) ctx.globalAlpha = 0.55;
    ctx.translate(enemy.x, enemy.y - hop);
    if (enemy.archetype === 'charger' && enemy.behavior === 'roll' ||
      enemy.linkDash && enemy.linkDash.windup <= 0 && enemy.linkDash.kind === 'roll' ||
      enemy.kind === 'jacko' && enemy.behavior === 'jacko-roll') {
      ctx.rotate(elapsed * 18);
    }
    const frostAffected = enemy.freezeTimer > 0 || enemy.slowTimer > 0;
    if (frostAffected) {
      ctx.filter = 'hue-rotate(155deg) saturate(1.8) brightness(1.2)';
      ctx.shadowColor = '#59d7ff';
      ctx.shadowBlur = enemy.freezeTimer > 0 ? 22 : 14;
    } else if (enemy.kind === 'slime-mother') {
      // The sprite is grayscale, so sepia first to give hue-rotate something to shift.
      ctx.filter = enemy.phase >= 2
        ? 'sepia(1) saturate(7) hue-rotate(-38deg) brightness(1.1)'
        : 'sepia(1) saturate(6) hue-rotate(-38deg)';
    } else if (enemy.kind === 'jacko') {
      ctx.shadowColor = '#ff8e38';
      ctx.shadowBlur = enemy.phase >= 2 ? 30 : 16;
      if (enemy.phase >= 2) ctx.filter = 'saturate(1.5) brightness(1.25)';
    }
    ctx.drawImage(sprite.image, sourceX, sourceY, sprite.frameWidth, sprite.frameHeight,
      -width / 2, -height / 2, width, height);
    if ((enemy.kind === 'bandit' || enemy.kind === 'banditlord') &&
      banditBowImage.complete && banditBowImage.naturalWidth >= 128) {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const direction = Math.abs(angle) < Math.PI / 4 ? 'right'
        : angle > Math.PI / 4 && angle < Math.PI * 3 / 4 ? 'down'
          : Math.abs(angle) > Math.PI * 3 / 4 ? 'left' : 'up';
      const rowStart = { down: 0, left: 18, up: 36, right: 54 }[direction];
      const attacking = enemy.behavior === 'shoot-windup' || enemy.spitFlash > 0;
      const bowFrame = rowStart + (attacking ? 13 + Math.floor(elapsed * 14) % 5
        : 1 + Math.floor(elapsed * 7) % 6);
      const bowColumns = Math.floor(banditBowImage.naturalWidth / 128);
      ctx.drawImage(banditBowImage, (bowFrame % bowColumns) * 128,
        Math.floor(bowFrame / bowColumns) * 128, 128, 128, -32, -16, 64, 64);
    }
    ctx.restore();
  }
  if (enemy.freezeTimer > 0 || enemy.slowTimer > 0) {
    ctx.save();
    ctx.strokeStyle = enemy.freezeTimer > 0 ? 'rgba(104, 221, 255, 0.9)' : 'rgba(104, 221, 255, 0.65)';
    ctx.lineWidth = enemy.freezeTimer > 0 ? 3 : 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 7 + Math.sin(elapsed * 12) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.wetTimer > 0 || enemy.burnTimer > 0) {
    ctx.save();
    if (enemy.wetTimer > 0) {
      ctx.strokeStyle = `rgba(101, 225, 255, ${Math.min(0.9, 0.42 + enemy.wetTimer * 0.12)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 5 + Math.sin(elapsed * 12) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enemy.burnTimer > 0 && Math.floor(elapsed * 14) % 2 === 0) {
      ctx.fillStyle = 'rgba(255, 111, 52, 0.85)';
      ctx.beginPath();
      ctx.moveTo(enemy.x - 5, enemy.y - enemy.radius + 8);
      ctx.lineTo(enemy.x - 2, enemy.y - enemy.radius - 4 - Math.sin(elapsed * 19) * 3);
      ctx.lineTo(enemy.x + 1, enemy.y - enemy.radius + 5);
      ctx.lineTo(enemy.x + 5, enemy.y - enemy.radius - 2 - Math.cos(elapsed * 17) * 3);
      ctx.lineTo(enemy.x + 7, enemy.y - enemy.radius + 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  if (enemy.kind === 'spider-queen' && enemy.behavior === 'spider-pounce-windup' &&
    enemy.spiderPounceTarget) {
    ctx.save();
    ctx.strokeStyle = 'rgba(231, 143, 198, 0.85)';
    ctx.fillStyle = 'rgba(231, 143, 198, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.spiderPounceTarget.x, enemy.spiderPounceTarget.y,
      24 + Math.sin(elapsed * 14) * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(enemy.spiderPounceTarget.x, enemy.spiderPounceTarget.y);
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.kind === 'jacko' && enemy.behavior === 'jacko-ground-pound-windup' && enemy.groundPoundTarget) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 78, 40, 0.22)';
    ctx.strokeStyle = 'rgba(255, 174, 66, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.groundPoundTarget.x, enemy.groundPoundTarget.y,
      38 + (1 - enemy.stateTimer / 0.35) * 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.kind === 'golem' && enemy.behavior === 'golem-slam-windup' && enemy.slamTarget) {
    ctx.save();
    ctx.fillStyle = 'rgba(235, 133, 79, 0.18)';
    ctx.strokeStyle = 'rgba(255, 191, 111, 0.92)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.slamTarget.x, enemy.slamTarget.y,
      (enemy.phase >= 2 ? 112 : 74) * (1 - enemy.stateTimer * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.kind === 'golem' && enemy.behavior === 'golem-charge-windup' && enemy.slamTarget) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#f3c27a';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(enemy.slamTarget.x, enemy.slamTarget.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  if (enemy.behavior === 'signature-windup') {
    const signatureColor = enemy.signature === 'slime-trail' ? '#9de37f'
      : enemy.signature === 'venom-fan' ? '#b6e75c'
        : enemy.signature === 'arrow-barrage' ? '#e9bd79'
          : enemy.signature === 'ice-burst' || enemy.signature === 'yeti-slam' ? '#9fe7f3'
            : '#b79be7';
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = signatureColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = signatureColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 8 + Math.sin(elapsed * 15) * 3, 0, Math.PI * 2);
    ctx.stroke();
    if (enemy.signatureTarget && ['yeti-slam', 'reaper-charge', 'slime-trail'].includes(enemy.signature)) {
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      ctx.arc(enemy.signatureTarget.x, enemy.signatureTarget.y,
        enemy.signature === 'yeti-slam' ? 72 : 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enemy.signatureTarget && ['slime-charge', 'bandit-charge'].includes(enemy.signature)) {
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ROOM_WALL_THICKNESS, enemy.y);
      ctx.lineTo(ROOM_W - ROOM_WALL_THICKNESS, enemy.y);
      ctx.stroke();
    } else if (enemy.signatureTarget && ['reaper-charge', 'snow-charge'].includes(enemy.signature)) {
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(enemy.x, ROOM_WALL_THICKNESS);
      ctx.lineTo(enemy.x, ROOM_H - ROOM_WALL_THICKNESS);
      ctx.stroke();
    } else if (enemy.signatureTarget && ['venom-charge', 'yeti-charge', 'forest-charge', 'void-charge'].includes(enemy.signature)) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(enemy.signatureTarget.x, enemy.signatureTarget.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (enemy.behavior === 'signature-laser-windup' || enemy.behavior === 'signature-laser') {
    const beamLength = Math.max(ROOM_W, ROOM_H);
    const beamX = enemy.x + Math.cos(enemy.laserAngle) * beamLength;
    const beamY = enemy.y + Math.sin(enemy.laserAngle) * beamLength;
    ctx.save();
    ctx.strokeStyle = enemy.behavior === 'signature-laser'
      ? 'rgba(190, 133, 255, 0.92)' : 'rgba(190, 133, 255, 0.38)';
    ctx.lineWidth = enemy.behavior === 'signature-laser' ? 12 : 3;
    ctx.shadowColor = '#b58cff';
    ctx.shadowBlur = enemy.behavior === 'signature-laser' ? 18 : 5;
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(beamX, beamY);
    ctx.stroke();
    if (enemy.behavior === 'signature-laser') {
      ctx.strokeStyle = 'rgba(248, 231, 255, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(beamX, beamY);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (enemy.behavior === 'bomb-windup' && enemy.bombTarget) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 116, 54, 0.16)';
    ctx.strokeStyle = 'rgba(255, 178, 90, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.bombTarget.x, enemy.bombTarget.y, 16 + Math.sin(elapsed * 14) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.behavior === 'windup' || enemy.behavior === 'leap-windup' ||
    enemy.behavior === 'stalker-windup' || enemy.behavior === 'shoot-windup' ||
    enemy.behavior === 'spider-web-windup' || enemy.behavior === 'spider-pounce-windup' ||
    enemy.behavior === 'golem-slam-windup' ||
    enemy.behavior === 'jacko-roll-windup' ||
    enemy.behavior === 'jacko-jump-windup' || enemy.behavior === 'jacko-shot-windup' || enemy.spitFlash > 0) {
    ctx.strokeStyle = enemy.archetype === 'charger' || enemy.kind === 'jacko' || enemy.kind === 'golem'
      ? 'rgba(255, 191, 95, 0.8)' : 'rgba(202, 164, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 6 + Math.sin(elapsed * 18) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (enemy.behavior === 'laser-charge' || enemy.behavior === 'laser') {
    const length = Math.max(ROOM_W, ROOM_H);
    const beamX = enemy.x + Math.cos(enemy.laserAngle) * length;
    const beamY = enemy.y + Math.sin(enemy.laserAngle) * length;
    ctx.save();
    ctx.strokeStyle = enemy.behavior === 'laser' ? 'rgba(255, 75, 120, 0.9)' : 'rgba(255, 120, 150, 0.4)';
    ctx.lineWidth = enemy.behavior === 'laser' ? 14 : 3;
    ctx.shadowColor = '#ff315f';
    ctx.shadowBlur = enemy.behavior === 'laser' ? 20 : 5;
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(beamX, beamY);
    ctx.stroke();
    if (enemy.behavior === 'laser') {
      ctx.strokeStyle = 'rgba(255, 230, 225, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(beamX, beamY);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (enemy.elite) {
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = enemy.eliteMutation === 'swift' ? '#d7c2ff' : '#f1c77d';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (eliteHatImage.complete && eliteHatImage.naturalWidth > 0) {
      ctx.drawImage(eliteHatImage, enemy.x - 14, enemy.y - enemy.radius - 28, 28, 28);
    }
    ctx.restore();
  }
  if (enemy.linkEnraged) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#f4d474';
    ctx.shadowColor = '#f4d474';
    ctx.shadowBlur = 9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#160f13';
  ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 11, enemy.radius * 2, 5);
  ctx.fillStyle = enemy.boss ? '#e376bd' : '#9be08d';
  ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 11,
    (enemy.hp / enemy.maxHp) * enemy.radius * 2, 5);
  if (enemy.boss || enemy.miniBoss) {
    ctx.fillStyle = '#f5debd';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(enemy.boss ? `${enemy.title}${enemy.phase >= 2 ? ' - PHASE II' : ''}` : 'MINI-BOSS',
      enemy.x, enemy.y - enemy.radius - 18);
  }
}

function drawCompanion(companion) {
  if (companion.hp <= 0) return;
  const sprite = monsterSprites[companion.kind];
  if (!sprite.image.complete || sprite.image.naturalWidth === 0) return;
  const scale = Math.min(sprite.scale || 1, 42 / Math.max(sprite.frameWidth, sprite.frameHeight));
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  const frame = companion.kind === 'wisp' ? Math.floor(elapsed * 5) % 5 : 0;
  const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
  const glow = companion.kind === 'wisp' ? '#c8a6ff' : companion.color || '#a8e39c';
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(companion.x, companion.y, Math.max(width, height) * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.drawImage(
    sprite.image,
    (frame % columns) * sprite.frameWidth,
    Math.floor(frame / columns) * sprite.frameHeight,
    sprite.frameWidth,
    sprite.frameHeight,
    companion.x - width / 2,
    companion.y - height / 2,
    width,
    height,
  );
  ctx.restore();
}

function drawPlayer() {
  const sprite = humanoidSprites[character.sprite];
  const direction = Math.abs(player.lookX) > Math.abs(player.lookY)
    ? player.lookX < 0 ? 'left' : 'right'
    : player.lookY < 0 ? 'up' : 'down';
  const directionRow = { down: 0, left: 1, up: 2, right: 3 }[direction];
  let frame = player.moving ? 1 + Math.floor(elapsed * 10) % 6 : 0;
  if (player.attackAnimationTimer > 0) {
    const isBowAttack = player.attackAnimationStyle === 'bow';
    const duration = isBowAttack ? 0.4 : 0.32;
    const progress = clamp(1 - player.attackAnimationTimer / duration, 0, 0.999);
    frame = isBowAttack ? 11 + Math.floor(progress * 5) : 7 + Math.floor(progress * 4);
  }
  const bodyFrameIndex = directionRow * sprite.framesPerDirection + frame;
  ctx.fillStyle = 'rgba(20, 24, 27, 0.32)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 8, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (player.damageFlashTimer > 0) {
    ctx.filter = 'sepia(0.8) saturate(3.5) hue-rotate(305deg)';
    ctx.shadowColor = '#ff4058';
    ctx.shadowBlur = 18;
  }
  if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.4;
  const pulse = player.attackPulse / 0.14;
  ctx.translate(player.x, player.y);
  ctx.scale(1 + pulse * 0.08, 1 - pulse * 0.045);
  drawHumanoid(sprite.image, bodyFrameIndex, 0, 0, 1.45, character.hue);
  for (const slot of ['legs', 'chest']) {
    const clothing = equippedClothing[slot];
    if (clothing) drawClothing(clothing, bodyFrameIndex, 0, 0, 1.45);
  }
  const visibleWeapon = meleeWeapons.has('sword') ? 'ironSword'
    : meleeWeapons.has('daggers') ? 'daggers' : null;
  if (visibleWeapon) drawClothing({ sprite: visibleWeapon }, bodyFrameIndex, 0, 0, 1.45);
  if (player.attackAnimationTimer > 0 && player.attackAnimationStyle === 'bow' &&
      banditBowImage.complete && banditBowImage.naturalWidth >= 128) {
    const rowStart = { down: 0, left: 18, up: 36, right: 54 }[direction];
    const bowFrame = player.attackAnimationTimer > 0 && player.attackAnimationStyle === 'bow'
      ? rowStart + 13 + Math.min(4, Math.floor((1 - player.attackAnimationTimer / 0.4) * 5))
      : rowStart + 1 + Math.floor(elapsed * 7) % 6;
    const bowColumns = Math.floor(banditBowImage.naturalWidth / 128);
    ctx.drawImage(banditBowImage, (bowFrame % bowColumns) * 128,
      Math.floor(bowFrame / bowColumns) * 128, 128, 128, -60, -96, 120, 120);
  }
  drawHead(character.hairStyle, direction, 0, 0, 1.45);
  ctx.restore();
}

function drawClothing(clothing, frameIndex, x, y, scale) {
  const sprite = clothingSprites[clothing.sprite];
  const isFemale = ['female', 'elfFemale', 'raijin'].includes(character.sprite);
  const image = isFemale && sprite.femaleImage ? sprite.femaleImage : sprite.image;
  if (!image.complete || image.naturalWidth === 0) return;
  const columns = Math.floor(image.naturalWidth / sprite.frameWidth);
  const sourceX = (frameIndex % columns) * sprite.frameWidth;
  const sourceY = Math.floor(frameIndex / columns) * sprite.frameHeight;
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sprite.frameWidth,
    sprite.frameHeight,
    x - width / 2,
    y - height + 6,
    width,
    height,
  );
}

function correctSkinTone(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    if (pixels.data[index + 3] === 0 || Math.max(red, green, blue) - Math.min(red, green, blue) > 30) continue;
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    pixels.data[index] = Math.min(255, luminance * 1.16);
    pixels.data[index + 1] = Math.min(255, luminance * 0.96);
    pixels.data[index + 2] = Math.min(255, luminance * 0.78);
  }
  context.putImageData(pixels, 0, 0);
}

function getCorrectedHumanoidFrame(sheet, frameIndex, hue) {
  let frames = correctedHumanoidFrames.get(sheet);
  if (!frames) {
    frames = new Map();
    correctedHumanoidFrames.set(sheet, frames);
  }
  const key = `${frameIndex}:${hue}`;
  if (frames.has(key)) return frames.get(key);

  const frameSize = 64;
  const columns = Math.floor(sheet.naturalWidth / frameSize);
  const corrected = document.createElement('canvas');
  corrected.width = frameSize;
  corrected.height = frameSize;
  const correctedContext = corrected.getContext('2d', { willReadFrequently: true });
  correctedContext.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
  correctedContext.drawImage(
    sheet,
    (frameIndex % columns) * frameSize,
    Math.floor(frameIndex / columns) * frameSize,
    frameSize,
    frameSize,
    0,
    0,
    frameSize,
    frameSize,
  );
  correctSkinTone(correctedContext, frameSize, frameSize);
  frames.set(key, corrected);
  return corrected;
}

function getCorrectedHeadFrame(image, sourceX, sourceY, width, height) {
  let frames = correctedHeadFrames.get(image);
  if (!frames) {
    frames = new Map();
    correctedHeadFrames.set(image, frames);
  }
  const key = `${sourceX}:${sourceY}:${width}:${height}`;
  if (frames.has(key)) return frames.get(key);

  const corrected = document.createElement('canvas');
  corrected.width = width;
  corrected.height = height;
  const correctedContext = corrected.getContext('2d', { willReadFrequently: true });
  correctedContext.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height);
  correctSkinTone(correctedContext, width, height);
  frames.set(key, corrected);
  return corrected;
}

function isPixelReadbackSecurityError(error) {
  if (error instanceof DOMException && error.name === 'SecurityError') {
    if (!pixelCorrectionWarningShown) {
      console.warn('Sprite color correction is unavailable for local file images in this browser; drawing original TMW sprites.', error);
      pixelCorrectionWarningShown = true;
    }
    return true;
  }
  throw error;
}

function drawHumanoid(sheet, frameIndex, x, y, scale = 1, hue = 0) {
  if (!sheet.complete || sheet.naturalWidth === 0) {
    ctx.fillStyle = '#75d8ff';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const frameSize = 64;
  const size = frameSize * scale;
  try {
    const correctedFrame = getCorrectedHumanoidFrame(sheet, frameIndex, hue);
    ctx.drawImage(correctedFrame, x - size / 2, y - size + 6, size, size);
  } catch (error) {
    if (!isPixelReadbackSecurityError(error)) return;
    const columns = Math.floor(sheet.naturalWidth / frameSize);
    ctx.save();
    ctx.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
    ctx.drawImage(
      sheet,
      (frameIndex % columns) * frameSize,
      Math.floor(frameIndex / columns) * frameSize,
      frameSize,
      frameSize,
      x - size / 2,
      y - size + 6,
      size,
      size,
    );
    ctx.restore();
  }
}

function drawHead(style, direction, x, y, scale = 1) {
  const head = headSprites[style] || headSprites.wanderer;
  if (!head.image.complete || head.image.naturalWidth === 0) return;
  const directionFrame = { down: 0, left: 1, up: 2, right: 3 }[direction];
  const width = head.frameWidth * scale;
  const height = head.frameHeight * scale;
  const sourceX = directionFrame * head.frameWidth;
  const destinationX = x - width / 2;
  const directionOffsetY = direction === 'up' ? 4 * scale : 0;
  const destinationY = y - 84 * scale + 12 + directionOffsetY;
  try {
    const correctedFrame = getCorrectedHeadFrame(
      head.image,
      sourceX,
      0,
      head.frameWidth,
      head.frameHeight,
    );
    ctx.drawImage(
      correctedFrame,
      destinationX,
      destinationY,
      width,
      height,
    );
  } catch (error) {
    if (!isPixelReadbackSecurityError(error)) return;
    ctx.drawImage(
      head.image,
      sourceX,
      0,
      head.frameWidth,
      head.frameHeight,
      destinationX,
      destinationY,
      width,
      height,
    );
  }
}

function drawFallbackBreakable(rock, width, height) {
  ctx.save();
  if (rock.type === 'solid') {
    ctx.fillStyle = '#76563d';
    ctx.fillRect(rock.x - width * 0.42, rock.y - height * 0.22, width * 0.84, height * 0.44);
    ctx.strokeStyle = '#c09664';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(rock.x - width * 0.3, rock.y, width * 0.12, height * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (rock.type === 'bomb-only') {
    ctx.fillStyle = '#9c5548';
    ctx.beginPath();
    ctx.arc(rock.x, rock.y, Math.min(width, height) * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e4b980';
    ctx.beginPath();
    ctx.arc(rock.x - 4, rock.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#a6d978';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rock.x, rock.y + height * 0.3);
    ctx.lineTo(rock.x, rock.y - height * 0.18);
    ctx.stroke();
    ctx.fillStyle = '#6db46a';
    ctx.beginPath();
    ctx.ellipse(rock.x - 7, rock.y - height * 0.12, 8, 4, -0.5, 0, Math.PI * 2);
    ctx.ellipse(rock.x + 7, rock.y - height * 0.24, 8, 4, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function soulMenhirPosition() {
  return { x: ROOM_W / 2, y: ROOM_H / 2 - 104 };
}

function drawSoulMenhir() {
  const position = soulMenhirPosition();
  if (soulMenhirImage.complete && soulMenhirImage.naturalWidth >= 64) {
    ctx.drawImage(soulMenhirImage, 0, 0, 64, 64, position.x - 38, position.y - 76, 76, 76);
  } else {
    ctx.fillStyle = '#9c9b9b';
    ctx.beginPath();
    ctx.moveTo(position.x - 23, position.y + 3);
    ctx.lineTo(position.x - 18, position.y - 40);
    ctx.lineTo(position.x, position.y - 58);
    ctx.lineTo(position.x + 19, position.y - 37);
    ctx.lineTo(position.x + 24, position.y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#eee0b8';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.save();
  ctx.fillStyle = '#26352d';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('SOUL MENHIR  ·  WALK IN TO SAVE', position.x, position.y + 22);
  ctx.restore();
}

function drawShopItemIcon(item, centerX, centerY) {
  const itemImage = shopItemIconImages[item.id];
  if (itemImage?.complete && itemImage.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(itemImage, centerX - 14, centerY - 14, 28, 28);
    ctx.restore();
    return;
  }
  const colors = {
    passive: '#79d3dc', skill: '#c3a7e7', weapon: '#e0bb78', clothing: '#9dce9a',
    ability: '#86dce8', element: magicElementPalette[item.element], companion: '#e7b877', consumable: '#e89676',
  };
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.strokeStyle = colors[item.kind] || '#ded2bc';
  ctx.fillStyle = colors[item.kind] || '#ded2bc';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (item.kind === 'element' && item.element === 'fire') {
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.quadraticCurveTo(2, -5, 8, -3);
    ctx.quadraticCurveTo(14, 7, 0, 12);
    ctx.quadraticCurveTo(-13, 8, -7, -2);
    ctx.quadraticCurveTo(-3, -6, 0, -13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff0c4';
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.quadraticCurveTo(-4, 1, 1, -5);
    ctx.quadraticCurveTo(2, 1, 5, 3);
    ctx.stroke();
  } else if (item.kind === 'element' && item.element === 'lightning') {
    ctx.beginPath();
    ctx.moveTo(3, -13);
    ctx.lineTo(-7, 1);
    ctx.lineTo(0, 1);
    ctx.lineTo(-4, 13);
    ctx.lineTo(8, -4);
    ctx.lineTo(1, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (item.kind === 'element' && item.element === 'gas') {
    ctx.beginPath();
    ctx.arc(-6, 3, 6, 0, Math.PI * 2);
    ctx.arc(2, -1, 8, 0, Math.PI * 2);
    ctx.arc(8, 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (item.id === 'frost-rune') {
    for (let spoke = 0; spoke < 3; spoke += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.moveTo(5, -4);
      ctx.lineTo(10, 0);
      ctx.lineTo(5, 4);
      ctx.moveTo(-5, -4);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-5, 4);
      ctx.stroke();
    }
  } else if (item.kind === 'passive' && item.id === 'prism') {
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(11, 8);
    ctx.lineTo(-11, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 3);
    ctx.lineTo(0, -5);
    ctx.lineTo(5, 3);
    ctx.stroke();
  } else if (item.kind === 'passive' && item.id === 'feather') {
    ctx.beginPath();
    ctx.moveTo(-9, 10);
    ctx.quadraticCurveTo(-12, -8, 10, -11);
    ctx.quadraticCurveTo(8, 8, -9, 10);
    ctx.moveTo(-7, 7);
    ctx.lineTo(7, -7);
    ctx.moveTo(-3, 2);
    ctx.lineTo(-5, -4);
    ctx.moveTo(2, -3);
    ctx.lineTo(7, -3);
    ctx.stroke();
  } else if (item.kind === 'passive') {
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-3, -3, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.kind === 'weapon' || item.kind === 'skill') {
    if (item.style === 'bow' || item.weapon === 'daggers') {
      ctx.beginPath();
      ctx.arc(-5, 0, 10, -Math.PI / 2, Math.PI / 2);
      ctx.moveTo(-5, -10);
      ctx.lineTo(10, 0);
      ctx.lineTo(-5, 10);
      ctx.stroke();
    } else if (item.style === 'magic') {
      ctx.beginPath();
      for (let point = 0; point < 8; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 4;
        const radius = point % 2 ? 4 : 11;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 7);
      ctx.moveTo(-7, 1);
      ctx.lineTo(7, 1);
      ctx.moveTo(-4, 8);
      ctx.lineTo(4, 8);
      ctx.stroke();
    }
  } else if (item.kind === 'clothing') {
    ctx.beginPath();
    ctx.moveTo(-9, -9);
    ctx.lineTo(-4, -12);
    ctx.lineTo(0, -8);
    ctx.lineTo(4, -12);
    ctx.lineTo(9, -9);
    ctx.lineTo(6, -2);
    ctx.lineTo(5, 10);
    ctx.lineTo(-5, 10);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.stroke();
  } else if (item.kind === 'companion') {
    ctx.beginPath();
    ctx.arc(0, 1, 8, 0, Math.PI * 2);
    ctx.moveTo(-6, -5);
    ctx.lineTo(-9, -11);
    ctx.lineTo(-2, -7);
    ctx.moveTo(6, -5);
    ctx.lineTo(9, -11);
    ctx.lineTo(2, -7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-3, 0, 1, 0, Math.PI * 2);
    ctx.arc(3, 0, 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.id === 'bomb-bundle') {
    ctx.beginPath();
    ctx.arc(0, 2, 8, 0, Math.PI * 2);
    ctx.moveTo(3, -6);
    ctx.lineTo(7, -11);
    ctx.lineTo(10, -9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11, -10, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.id === 'mana-tonic') {
    ctx.beginPath();
    ctx.moveTo(-4, -11);
    ctx.lineTo(4, -11);
    ctx.lineTo(4, -7);
    ctx.lineTo(8, -3);
    ctx.lineTo(7, 10);
    ctx.lineTo(-7, 10);
    ctx.lineTo(-8, -3);
    ctx.lineTo(-4, -7);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 3);
    ctx.lineTo(5, 3);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMorphShape(shape, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 2.2;
  if (shape === 'ring') {
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  if (shape === 'diamond') {
    ctx.moveTo(13, 0);
    ctx.lineTo(0, -8);
    ctx.lineTo(-9, 0);
    ctx.lineTo(0, 8);
    ctx.closePath();
  } else {
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(2, -2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawGroundHazards() {
  for (const hazard of groundHazards) {
    const alpha = Math.min(0.68, hazard.ttl / 2.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hazard.color;
    ctx.strokeStyle = hazard.color;
    ctx.lineWidth = 3;
    if (hazard.kind === 'web') {
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
      ctx.stroke();
      for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = spoke * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(hazard.x, hazard.y);
        ctx.lineTo(hazard.x + Math.cos(angle) * hazard.radius,
          hazard.y + Math.sin(angle) * hazard.radius);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(hazard.x, hazard.y, hazard.radius, hazard.radius * 0.58,
        Math.sin(elapsed + hazard.x) * 0.08, 0, Math.PI * 2);
      ctx.fill();
      if (hazard.kind === 'miasma') {
        ctx.strokeStyle = 'rgba(228, 255, 152, 0.9)';
        ctx.lineWidth = 2;
        for (let puff = 0; puff < 3; puff += 1) {
          const angle = elapsed * 1.8 + puff * Math.PI * 2 / 3;
          const x = hazard.x + Math.cos(angle) * hazard.radius * 0.4;
          const y = hazard.y + Math.sin(angle) * hazard.radius * 0.22;
          ctx.beginPath();
          ctx.arc(x, y, 6 + Math.sin(elapsed * 5 + puff) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (hazard.kind === 'lightning') {
        ctx.strokeStyle = hazard.color;
        ctx.lineWidth = hazard.damageCooldown <= 0 ? 5 : 1.5;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(hazard.x, hazard.y - 220);
        ctx.lineTo(hazard.x + 14, hazard.y - 150);
        ctx.lineTo(hazard.x - 12, hazard.y - 80);
        ctx.lineTo(hazard.x + 8, hazard.y);
        ctx.stroke();
      } else if (hazard.kind === 'fire') {
        ctx.fillStyle = '#ffd36a';
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.y - 6 - Math.sin(elapsed * 9 + hazard.x) * 4, hazard.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (hazard.kind === 'acid') {
        ctx.beginPath();
        ctx.arc(hazard.x - 12, hazard.y - 4, 4, 0, Math.PI * 2);
        ctx.arc(hazard.x + 13, hazard.y + 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawWorld() {
  drawRoomFloor();
  drawGroundHazards();
  if (currentRoom.type === 'start') drawSoulMenhir();
  if (currentRoom.type === 'boss' && currentRoom.cleared) {
    ctx.fillStyle = '#a8d7b4';
    ctx.fillRect(ROOM_W * 0.72 - 30, ROOM_H / 2 - 8, 60, 16);
    ctx.strokeStyle = '#e1f4d1';
    ctx.lineWidth = 2;
    ctx.strokeRect(ROOM_W * 0.72 - 30, ROOM_H / 2 - 8, 60, 16);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DESCEND', ROOM_W * 0.72, ROOM_H / 2 - 18);
  }
  if (currentRoom.type === 'shop') {
    drawHumanoid(humanoidSprites.neutral.image, 0, ROOM_W / 2, ROOM_H / 2, 1.35, 40);
    drawHead('keeper', 'down', ROOM_W / 2, ROOM_H / 2, 1.35);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('KEEPER', ROOM_W / 2, ROOM_H / 2 - 28);
    ctx.fillStyle = '#d3c4a6';
    ctx.font = '12px Arial';
    ctx.fillText('Walk into an item to buy it', ROOM_W / 2, ROOM_H / 2 + 43);
    ctx.fillStyle = '#ab8058';
    ctx.fillRect(ROOM_W / 2 - 34, ROOM_H / 2 + 18, 68, 11);
    const stock = currentRoom.shopStock || [];
    stock.forEach((item, index) => {
      const spot = shopPedestalPosition(index);
      const x = spot.x - 105;
      const y = spot.y + 30;
      ctx.fillStyle = item.purchased ? 'rgba(63, 77, 63, 0.92)' : 'rgba(25, 22, 29, 0.94)';
      ctx.fillRect(x, y, 210, 64);
      ctx.strokeStyle = item.purchased ? '#77936a' : '#b79664';
      ctx.strokeRect(x, y, 210, 64);
      ctx.save();
      ctx.globalAlpha = item.purchased ? 0.4 : 1;
      ctx.fillStyle = 'rgba(16, 14, 19, 0.55)';
      ctx.strokeStyle = coins >= item.cost || item.purchased ? '#d9bd83' : '#9a6666';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawShopItemIcon(item, spot.x, spot.y);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = item.purchased ? '#9bb38e' : '#f2dfa9';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`${item.name} · ${item.cost}z`, x + 12, y + 24, 186);
      ctx.fillStyle = '#d4c7ae';
      ctx.font = '10px Arial';
      ctx.fillText(item.purchased ? 'SOLD' : item.description, x + 12, y + 43, 186);
      ctx.textAlign = 'center';
    });
  }
  if (currentRoom.type === 'bank') {
    ctx.fillStyle = 'rgba(35, 29, 23, 0.92)';
    ctx.fillRect(ROOM_W / 2 - 155, ROOM_H / 2 - 82, 310, 164);
    ctx.strokeStyle = '#d7b66e';
    ctx.lineWidth = 3;
    ctx.strokeRect(ROOM_W / 2 - 155, ROOM_H / 2 - 82, 310, 164);
    ctx.fillStyle = '#f4d78e';
    ctx.font = 'bold 22px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('Zenny Vault', ROOM_W / 2, ROOM_H / 2 - 38);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = '15px Arial';
    ctx.fillText(`Carried: ${coins}  ·  Stored: ${save.bankedZenny}`, ROOM_W / 2, ROOM_H / 2);
    ctx.font = '13px Arial';
    ctx.fillText('Step on a pad  ·  A / E Deposit all  ·  B / Shift+E Withdraw all', ROOM_W / 2, ROOM_H / 2 + 38);
    for (const withdraw of [false, true]) {
      const pad = bankPadPosition(withdraw);
      ctx.fillStyle = withdraw ? 'rgba(120, 170, 120, 0.35)' : 'rgba(200, 160, 80, 0.35)';
      ctx.strokeStyle = withdraw ? '#9fd39a' : '#d7b66e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f2e5c6';
      ctx.font = 'bold 13px Arial';
      ctx.fillText(withdraw ? 'WITHDRAW' : 'DEPOSIT', pad.x, pad.y + 5);
    }
    ctx.fillStyle = '#d7b66e';
    ctx.fillRect(ROOM_W / 2 - 34, ROOM_H / 2 + 52, 68, 10);
  }
  if (currentRoom.type === 'shrine') {
    ctx.save();
    ctx.fillStyle = 'rgba(17, 16, 25, 0.76)';
    ctx.strokeStyle = currentRoom.cleared ? '#a8d8a0' : '#cc92e7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(ROOM_W / 2, ROOM_H / 2, 86, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = currentRoom.cleared ? '#c6e7a8' : '#e1b8ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ROOM_W / 2, ROOM_H / 2 - 8, 24 + Math.sin(elapsed * 3) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e5d4f1';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(currentRoom.cleared ? 'SHRINE OFFERING' : 'GUARDIAN SHRINE', ROOM_W / 2, ROOM_H / 2 + 76);
    ctx.restore();
  }

  for (const rock of breakables) {
    if (rock.broken) {
      if (rock.regenerating) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#a4cc84';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(rock.x, rock.y, rock.radius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let step = 0; step < rock.regenSteps; step += 1) {
          ctx.fillStyle = step < rock.regenStage ? '#a4cc84' : '#3d4938';
          ctx.beginPath();
          ctx.arc(rock.x - 10 + step * 10, rock.y + rock.radius * 0.85, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      continue;
    }
    const sprite = rock.sprite;
    const hasImage = sprite.image.complete && sprite.image.naturalWidth > 0;
    const columns = hasImage ? Math.floor(sprite.image.naturalWidth / sprite.frameWidth) : 1;
    const sourceX = (rock.frame % columns) * sprite.frameWidth;
    const sourceY = Math.floor(rock.frame / columns) * sprite.frameHeight;
    const width = sprite.frameWidth * sprite.scale;
    const height = sprite.frameHeight * sprite.scale;
    if (hasImage) {
      ctx.save();
      if (rock.type === 'solid') ctx.filter = 'grayscale(0.85) brightness(0.7) saturate(0.65)';
      else if (rock.type === 'bomb-only') ctx.filter = 'sepia(0.45) saturate(1.5)';
      else if (rock.type === 'regenerating') ctx.filter = 'hue-rotate(45deg) saturate(1.2)';
      if (rock.regenerating && rock.regenStage < rock.regenSteps) {
        ctx.globalAlpha = 0.62 + rock.regenStage * 0.12;
      }
      ctx.drawImage(
        sprite.image,
        sourceX,
        sourceY,
        sprite.frameWidth,
        sprite.frameHeight,
        rock.x - width / 2,
        rock.y - height / 2,
        width,
        height,
      );
      ctx.restore();
    } else {
      drawFallbackBreakable(rock, width, height);
    }

    ctx.save();
    ctx.lineWidth = rock.type === 'solid' ? 3 : 2;
    ctx.strokeStyle = rock.type === 'solid' ? 'rgba(185, 203, 214, 0.95)'
      : rock.type === 'bomb-only' ? 'rgba(255, 161, 65, 0.95)'
        : rock.type === 'regenerating' ? 'rgba(154, 231, 130, 0.9)' : 'rgba(255, 220, 177, 0.85)';
    ctx.setLineDash(rock.type === 'solid' ? [] : [4, 3]);
    ctx.beginPath();
    ctx.arc(rock.x, rock.y, rock.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (rock.type === 'solid') {
      ctx.strokeStyle = 'rgba(34, 48, 61, 0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(rock.x - 8, rock.y - 8);
      ctx.lineTo(rock.x + 8, rock.y + 8);
      ctx.moveTo(rock.x + 8, rock.y - 8);
      ctx.lineTo(rock.x - 8, rock.y + 8);
      ctx.stroke();
    } else if (rock.type === 'bomb-only') {
      ctx.fillStyle = '#ffbf68';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('B', rock.x, rock.y + 4);
      ctx.strokeStyle = '#fff0bd';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rock.x - 5, rock.y - 7);
      ctx.lineTo(rock.x + 1, rock.y - 1);
      ctx.lineTo(rock.x - 2, rock.y + 5);
      ctx.stroke();
    } else if (rock.type === 'regenerating') {
      for (let step = 0; step < rock.regenSteps; step += 1) {
        ctx.fillStyle = step < rock.regenStage ? '#a4ee82' : 'rgba(53, 70, 48, 0.9)';
        ctx.beginPath();
        ctx.arc(rock.x - 10 + step * 10, rock.y + rock.radius + 9, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (rock.hp < rock.maxHp) {
      ctx.strokeStyle = rock.type === 'bomb-only' ? '#ff8c42'
        : rock.type === 'regenerating' ? '#b5f08f' : 'rgba(255, 220, 177, 0.95)';
      ctx.lineWidth = 2;
      for (let crack = 0; crack < rock.maxHp - rock.hp; crack += 1) {
        const offset = (crack - (rock.maxHp - rock.hp - 1) / 2) * 7;
        ctx.beginPath();
        ctx.moveTo(rock.x + offset - 3, rock.y - 8);
        ctx.lineTo(rock.x + offset + 2, rock.y - 1);
        ctx.lineTo(rock.x + offset - 1, rock.y + 3);
        ctx.lineTo(rock.x + offset + 3, rock.y + 9);
        ctx.stroke();
      }
    }
    if (rock.guaranteedDrop) {
      ctx.strokeStyle = 'rgba(255, 224, 139, 0.92)';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(rock.x, rock.y, rock.radius + 10 + Math.sin(elapsed * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffe08b';
      ctx.beginPath();
      ctx.moveTo(rock.x, rock.y - rock.radius - 13);
      ctx.lineTo(rock.x + 4, rock.y - rock.radius - 9);
      ctx.lineTo(rock.x, rock.y - rock.radius - 5);
      ctx.lineTo(rock.x - 4, rock.y - rock.radius - 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  for (const bomb of bombs) {
    const inFlight = bomb.flightTimer > 0;
    const progress = inFlight ? 1 - bomb.flightTimer / bomb.flightDuration : 1;
    const renderY = bomb.y - (inFlight ? Math.sin(progress * Math.PI) * 36 : 0);
    if (bomb.owner === 'enemy') {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 108, 54, 0.18)';
      ctx.strokeStyle = 'rgba(255, 157, 73, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bomb.targetX, bomb.targetY, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(bomb.x, bomb.y, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = bomb.fuse < 0.45 ? '#f1785e'
      : bomb.owner === 'enemy' ? '#573027' : '#26252a';
    ctx.beginPath();
    ctx.arc(bomb.x, renderY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffce67';
    ctx.fillRect(bomb.x + 4, renderY - 14, 3, 5);
  }
  for (const pickup of pickups) {
    if (pickup.guaranteedTreasure) {
      ctx.strokeStyle = 'rgba(255, 224, 139, 0.88)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 15 + Math.sin(elapsed * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (pickup.kind === 'upgrade') {
      const bob = Math.sin(elapsed * 4 + pickup.x) * 2;
      const radius = 46;
      let bubbleY = pickup.y + bob;
      const bubbleX = clamp(pickup.x, radius + 6, ROOM_W - radius - 6);
      const bubbleScreenX = bubbleX - camera.x;
      const itemIcon = shopItemIconImages[pickup.item.id];
      const auraColor = pickup.item.kind === 'element'
        ? magicElementPalette[pickup.item.element] || '#8fe0bd'
        : pickup.item.kind === 'ability' ? '#86dce8' : '#a8e39c';
      if (bubbleScreenX + radius > canvas.width - 154 && bubbleY - camera.y - radius < 154) {
        bubbleY = camera.y + 154 + radius + 6;
      }
      ctx.save();
      ctx.shadowColor = auraColor;
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(16, 14, 19, 0.48)';
      ctx.beginPath();
      ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.68;
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(16, 14, 19, 0.48)';
      if (itemIcon?.complete && itemIcon.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(itemIcon, bubbleX - 16, bubbleY - 29, 32, 32);
      } else {
        ctx.translate(bubbleX, bubbleY - 8);
        ctx.scale(1, 1);
        drawShopItemIcon(pickup.item, 0, 0);
      }
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px Arial';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(16, 14, 19, 0.9)';
      ctx.strokeText(pickup.item.name, bubbleX, bubbleY + 31, 82);
      ctx.fillStyle = '#fff4d5';
      ctx.fillText(pickup.item.name, bubbleX, bubbleY + 31, 82);
      ctx.restore();
    } else if (pickup.kind === 'heart') {
      if (heartImage.complete && heartImage.naturalWidth > 0) {
        ctx.drawImage(heartImage, pickup.x - 12, pickup.y - 12, 24, 24);
      } else {
        ctx.save();
        ctx.translate(pickup.x, pickup.y);
        ctx.scale(1, 1);
        ctx.fillStyle = '#e95e72';
        ctx.strokeStyle = '#29181b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.bezierCurveTo(-3, 7, -11, 1, -10, -5);
        ctx.bezierCurveTo(-9, -12, -2, -12, 0, -7);
        ctx.bezierCurveTo(3, -12, 10, -12, 10, -5);
        ctx.bezierCurveTo(11, 1, 3, 7, 0, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else if (pickup.kind === 'coin') {
      const bob = Math.sin(elapsed * 5 + pickup.x) * 2;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.shadowColor = 'rgba(242, 189, 70, 0.72)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(242, 189, 70, 0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17201b';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2bd46';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff0ab';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#49330f';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Z', 0, 0.5);
      ctx.restore();
    } else if (pickup.kind === 'bomb') {
      ctx.fillStyle = '#25232a';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (pickup.kind === 'key') {
      ctx.fillStyle = '#fbd96f';
      ctx.strokeStyle = '#fbd96f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pickup.x - 5, pickup.y - 2, 4, 0, Math.PI * 2);
      ctx.moveTo(pickup.x - 1, pickup.y - 2);
      ctx.lineTo(pickup.x + 8, pickup.y - 2);
      ctx.lineTo(pickup.x + 8, pickup.y + 2);
      ctx.moveTo(pickup.x + 4, pickup.y - 2);
      ctx.lineTo(pickup.x + 4, pickup.y + 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f5e6ce';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const projectile of projectiles) {
    const size = 18 * (projectile.size || 1);
    ctx.save();
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 14 * (projectile.size || 1);
    ctx.lineJoin = 'round';
    if (projectile.type === 'arrow') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-10 * (projectile.size || 1), 0);
      ctx.lineTo(10 * (projectile.size || 1), 0);
      ctx.stroke();
      ctx.strokeStyle = '#c59a58';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10 * (projectile.size || 1), 0);
      ctx.lineTo(10 * (projectile.size || 1), 0);
      ctx.stroke();
      ctx.fillStyle = '#f0d8a0';
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12 * (projectile.size || 1), 0);
      ctx.lineTo(5 * (projectile.size || 1), -4 * (projectile.size || 1));
      ctx.lineTo(5 * (projectile.size || 1), 4 * (projectile.size || 1));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c59a58';
      ctx.beginPath();
      ctx.moveTo(-10 * (projectile.size || 1), 0);
      ctx.lineTo(-15 * (projectile.size || 1), -4 * (projectile.size || 1));
      ctx.lineTo(-13 * (projectile.size || 1), 0);
      ctx.lineTo(-15 * (projectile.size || 1), 4 * (projectile.size || 1));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (projectile.type === 'elemental' && projectile.shape) {
      const pulseScale = (1 + Math.sin(elapsed * 16 + projectile.x * 0.05) * (projectile.pulse || 0)) *
        (projectile.size || 1);
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      ctx.scale(pulseScale, pulseScale);
      drawMorphShape(projectile.shape, projectile.color);
    } else if (projectile.type === 'elemental') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      const element = projectile.element || 'bubble';
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      if (projectile.pulse) {
        const elementPulse = 1 + Math.sin(elapsed * 16 + projectile.x * 0.05) * projectile.pulse;
        ctx.scale(elementPulse, elementPulse);
      }
      ctx.fillStyle = magicElementPalette[element] || magicElementPalette.bubble;
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2.5;
      if (element === 'bubble') {
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(245, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(-3, -4, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (element === 'fire') {
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.quadraticCurveTo(2, -5, 0, -11);
        ctx.quadraticCurveTo(-3, -3, -10, -3);
        ctx.quadraticCurveTo(-8, 7, 0, 10);
        ctx.quadraticCurveTo(7, 8, 12, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe68c';
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.quadraticCurveTo(0, -2, 0, -6);
        ctx.quadraticCurveTo(-4, 1, -1, 6);
        ctx.quadraticCurveTo(4, 5, 6, 0);
        ctx.fill();
      } else if (element === 'lightning') {
        ctx.beginPath();
        ctx.moveTo(4, -13);
        ctx.lineTo(-8, 1);
        ctx.lineTo(-1, 1);
        ctx.lineTo(-5, 13);
        ctx.lineTo(9, -4);
        ctx.lineTo(2, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(-5, 3, 6, 0, Math.PI * 2);
        ctx.arc(2, 0, 8, 0, Math.PI * 2);
        ctx.arc(8, 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(234, 255, 184, 0.85)';
        ctx.beginPath();
        ctx.arc(-3, 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (projectile.type === 'spore-shard') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      ctx.fillStyle = projectile.color;
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (stoneImage.complete && stoneImage.naturalWidth > 0) {
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, size * 0.57, 0, Math.PI * 2);
      ctx.stroke();
      ctx.drawImage(stoneImage, projectile.x - size / 2, projectile.y - size / 2, size, size);
    } else {
      ctx.fillStyle = projectile.color;
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const projectile of enemyProjectiles) {
    ctx.save();
    ctx.shadowColor = projectile.color;
    if (projectile.kind === 'arrow') {
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#704526';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      ctx.fillStyle = '#d5c18b';
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(6, -3.5);
      ctx.lineTo(6, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#d5c18b';
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-14, -4);
      ctx.moveTo(-9, 0);
      ctx.lineTo(-14, 4);
      ctx.stroke();
    } else if (projectile.kind === 'spore-orb') {
      const pulse = 1 + Math.sin(elapsed * 14) * 0.12;
      ctx.shadowBlur = 20;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 211, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius + 6 + Math.sin(elapsed * 12) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f5d8fb';
      for (let seed = 0; seed < 4; seed += 1) {
        const angle = elapsed * 2 + seed * Math.PI / 2;
        ctx.beginPath();
        ctx.arc(projectile.x + Math.cos(angle) * 8, projectile.y + Math.sin(angle) * 8, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (projectile.kind === 'spore-shard') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      ctx.shadowBlur = 12;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-4, -3);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.shadowBlur = 13;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(projectile.x - projectile.radius * 0.25, projectile.y - projectile.radius * 0.25,
        projectile.radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.ttl / particle.maxTtl, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const swing of player.meleeSwings) {
    const progress = 1 - swing.timer / swing.maxTimer;
    const swingColor = swing.element ? magicElementPalette[swing.element]
      : swing.weapon === 'sword' ? combatPalette.sword
        : swing.weapon === 'daggers' ? combatPalette.daggers : combatPalette.melee;
    ctx.save();
    ctx.globalAlpha = 0.8 * (1 - progress);
    ctx.strokeStyle = '#101612';
    ctx.lineWidth = (swing.weapon === 'sword' ? 7 : swing.weapon === 'daggers' ? 5 : 8) + 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = swing.weapon === 'sword' ? combatPalette.arcane : combatPalette.melee;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 34, swing.reach + progress * 12,
      swing.angle - 0.85, swing.angle + 0.85);
    ctx.stroke();
    ctx.strokeStyle = swingColor;
    ctx.lineWidth -= 3;
    ctx.stroke();
    ctx.restore();
  }
  for (const arc of lightningArcs) {
    ctx.save();
    ctx.globalAlpha = clamp(arc.ttl / 0.18, 0, 1);
    ctx.strokeStyle = '#ffe45c';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ffe45c';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(arc.x1, arc.y1);
    const midX = (arc.x1 + arc.x2) / 2;
    const midY = (arc.y1 + arc.y2) / 2;
    ctx.lineTo(midX + Math.sin(elapsed * 95 + arc.y1) * 9, midY + Math.cos(elapsed * 83 + arc.x2) * 9);
    ctx.lineTo(arc.x2, arc.y2);
    ctx.stroke();
    ctx.strokeStyle = '#fff8c2';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  for (const enemy of enemies) drawEnemy(enemy);
  drawPlayer();
  for (const companion of companions) drawCompanion(companion);
  if (streakCallout.timer > 0) {
    const progress = 1 - streakCallout.timer / streakCallout.duration;
    ctx.save();
    ctx.globalAlpha = Math.min(1, streakCallout.timer * 2.5);
    ctx.fillStyle = '#fff0bd';
    ctx.strokeStyle = '#283b3b';
    ctx.lineWidth = 3;
    ctx.font = `bold ${14 + Math.sin(progress * Math.PI) * 2}px Arial`;
    ctx.textAlign = 'center';
    const y = streakCallout.y - progress * 18;
    ctx.strokeText(streakCallout.text, streakCallout.x, y);
    ctx.fillText(streakCallout.text, streakCallout.x, y);
    ctx.restore();
  }
}

function roomLeftoverKinds(room) {
  const list = room === currentRoom ? pickups : room.runtime?.pickups || [];
  return new Set(list.map((pickup) => pickup.kind));
}

// Marks heart, coin, bomb, and special items left behind in a room, one per corner.
function drawRoomLeftovers(room, x, y, cell, radius) {
  const kinds = roomLeftoverKinds(room);
  const mark = (cx, cy, fill, stroke) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  const inset = radius + 1;
  if (kinds.has('heart')) mark(x + inset, y + inset, '#e85d6f', '#fff0f0');
  if (kinds.has('coin')) mark(x + cell - inset, y + inset, '#f4cf5c', '#6b5217');
  if (kinds.has('bomb')) mark(x + inset, y + cell - inset, '#2b2b33', '#d9d9e0');
  if (kinds.has('upgrade')) mark(x + cell - inset, y + cell - inset, '#b98cf0', '#ffffff');
}

function drawMap() {
  ctx.fillStyle = 'rgba(12, 13, 20, 0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f3e9d8';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('SANCTUM MAP', canvas.width / 2, 86);

  const cell = 55;
  const originX = canvas.width / 2 - cell * 3.5;
  const originY = canvas.height / 2 - cell * 3.5;
  for (const room of rooms) {
    if (!room.visited) continue;
    const x = originX + room.x * cell;
    const y = originY + room.y * cell;
    ctx.fillStyle = room === currentRoom ? '#79c9c2' :
      room.type === 'boss' ? '#aa5e72' : room.type === 'miniboss' ? '#bd765d'
        : room.type === 'shop' ? '#d9aa66' : room.type === 'bank' ? '#d7b66e'
          : room.type === 'shrine' ? '#a77fc2' : '#514d59';
    ctx.fillRect(x + 8, y + 8, cell - 16, cell - 16);
    ctx.fillStyle = '#e9dfd0';
    ctx.font = '12px Arial';
    ctx.fillText(room.type === 'boss' ? 'B' : room.type === 'miniboss' ? '!'
      : room.type === 'shop' ? '$' : room.type === 'bank' ? 'Z'
        : room.type === 'shrine' ? 'S' : room.type === 'secret' ? '?' : '',
    x + cell / 2, y + cell / 2 + 4);
    drawRoomLeftovers(room, x + 2, y + 2, cell - 4, 5);
  }
  ctx.fillStyle = '#ded4c4';
  ctx.font = '16px Arial';
  ctx.fillText('Press M to return', canvas.width / 2, canvas.height - 48);
}

function roomIsRevealed(room) {
  if (room.visited || room === currentRoom) return true;
  if (room.hidden) return false;
  if (room.type === 'secret') return !room.hidden;
  return rooms.some((visitedRoom) =>
    visitedRoom.visited && Object.keys(visitedRoom.links).some((direction) => {
      const vector = directions.find((item) => item.name === direction);
      return visitedRoom.x + vector.dx === room.x && visitedRoom.y + vector.dy === room.y;
    }),
  );
}

function drawMinimap() {
  const panel = { x: canvas.width - 154, y: 12, width: 142, height: 142 };
  const cell = 16;
  const originX = panel.x + 14;
  const originY = panel.y + 25;
  ctx.fillStyle = 'rgba(16, 14, 19, 0.48)';
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
  ctx.strokeStyle = 'rgba(225, 201, 160, 0.62)';
  ctx.lineWidth = 1;
  ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.width - 1, panel.height - 1);
  ctx.fillStyle = '#e6d8bd';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`${currentFloorTheme().name}  [M]`, panel.x + 9, panel.y + 15);

  for (const room of rooms) {
    if (!roomIsRevealed(room)) continue;
    const x = originX + room.x * cell;
    const y = originY + room.y * cell;
    for (const direction of directions) {
      const connectedRoom = rooms.find((candidate) =>
        candidate.x === room.x + direction.dx && candidate.y === room.y + direction.dy,
      );
      const secretConnected = room.secretExit?.direction === direction.name &&
        !room.secretExit.room.hidden ? room.secretExit.room : null;
      const linked = room.links[direction.name] ? connectedRoom : secretConnected;
      if (!linked || !roomIsRevealed(linked)) continue;
      const otherX = originX + linked.x * cell + cell / 2;
      const otherY = originY + linked.y * cell + cell / 2;
      ctx.strokeStyle = '#908572';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + cell / 2, y + cell / 2);
      ctx.lineTo(otherX, otherY);
      ctx.stroke();
    }
  }

  for (const room of rooms) {
    if (!roomIsRevealed(room)) continue;
    const x = originX + room.x * cell;
    const y = originY + room.y * cell;
    ctx.fillStyle = room === currentRoom ? '#8ee0cf' :
      room.type === 'boss' ? '#bb7181' : room.type === 'miniboss' ? '#d78c69'
        : room.type === 'shop' ? '#edc878' : room.type === 'bank' ? '#e4ca75' :
        room.type === 'shrine' ? '#c69be5' :
        room.type === 'secret' ? '#c69be5' : '#aaa19a';
    ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
    if (room.type === 'boss' || room.type === 'miniboss' || room.type === 'shop' ||
      room.type === 'bank' || room.type === 'secret' || room.type === 'shrine') {
      ctx.fillStyle = '#211e25';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(room.type === 'boss' ? 'B' : room.type === 'miniboss' ? '!'
        : room.type === 'shop' ? '$' : room.type === 'bank' ? 'Z'
          : room.type === 'shrine' ? 'S' : '?',
      x + cell / 2, y + cell / 2 + 3);
    }
    if (room === currentRoom) {
      ctx.strokeStyle = '#fff1d7';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
    }
    drawRoomLeftovers(room, x, y, cell, 2.5);
  }
}

function drawGameHud() {
  if (!character) return;
  const theme = currentFloorTheme();
  const activeConsumable = consumables.find((item) => item.count > 0);
  const activeCompanions = companions.filter((companion) => companion.hp > 0).length;
  const leftHud = { x: 32, y: 2 };
  const rightHud = { x: 560, y: 2 };
  ctx.save();
  const drawIndicatorBorder = (x, y, width, height) => {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(7, 10, 8, 0.84)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(249, 225, 174, 0.96)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.restore();
  };
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 4;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = theme.detail;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(`${theme.name} · Floor ${currentFloor}`, leftHud.x + 10, leftHud.y + 16);
  ctx.fillText(`${theme.name} · Floor ${currentFloor}`, leftHud.x + 10, leftHud.y + 16);
  const healthX = leftHud.x + 10;
  for (let index = 0; index < player.maxHp; index += 1) {
    const x = healthX + index * 20;
    if (index < player.hp && heartImage.complete && heartImage.naturalWidth > 0) {
      ctx.save();
      ctx.filter = 'drop-shadow(0 0 1px #101612) drop-shadow(0 0 1px #101612)';
      ctx.drawImage(heartImage, x, leftHud.y + 34, 17, 17);
      ctx.restore();
    } else {
      const y = leftHud.y + 34;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 16);
      ctx.bezierCurveTo(x + 5, y + 14, x, y + 10, x + 1, y + 5);
      ctx.bezierCurveTo(x + 2, y, x + 7, y, x + 8, y + 4);
      ctx.bezierCurveTo(x + 10, y, x + 16, y, x + 16, y + 5);
      ctx.bezierCurveTo(x + 17, y + 10, x + 11, y + 14, x + 8, y + 16);
      if (index < player.hp) {
        ctx.fillStyle = '#df7180';
        ctx.fill();
        ctx.strokeStyle = '#101612';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#101612';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 243, 223, 0.98)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }

  const armorX = healthX + player.maxHp * 20 + 14;
  drawIndicatorBorder(armorX - 3, leftHud.y + 32, 20, 22);
  ctx.fillStyle = '#e4f1ff';
  ctx.beginPath();
  ctx.moveTo(armorX + 6, leftHud.y + 34);
  ctx.lineTo(armorX + 13, leftHud.y + 37);
  ctx.lineTo(armorX + 12, leftHud.y + 45);
  ctx.lineTo(armorX + 6, leftHud.y + 52);
  ctx.lineTo(armorX, leftHud.y + 45);
  ctx.lineTo(armorX - 1, leftHud.y + 37);
  ctx.closePath();
  ctx.fill();
  for (let index = 0; index < player.armor; index += 1) {
    const x = armorX + 18 + index * 14;
    drawIndicatorBorder(x - 2, leftHud.y + 33, 14, 20);
    ctx.beginPath();
    ctx.moveTo(x + 5, leftHud.y + 35);
    ctx.lineTo(x + 10, leftHud.y + 42);
    ctx.lineTo(x + 5, leftHud.y + 50);
    ctx.lineTo(x, leftHud.y + 42);
    ctx.closePath();
    ctx.fill();
  }

  const resourcesX = rightHud.x + 12;
  ctx.fillStyle = '#ffe18b';
  ctx.beginPath();
  ctx.arc(resourcesX + 7, rightHud.y + 17, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#3f3021';
  ctx.font = 'bold 9px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Z', resourcesX + 7, rightHud.y + 17);
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = '#ffe18b';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(coins, resourcesX + 18, rightHud.y + 17);
  ctx.fillText(coins, resourcesX + 18, rightHud.y + 17);

  const keyX = resourcesX + 48;
  ctx.beginPath();
  ctx.arc(keyX + 5, rightHud.y + 15, 4, 0, Math.PI * 2);
  ctx.moveTo(keyX + 9, rightHud.y + 15);
  ctx.lineTo(keyX + 18, rightHud.y + 15);
  ctx.lineTo(keyX + 18, rightHud.y + 20);
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 4.5;
  ctx.stroke();
  ctx.strokeStyle = '#ffe18b';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#ffe18b';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(keysHeld, keyX + 22, rightHud.y + 17);
  ctx.fillText(keysHeld, keyX + 22, rightHud.y + 17);

  const bombX = keyX + 52;
  ctx.fillStyle = '#e7f0f1';
  ctx.beginPath();
  ctx.arc(bombX + 7, rightHud.y + 18, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f2c774';
  ctx.fillRect(bombX + 9, rightHud.y + 8, 3, 6);
  ctx.fillStyle = '#f4e6c4';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(bombsHeld, bombX + 18, rightHud.y + 17);
  ctx.fillText(bombsHeld, bombX + 18, rightHud.y + 17);

  const familiarX = bombX + 50;
  ctx.fillStyle = '#8fe0bd';
  ctx.beginPath();
  ctx.arc(familiarX + 7, rightHud.y + 17, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#302538';
  ctx.beginPath();
  ctx.arc(familiarX + 5, rightHud.y + 16, 1.4, 0, Math.PI * 2);
  ctx.arc(familiarX + 9, rightHud.y + 16, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#baf3d6';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(activeCompanions, familiarX + 18, rightHud.y + 17);
  ctx.fillText(activeCompanions, familiarX + 18, rightHud.y + 17);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  const boss = enemies.find((enemy) => enemy.boss || enemy.miniBoss);
  if (boss) {
    const width = boss.boss ? 380 : 300;
    const x = (canvas.width - width) / 2;
    const y = canvas.height - 31;
    ctx.fillStyle = 'rgba(14, 12, 18, 0.72)';
    ctx.fillRect(x, y, width, 29);
    ctx.fillStyle = '#372d32';
    ctx.fillRect(x + 8, y + 19, width - 16, 6);
    ctx.fillStyle = boss.boss ? '#d16e84' : '#d99868';
    ctx.fillRect(x + 8, y + 19, (width - 16) * clamp(boss.hp / boss.maxHp, 0, 1), 6);
    ctx.fillStyle = '#f5e8d8';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(boss.boss
      ? `${boss.title}${boss.phase >= 2 ? ' - PHASE II' : ''}`
      : boss.title || 'MINI-BOSS', canvas.width / 2, y + 12);
  }
}

function isCharacterUnlocked(entry) {
  return entry.id === 'wanderer' || save.unlockedCharacters.includes(entry.id) ||
    (entry.id === 'arcanist' && save.arcanist) || (entry.id === 'warden' && save.warden);
}

function characterCardBounds(pageIndex) {
  return { x: 29 + pageIndex * 180, y: 150, width: 164, height: 238 };
}

function characterStartBounds() {
  return { x: canvas.width / 2 - 100, y: 490, width: 200, height: 36 };
}

let resetConfirmTimer = 0;
let menuFocus = 'start';
let previousMenuVertical = 0;

function menuFocusEntries() {
  return hasSavedRun() ? ['resume', 'start', 'reset'] : ['start', 'reset'];
}

function moveMenuFocus(delta) {
  const entries = menuFocusEntries();
  const index = Math.max(0, entries.indexOf(menuFocus));
  menuFocus = entries[(index + delta + entries.length) % entries.length];
}

function activateMenuFocus() {
  if (menuFocus === 'resume' && hasSavedRun()) restoreRun();
  else if (menuFocus === 'reset') requestProgressReset();
  else beginRun();
}

function resetButtonBounds() {
  return { x: 29, y: 498, width: 190, height: 28 };
}

function resetAllProgress() {
  for (const key of [PROFILE_STORAGE_KEY, BANK_STORAGE_KEY, RUN_STORAGE_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      messageEl.textContent = 'Some saved data could not be cleared by this browser.';
    }
  }
  stopChapterNarration();
  Object.assign(save, getSave());
  persistSave();
  chapterQueue.length = 0;
  activeChapter = null;
  runProgressionSnapshot = null;
  storyLog.length = 0;
  coins = 0;
  character = null;
  resetConfirmTimer = 0;
  selectedIndex = 0;
  prologuePage = 0;
  mode = 'prologue';
  updateHud();
  showMessage('All progress erased. Your story begins again.', 4);
  startPrologueNarration();
}

function requestProgressReset() {
  if (mode !== 'select') return;
  if (resetConfirmTimer > 0) {
    resetAllProgress();
    return;
  }
  resetConfirmTimer = 5;
  showMessage('Click RESET again within 5 seconds to erase every unlock, coin, and saved run.', 5);
}

function codexButtonBounds() {
  return { x: canvas.width - 174, y: 80, width: 150, height: 30 };
}

function openCodex() {
  if (mode !== 'select') return;
  mode = 'codex';
  codexTab = 'items';
  codexScroll = 0;
  updateHud();
}

function closeCodex() {
  if (mode !== 'codex') return;
  mode = 'select';
  updateHud();
}

function toggleCodexTab() {
  codexTab = codexTab === 'items' ? 'enemies' : 'items';
  codexScroll = 0;
}

function codexEntries() {
  if (codexTab === 'items') {
    return shopItemCatalog.filter((item) => save.discoveredItemIds.includes(item.id) ||
      save.unlockedItemIds.includes(item.id));
  }
  const enemyMoves = {
    bandit: ['arrow-shot'],
    banditlord: ['arrow-shot', 'fire-burst'],
    jacko: ['fire-burst'],
    wisp: ['lightning-shot'],
    'spore-sower': ['spore-burst'],
  };
  const moveNames = {
    'arrow-shot': 'Arrow volley',
    'fire-burst': 'Fire burst',
    'lightning-shot': 'Lightning shot',
    'spore-burst': 'Spore burst',
  };
  return save.discoveredEnemyIds.map((kind) => ({
    id: kind,
    name: kind.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' '),
    description: [({
      bandit: 'A road fighter whose arrows reveal the Trail-Worn Bow.',
      'banditlord': 'The bandit captain unleashes a spreading fire burst.',
      wisp: 'A drifting spirit that hurls charged lightning shots.',
      'spore-sower': 'A fungal caster whose spores bloom into a radial burst.',
    }[kind] || 'Encountered during a descent.'),
    ...((enemyMoves[kind] || []).filter((abilityId) => save.discoveredEnemyAbilityIds.includes(abilityId))
      .map((abilityId) => `Witnessed: ${moveNames[abilityId]}.`))].join(' '),
    kind: 'enemy',
  }));
}

function resumeRunBounds() {
  return { x: canvas.width / 2 - 120, y: 451, width: 240, height: 30 };
}

function prologueButtonBounds(direction) {
  return { x: direction < 0 ? 94 : canvas.width - 214, y: 458, width: 120, height: 38 };
}

function advancePrologue(direction) {
  if (mode !== 'prologue') return;
  if (direction > 0 && prologuePage === prologuePages.length - 1) {
    stopPrologueNarration();
    mode = 'select';
    updateHud();
    showMessage('Prologue complete. Choose a delver to begin.', 2.5);
    return;
  }
  if (prologueNarrationNeedsGesture) {
    const started = startPrologueNarration();
    if (started || prologueSpeechFallbackActive) {
      showMessage('Narration started. Continue when ready.', 3);
      return;
    }
  }
  const nextPage = clamp(prologuePage + direction, 0, prologuePages.length - 1);
  if (nextPage === prologuePage) {
    startPrologueNarration();
    return;
  }
  stopPrologueNarration();
  prologuePage = nextPage;
  startPrologueNarration();
}

function wrapCanvasText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  let lineNumber = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      ctx.fillText(line, x, y + lineNumber * lineHeight);
      line = word;
      lineNumber += 1;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, y + lineNumber * lineHeight);
  return lineNumber + 1;
}

function drawPrologue() {
  const page = prologuePages[prologuePage];
  ctx.fillStyle = '#161b1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#283a31';
  ctx.fillRect(0, 0, canvas.width, 98);
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`THE MANA WORLD  /  ${page.heading}`, canvas.width / 2, 54);
  ctx.fillStyle = '#f2e3c4';
  ctx.font = 'bold 30px Georgia';
  ctx.fillText(page.title, canvas.width / 2, 150);
  ctx.fillStyle = '#d6d0be';
  ctx.font = '18px Arial';
  ctx.textAlign = 'left';
  wrapCanvasText(page.text, 140, 218, 680, 32);
  ctx.fillStyle = '#b9c8b3';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${prologuePage + 1} / ${prologuePages.length}`, canvas.width / 2, 425);
  const previous = prologueButtonBounds(-1);
  const next = prologueButtonBounds(1);
  for (const [bounds, label] of [[previous, 'BACK'], [next, prologuePage === prologuePages.length - 1 ? 'DELVER ROSTER' : 'CONTINUE']]) {
    ctx.fillStyle = '#55452e';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.strokeStyle = '#d9bd83';
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.fillStyle = '#fff0d1';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(label, bounds.x + bounds.width / 2, bounds.y + 24);
  }
  ctx.fillStyle = '#c5b9a6';
  ctx.font = '12px Arial';
  ctx.fillText('Use ← / →, A / D, or the controller D-pad to read the prologue.', canvas.width / 2, 520);
}

function drawChapter() {
  const card = activeChapter;
  if (!card) return;
  ctx.fillStyle = '#161b1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#283a31';
  ctx.fillRect(0, 0, canvas.width, 98);
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${card.kind === 'region' ? 'NEW MAP DISCOVERED' : 'NEW DELVER UNLOCKED'}  /  ${card.heading}`, canvas.width / 2, 54);
  ctx.fillStyle = '#f2e3c4';
  ctx.font = 'bold 30px Georgia';
  ctx.fillText(card.title, canvas.width / 2, 150);
  ctx.fillStyle = '#d6d0be';
  ctx.font = '18px Arial';
  ctx.textAlign = 'left';
  wrapCanvasText(card.text, 140, 218, 680, 32);
  const next = prologueButtonBounds(1);
  ctx.fillStyle = '#55452e';
  ctx.fillRect(next.x, next.y, next.width, next.height);
  ctx.strokeStyle = '#d9bd83';
  ctx.strokeRect(next.x, next.y, next.width, next.height);
  ctx.fillStyle = '#fff0d1';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('CONTINUE', next.x + next.width / 2, next.y + 24);
  ctx.fillStyle = '#c5b9a6';
  ctx.font = '12px Arial';
  ctx.fillText('Enter, Space, a click, or A continues. The narrator reads each entry aloud.', canvas.width / 2, 520);
}

function drawCharacterSelect() {
  ctx.fillStyle = '#161b17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#efd4a0';
  ctx.font = 'bold 29px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('THE MANA WORLD  /  DELVER LEDGER', canvas.width / 2, 72);
  ctx.fillStyle = '#c8cbbd';
  ctx.font = '14px Arial';
  const pageStart = Math.floor(selectedIndex / rosterPageSize) * rosterPageSize;
  const pageNumber = Math.floor(pageStart / rosterPageSize);
  ctx.fillText(`Page ${pageNumber + 1} / ${Math.ceil(characterRoster.length / rosterPageSize)}  •  ← / → selects delvers`, canvas.width / 2, 105);
  const codexButton = codexButtonBounds();
  ctx.fillStyle = pointer.x >= codexButton.x && pointer.x <= codexButton.x + codexButton.width &&
    pointer.y >= codexButton.y && pointer.y <= codexButton.y + codexButton.height ? '#52664f' : '#30443b';
  ctx.fillRect(codexButton.x, codexButton.y, codexButton.width, codexButton.height);
  ctx.strokeStyle = '#a5c79b';
  ctx.lineWidth = 1;
  ctx.strokeRect(codexButton.x, codexButton.y, codexButton.width, codexButton.height);
  ctx.fillStyle = '#e4f0d7';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('FIELD CODEX  [K]', codexButton.x + codexButton.width / 2, codexButton.y + 20);

  characterRoster.slice(pageStart, pageStart + rosterPageSize).forEach((entry, pageIndex) => {
    const index = pageStart + pageIndex;
    const unlocked = isCharacterUnlocked(entry);
    const bounds = characterCardBounds(pageIndex);
    const x = bounds.x + bounds.width / 2;
    const y = 238;
    const hovered = pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
      pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
    ctx.fillStyle = index === selectedIndex ? '#3a493d' : '#252b27';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.strokeStyle = index === selectedIndex || hovered ? '#e9c57e' : '#68776b';
    ctx.lineWidth = 2;
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.globalAlpha = unlocked ? 1 : 0.38;
    drawHumanoid(humanoidSprites[entry.sprite].image, 0, x, y, 0.95, entry.hue);
    drawHead(entry.hairStyle, 'down', x, y, 0.95);
    ctx.fillStyle = '#f2e8d8';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(entry.name, x, y + 49);
    ctx.font = '11px Arial';
    ctx.fillText(`${entry.className}  •  ${entry.styleLabel}`, x, y + 67);
    ctx.fillText(`HP 4  •  DMG ${entry.damage}`, x, y + 84);
    ctx.fillStyle = '#d9c796';
    ctx.fillText(entry.trait, x, y + 103);
    ctx.fillStyle = unlocked ? '#a8d39b' : '#dfa5a2';
    ctx.font = 'bold 10px Arial';
    ctx.fillText(unlocked ? 'UNLOCKED' : entry.unlock.toUpperCase(), x, y + 126);
    ctx.globalAlpha = 1;
  });
  ctx.fillStyle = '#d9c796';
  ctx.font = 'bold 12px Arial';
  const selected = characterRoster[selectedIndex];
  ctx.fillText(isCharacterUnlocked(selected) ? selected.trait : `LOCKED  /  ${selected.unlock}`, canvas.width / 2, 416);
  if (hasSavedRun()) {
    const resume = resumeRunBounds();
    const hoveredResume = pointer.x >= resume.x && pointer.x <= resume.x + resume.width &&
      pointer.y >= resume.y && pointer.y <= resume.y + resume.height;
    ctx.fillStyle = hoveredResume ? '#78603c' : '#55452e';
    ctx.fillRect(resume.x, resume.y, resume.width, resume.height);
    ctx.strokeStyle = '#e9c57e';
    ctx.strokeRect(resume.x, resume.y, resume.width, resume.height);
    ctx.fillStyle = '#fff0d1';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('RESUME SAVED DESCENT', canvas.width / 2, resume.y + 21);
    if (lastInputMode === 'controller' && menuFocus === 'resume') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(resume.x - 3, resume.y - 3, resume.width + 6, resume.height + 6);
    }
  } else {
    ctx.fillStyle = '#c5b9a6';
    ctx.font = '12px Arial';
    ctx.fillText('Learn styles and weapons; all your attacks stack. Break cracked walls with bombs.', canvas.width / 2, 462);
  }
  const start = characterStartBounds();
  const hoveredStart = pointer.x >= start.x && pointer.x <= start.x + start.width &&
    pointer.y >= start.y && pointer.y <= start.y + start.height;
  ctx.fillStyle = hoveredStart ? '#80633a' : '#55452e';
  ctx.fillRect(start.x, start.y, start.width, start.height);
  ctx.strokeStyle = '#e9c57e';
  ctx.lineWidth = 2;
  ctx.strokeRect(start.x, start.y, start.width, start.height);
  ctx.fillStyle = '#fff0d1';
  ctx.font = 'bold 15px Arial';
  ctx.fillText('DESCEND', canvas.width / 2, start.y + 25);
  const focusBounds = { start, reset: resetButtonBounds(), resume: resumeRunBounds() }[menuFocus];
  if (lastInputMode === 'controller' && focusBounds && menuFocus !== 'resume') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(focusBounds.x - 3, focusBounds.y - 3, focusBounds.width + 6, focusBounds.height + 6);
  }
  const reset = resetButtonBounds();
  ctx.fillStyle = resetConfirmTimer > 0 ? '#6b2b2b' : '#2b2f2c';
  ctx.fillRect(reset.x, reset.y, reset.width, reset.height);
  ctx.strokeStyle = resetConfirmTimer > 0 ? '#e08a8a' : '#68776b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(reset.x, reset.y, reset.width, reset.height);
  ctx.fillStyle = '#f0d8d8';
  ctx.font = 'bold 11px Arial';
  ctx.fillText(resetConfirmTimer > 0 ? 'SELECT AGAIN TO ERASE ALL' : 'RESET ALL PROGRESS  [Del]', reset.x + reset.width / 2, reset.y + 18);
}

function drawCodex() {
  ctx.fillStyle = '#111714';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a241e';
  ctx.fillRect(42, 28, canvas.width - 84, canvas.height - 56);
  ctx.strokeStyle = '#83a588';
  ctx.lineWidth = 2;
  ctx.strokeRect(42, 28, canvas.width - 84, canvas.height - 56);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('DISCOVERY LEDGER', 70, 58);
  ctx.fillStyle = '#eef0df';
  ctx.font = 'bold 28px Georgia';
  ctx.fillText('Field Codex', 70, 94);
  ctx.fillStyle = '#c4cbbd';
  ctx.font = '12px Arial';
  ctx.fillText(`Descent time ${Math.floor(save.playtimeSeconds / 60)}m ${Math.floor(save.playtimeSeconds % 60)}s`, 70, 116);

  const tabs = [{ id: 'items', label: 'ITEMS' }, { id: 'enemies', label: 'ENEMIES' }];
  tabs.forEach((tab, index) => {
    const x = 70 + index * 126;
    ctx.fillStyle = codexTab === tab.id ? '#49634d' : '#28352d';
    ctx.fillRect(x, 132, 112, 28);
    ctx.strokeStyle = codexTab === tab.id ? '#a5c79b' : '#63796a';
    ctx.strokeRect(x, 132, 112, 28);
    ctx.fillStyle = '#e5eadc';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(tab.label, x + 56, 150);
  });

  const entries = codexEntries();
  const visibleEntries = entries.slice(codexScroll, codexScroll + 7);
  if (entries.length === 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#bec9bd';
    ctx.font = '15px Arial';
    ctx.fillText(codexTab === 'items'
      ? 'Find an item in a descent to record it here.'
      : 'Meet a creature during a descent to record it here.', 72, 210);
  }
  visibleEntries.forEach((entry, index) => {
    const y = 172 + index * 43;
    ctx.fillStyle = 'rgba(8, 12, 10, 0.6)';
    ctx.fillRect(68, y, canvas.width - 136, 38);
    if (entry.kind !== 'enemy') drawShopItemIcon(entry, 91, y + 19);
    else {
      ctx.fillStyle = '#98c98e';
      ctx.beginPath();
      ctx.arc(91, y + 19, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0e8d5';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(entry.name, 116, y + 15, 390);
    ctx.fillStyle = '#c0cbbd';
    ctx.font = '11px Arial';
    ctx.fillText(entry.description || 'A newly recorded discovery.', 116, y + 30, 620);
    if (entry.kind !== 'enemy') {
      const status = save.discoveredItemIds.includes(entry.id) ? 'FOUND' : 'READY TO FIND';
      ctx.textAlign = 'right';
      ctx.fillStyle = status === 'FOUND' ? '#a9d79e' : '#e0c77c';
      ctx.font = 'bold 10px Arial';
      ctx.fillText(status, canvas.width - 78, y + 23);
    }
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c5cebf';
  ctx.font = '12px Arial';
  ctx.fillText(`${entries.length === 0 ? 0 : codexScroll + 1}-${Math.min(entries.length, codexScroll + 7)} / ${entries.length}  ·  ↑/↓ Browse  ·  ←/→ Change tab`, canvas.width / 2, 480);
  ctx.fillStyle = '#a5c79b';
  ctx.fillText('K / ESC / B  ·  Close', canvas.width / 2, 500);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(10, 9, 14, 0.84)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f1dec1';
  ctx.textAlign = 'center';
  ctx.font = 'bold 38px Georgia';
  ctx.fillText('THE SANCTUM CLAIMS YOU', canvas.width / 2, canvas.height / 2 - 24);
  ctx.font = '18px Arial';
  ctx.fillText(`Score ${score}  •  Floor ${currentFloor}`, canvas.width / 2, canvas.height / 2 + 14);
  ctx.fillText('Press Enter to choose a delver', canvas.width / 2, canvas.height / 2 + 52);
}

function draw() {
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
  const shake = getCameraShakeOffset();
  camera.x = clamp(player.x - canvas.width / 2, 0, Math.max(0, ROOM_W - canvas.width));
  camera.y = clamp(player.y - canvas.height / 2, 0, Math.max(0, ROOM_H - canvas.height));
  ctx.save();
  ctx.translate(shake.x - Math.round(camera.x), shake.y - Math.round(camera.y));
  drawWorld();
  ctx.restore();
  if (mode === 'playing') {
    drawMinimap();
    drawGameHud();
  }
  if (mode === 'paused') drawPauseOverlay();
  if (showMap) drawMap();
  if (showStoryJournal) drawStoryJournal();
  if (mode === 'gameover') drawGameOver();
  if (mode === 'won') {
    ctx.fillStyle = 'rgba(10, 9, 14, 0.84)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f1dec1';
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px Georgia';
    ctx.fillText('THE MANA FLOWS AGAIN', canvas.width / 2, canvas.height / 2 - 18);
    ctx.font = '18px Arial';
    ctx.fillText('Press Enter to return to character selection', canvas.width / 2, canvas.height / 2 + 28);
  }

  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(10, 9, 14, 0.82)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f1dec1';
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px Georgia';
    ctx.fillText('DESCENT PAUSED', canvas.width / 2, canvas.height / 2 - 50);
    ctx.font = '17px Arial';
    ctx.fillText('Start or A · Resume', canvas.width / 2, canvas.height / 2);
    ctx.fillText('B · Save and exit to title', canvas.width / 2, canvas.height / 2 + 34);
    ctx.fillText('V / R3 · Toggle music', canvas.width / 2, canvas.height / 2 + 68);
    ctx.fillText('Your rooms and progress are saved automatically.', canvas.width / 2, canvas.height / 2 + 98);
  }
}

function drawStoryJournal() {
  ctx.save();
  ctx.fillStyle = 'rgba(12, 14, 18, 0.94)';
  ctx.fillRect(72, 35, canvas.width - 144, canvas.height - 70);
  ctx.strokeStyle = '#aab98a';
  ctx.lineWidth = 2;
  ctx.strokeRect(72, 35, canvas.width - 144, canvas.height - 70);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.fillText(`FIELD JOURNAL  /  ${currentFloorTheme().name}`, 104, 78);
  ctx.fillStyle = '#f2e3c4';
  ctx.font = 'bold 25px Georgia';
  ctx.fillText('Roadside notes', 104, 116);
  let y = 157;
  for (const entry of storyLog.slice(-6)) {
    ctx.fillStyle = '#d9bd83';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(entry.title, 106, y);
    y += 22;
    ctx.fillStyle = '#d6d0be';
    ctx.font = '14px Arial';
    const lines = wrapCanvasText(entry.text, 106, y, canvas.width - 212, 20);
    y += lines * 20 + 18;
    if (y > canvas.height - 105) break;
  }
  ctx.fillStyle = '#b9c8b3';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('J / left-stick click · Close journal', canvas.width / 2, canvas.height - 68);
  ctx.restore();
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.1);
  lastTime = timestamp;
  resetConfirmTimer = Math.max(0, resetConfirmTimer - dt);
  if (chapterQueue.length > 0 && !activeChapter && (mode === 'select' ||
      (mode === 'playing' && enemies.length === 0 && !showMap && !showStoryJournal))) {
    openChapter();
  }
  pollGamepad();
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function applyGamepadDeadzone(value) {
  const deadzone = 0.22;
  const magnitude = Math.abs(value);
  return magnitude <= deadzone ? 0 : Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

function pollGamepad() {
  const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const gamepad = Array.from(gamepads).find((candidate) => candidate?.connected &&
    (candidate.mapping === 'standard' || (candidate.axes.length >= 4 && candidate.buttons.length >= 10)));
  if (!gamepad) {
    if (gamepadInput.connected) showMessage('Controller disconnected.', 2);
    gamepadInput.connected = false;
    gamepadInput.moveX = 0;
    gamepadInput.moveY = 0;
    gamepadInput.dpadX = 0;
    gamepadInput.dpadY = 0;
    gamepadInput.dpadFacing = false;
    gamepadInput.shoot = false;
    gamepadInput.aimActive = false;
    previousGamepadButtons.clear();
    previousMenuDirection = 0;
    return;
  }

  if (!gamepadInput.connected) {
    showMessage('Controller: LS moves and faces, X or RS fires, A interacts, B bombs, Y item, Start pauses.', 4);
  }
  gamepadInput.connected = true;

  const previousButtons = previousGamepadButtons.get(gamepad.index) || [];
  const isButtonDown = (buttonIndex) => Boolean(gamepad.buttons[buttonIndex]?.pressed ||
    gamepad.buttons[buttonIndex]?.value > 0.5);
  const wasButtonPressed = (buttonIndex) => isButtonDown(buttonIndex) && !previousButtons[buttonIndex];
  if (gamepad.axes.some((axis) => Math.abs(axis) > 0.25) ||
      gamepad.buttons.some((button) => button.pressed || button.value > 0.5)) {
    lastInputMode = 'controller';
    updateControlsHint();
  }
  if (gamepad.buttons.some((button, index) => (button.pressed || button.value > 0.5) && !previousButtons[index])) {
    startGameMusic();
  }
  if (wasButtonPressed(11)) toggleGameMusic();
  const horizontalAxis = applyGamepadDeadzone(gamepad.axes[0] || 0);
  const verticalAxis = applyGamepadDeadzone(gamepad.axes[1] || 0);
  const dpadX = (isButtonDown(15) ? 1 : 0) - (isButtonDown(14) ? 1 : 0);
  const dpadY = (isButtonDown(13) ? 1 : 0) - (isButtonDown(12) ? 1 : 0);
  gamepadInput.dpadX = dpadX;
  gamepadInput.dpadY = dpadY;
  gamepadInput.dpadFacing = dpadX !== 0 || dpadY !== 0;
  gamepadInput.moveX = horizontalAxis || dpadX;
  gamepadInput.moveY = verticalAxis || dpadY;

  const aimX = applyGamepadDeadzone(gamepad.axes[2] || 0);
  const aimY = applyGamepadDeadzone(gamepad.axes[3] || 0);
  const aimingWithRightStick = Math.hypot(aimX, aimY) > 0;
  gamepadInput.aimActive = aimingWithRightStick;
  gamepadInput.shoot = mode === 'playing' && (isButtonDown(2) || isButtonDown(7) || aimingWithRightStick);
  if (aimingWithRightStick) {
    const aimLength = Math.hypot(aimX, aimY);
    gamepadInput.aimX = aimX / aimLength;
    gamepadInput.aimY = aimY / aimLength;
  }
  if (mode === 'playing') {
    const leftStickActive = Math.hypot(horizontalAxis, verticalAxis) > 0;
    const facingX = aimingWithRightStick ? aimX : dpadX !== 0 || dpadY !== 0 ? dpadX : leftStickActive ? horizontalAxis : 0;
    const facingY = aimingWithRightStick ? aimY : dpadX !== 0 || dpadY !== 0 ? dpadY : leftStickActive ? verticalAxis : 0;
    const facingLength = Math.hypot(facingX, facingY);
    if (facingLength > 0) {
      player.lookX = facingX / facingLength;
      player.lookY = facingY / facingLength;
    }
  }
  if (gamepadInput.aimActive && mode === 'playing') {
    pointer.x = player.x - camera.x + gamepadInput.aimX * canvas.width;
    pointer.y = player.y - camera.y + gamepadInput.aimY * canvas.height;
  }

  const menuDirection = dpadX || (Math.abs(horizontalAxis) > 0.6 ? Math.sign(horizontalAxis) : 0);
  if (mode === 'prologue' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
    advancePrologue(menuDirection);
  } else if (mode === 'select' && menuDirection !== 0 && menuDirection !== previousMenuDirection) {
    chooseCharacter(menuDirection > 0 ? 'ArrowRight' : 'ArrowLeft');
  }
  previousMenuDirection = mode === 'select' || mode === 'prologue' ? menuDirection : 0;
  const menuVertical = dpadY || (Math.abs(verticalAxis) > 0.6 ? Math.sign(verticalAxis) : 0);
  if (mode === 'select' && menuVertical !== 0 && menuVertical !== previousMenuVertical) moveMenuFocus(menuVertical);
  previousMenuVertical = mode === 'select' ? menuVertical : 0;

  if (mode === 'prologue') {
    if (wasButtonPressed(0) || wasButtonPressed(9)) advancePrologue(1);
    if (wasButtonPressed(1)) advancePrologue(-1);
  } else if (mode === 'select') {
    if (wasButtonPressed(0) || wasButtonPressed(2) || wasButtonPressed(9)) activateMenuFocus();
    if (wasButtonPressed(5)) openCodex();
  } else if (mode === 'codex') {
    if (wasButtonPressed(0) || wasButtonPressed(1) || wasButtonPressed(9)) closeCodex();
    if (wasButtonPressed(4) || wasButtonPressed(5)) toggleCodexTab();
    if (dpadY !== 0) {
      codexScroll = clamp(codexScroll + (dpadY > 0 ? 1 : -1), 0, Math.max(0, codexEntries().length - 7));
    }
  } else if (mode === 'chapter') {
    if (wasButtonPressed(0) || wasButtonPressed(1) || wasButtonPressed(9)) closeChapter();
  } else if (mode === 'paused') {
    if (wasButtonPressed(0) || wasButtonPressed(9)) resumeGame();
    else if (wasButtonPressed(1)) exitToTitle();
  } else if (mode === 'gameover' || mode === 'won') {
    if (wasButtonPressed(0) || wasButtonPressed(9)) {
      mode = 'select';
      selectedIndex = 0;
      updateHud();
    }
  } else if (mode === 'playing') {
    if (wasButtonPressed(9)) pauseGame();
    if (wasButtonPressed(10)) showStoryJournal = !showStoryJournal;
    if (wasButtonPressed(0)) interact();
    if (wasButtonPressed(1)) {
      if (currentRoom.type === 'bank' && distanceBetween(player, { x: ROOM_W / 2, y: ROOM_H / 2 }) < 240) {
        interact(true);
      } else {
        placeBomb();
      }
    }
    if (wasButtonPressed(3)) useConsumable();
    if (wasButtonPressed(6)) useFrostNova();
    if (wasButtonPressed(4)) cycleMagicElement();
    if (wasButtonPressed(5)) cycleCombatStyle();
    if (wasButtonPressed(8)) showMap = !showMap;
  }

  previousGamepadButtons.set(gamepad.index, gamepad.buttons.map((button) => button.pressed || button.value > 0.5));
}

function chooseCharacter(key) {
  const delta = key === 'ArrowRight' || key === 'd' ? 1 : -1;
  selectedIndex = (selectedIndex + delta + characterRoster.length) % characterRoster.length;
  updateHud();
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  lastInputMode = 'keyboard';
  updateControlsHint();
  startGameMusic();
  keys[event.key] = true;
  keys[key] = true;
  if (event.repeat) return;
  if (event.key === ' ' || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
  if (key === 'v') {
    toggleGameMusic();
    return;
  }
  if (key === 'j' && mode === 'playing') {
    showStoryJournal = !showStoryJournal;
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
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') toggleCodexTab();
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      codexScroll = clamp(codexScroll + direction, 0, Math.max(0, codexEntries().length - 7));
    }
    return;
  }

  if (mode === 'paused') {
    if (key === 'p' || event.key === 'Escape' || key === 'r') resumeGame();
    else if (key === 'x') exitToTitle();
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
    if (event.key === 'Delete') requestProgressReset();
    if (event.key === 'Enter') beginRun();
    return;
  }
  if (mode === 'gameover' && event.key === 'Enter') {
    mode = 'select';
    selectedIndex = 0;
    updateHud();
    return;
  }
  if (mode === 'won' && event.key === 'Enter') {
    mode = 'select';
    selectedIndex = 0;
    updateHud();
    return;
  }
  if (key === 'b') placeBomb();
  if (mode === 'playing' && key === 'q') useConsumable();
  if (mode === 'playing' && key === 'f') cycleCombatStyle();
  if (mode === 'playing' && key === 't') cycleMagicElement();
  if (mode === 'playing' && key === 'c') useFrostNova();
  if (key === 'e') interact(event.shiftKey);
  if (key === 'm' && mode === 'playing') showMap = !showMap;
  if (event.key === ' ') shoot();
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  keys[event.key] = false;
  keys[key] = false;
});

function clearHeldInputs() {
  for (const key of Object.keys(keys)) keys[key] = false;
  pointer.down = false;
  gamepadInput.moveX = 0;
  gamepadInput.moveY = 0;
  gamepadInput.shoot = false;
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
  lastInputMode = 'keyboard';
  updateControlsHint();
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  pointer.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
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
    canvas.style.cursor = overCard || overStart || overCodex ? 'pointer' : 'default';
  } else {
    canvas.style.cursor = 'crosshair';
  }
}

canvas.addEventListener('pointermove', updatePointerPosition);
canvas.addEventListener('pointerdown', (event) => {
  if (mode === 'codex') {
    if (pointer.y >= 132 && pointer.y <= 160) {
      codexTab = pointer.x < 196 ? 'items' : 'enemies';
      codexScroll = 0;
    } else if (pointer.y > canvas.height - 68) {
      closeCodex();
    }
    return;
  }
  if (event.button !== 0 || !event.isPrimary) return;
  lastInputMode = 'keyboard';
  updateControlsHint();
  startGameMusic();
  updatePointerPosition(event);
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
  if (mode === 'select') {
    const codex = codexButtonBounds();
    if (pointer.x >= codex.x && pointer.x <= codex.x + codex.width &&
        pointer.y >= codex.y && pointer.y <= codex.y + codex.height) {
      openCodex();
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
      beginRun();
      return;
    }
    if (mode === 'paused') {
      if (pointer.y < canvas.height / 2 + 14) resumeGame();
      else exitToTitle();
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
});
canvas.addEventListener('pointercancel', clearHeldInputs);
canvas.addEventListener('lostpointercapture', () => {
  pointer.down = false;
});

updateHud();
messageEl.textContent = hasSavedRun()
  ? 'Read the prologue before choosing a delver or resuming your saved descent.'
  : 'Read the prologue before choosing a delver.';
startPrologueNarration();
window.addEventListener('pagehide', () => {
  persistSave();
  saveRunState();
});
requestAnimationFrame(loop);
