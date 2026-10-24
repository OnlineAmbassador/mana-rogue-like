const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statsEl = document.getElementById('stats');
const messageEl = document.getElementById('message');

const ROOM_WALL_THICKNESS = 64;
const DOORWAY_HALF_WIDTH = 64;
const PLAYER_VISUAL_HALF_WIDTH = 24;
const PLAYER_VISUAL_HEIGHT = 80;
const WALL_COLLISION_PADDING = 8;
const PROFILE_STORAGE_KEY = 'mana-hollow-sanctum-save';
const BANK_STORAGE_KEY = 'mana-hollow-sanctum-bank';
const RUN_STORAGE_KEY = 'mana-hollow-sanctum-run';
const assetRoot = 'assets/tmw/clientdata/graphics';
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

const heartImage = loadAsset('items/equipment/charms/heart-of-isis.png');
const stoneImage = loadAsset('items/equipment/ammo/stoneprojectile-icon.png');
const sacredRoomTiles = loadAsset('tiles/desert_castle_interior.png');
const castleWallTiles = loadAsset('tiles/desert_castle.png');
const desertObstacleTiles = loadAsset('tiles/desert1.png');
const sacredRoomFloorTileIds = [65, 49, 81];
const castleWallTileIds = [16, 17, 18];
const terrainTiles = {
  1: { image: loadAsset('tiles/desert2.png'), tileIds: [100] },
  2: { image: loadAsset('tiles/woodland_ground.png'), tileIds: [32] },
  3: { image: sacredRoomTiles, tileIds: sacredRoomFloorTileIds },
};
const humanoidSprites = {
  male: loadAsset('sprites/model/male.png'),
  female: loadAsset('sprites/model/female.png'),
  neutral: loadAsset('sprites/model/neutral.png'),
};
const headSprites = {
  wanderer: { image: loadAsset('sprites/hairstyles/hairstyle01.png'), frameWidth: 40, frameHeight: 40 },
  arcanist: { image: loadAsset('sprites/hairstyles/hairstyle20.png'), frameWidth: 40, frameHeight: 40 },
  warden: { image: loadAsset('sprites/hairstyles/hairstyle02.png'), frameWidth: 40, frameHeight: 40 },
  keeper: { image: loadAsset('sprites/hairstyles/hairstyle03.png'), frameWidth: 40, frameHeight: 40 },
};
const clothingSprites = {
  silkShorts: { image: loadAsset('sprites/equipment/legs/shorts-female.png'), frameWidth: 64, frameHeight: 64 },
  leatherLegguards: { image: loadAsset('sprites/equipment/legs/assassin-female.png'), frameWidth: 64, frameHeight: 64 },
  leatherVest: { image: loadAsset('sprites/equipment/chest/leather-female.png'), frameWidth: 64, frameHeight: 64 },
};
const monsterSprites = {
  ratto: { image: loadAsset('sprites/monsters/ratto.png'), frameWidth: 32, frameHeight: 32, scale: 1.35, frames: [22, 23, 24, 21] },
  croc: { image: loadAsset('sprites/monsters/croc.png'), frameWidth: 30, frameHeight: 22, scale: 1.65, frames: [1, 0, 2, 0] },
  wisp: { image: loadAsset('sprites/monsters/wisp.png'), frameWidth: 64, frameHeight: 64, scale: 1.1, frames: [0, 1, 2, 3, 4] },
  jacko: { image: loadAsset('sprites/monsters/ghost-pumpkin.png'), frameWidth: 60, frameHeight: 60, scale: 2, frames: [0, 1, 2, 12, 13, 14] },
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
};
const obstacleSprites = [
  { image: loadAsset('sprites/monsters/logmonster.png'), frameWidth: 45, frameHeight: 43, frames: [0, 6, 12, 18], scale: 1.55, hp: 1, radius: 23, type: 'solid' },
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
const shopItemCatalog = [
  { id: 'pearl', name: 'Mana Pearl', description: 'Larger, stronger tears', cost: 5, kind: 'passive' },
  { id: 'prism', name: 'Prism Shard', description: 'Fire three-way bursts', cost: 8, kind: 'passive' },
  { id: 'feather', name: 'Swift Feather', description: 'Fire tears faster', cost: 6, kind: 'passive' },
  { id: 'frost-rune', name: 'Frost Rune', description: 'Freeze nearby foes; slows bosses (C)', cost: 9, kind: 'ability' },
  { id: 'learn-magic', name: 'Spell-Scribe', description: 'Learn to cast magic tears', cost: 7, kind: 'skill', style: 'magic' },
  { id: 'learn-brawl', name: 'Brawler’s Wraps', description: 'Learn a close-range strike', cost: 7, kind: 'skill', style: 'melee' },
  { id: 'learn-bow', name: 'Trail-Worn Bow', description: 'Learn to fire arrows', cost: 7, kind: 'skill', style: 'bow' },
  { id: 'iron-sword', name: 'Iron Sword', description: 'A longer, heavier melee strike', cost: 7, kind: 'weapon', style: 'melee', weapon: 'sword' },
  { id: 'swift-daggers', name: 'Swift Daggers', description: 'Quick, close twin strikes', cost: 7, kind: 'weapon', style: 'melee', weapon: 'daggers' },
  { id: 'silk-shorts', name: 'Silk Shorts', description: 'Light legs increase movement speed', cost: 6, kind: 'clothing', slot: 'legs', sprite: 'silkShorts', speedBonus: 32, armorBonus: 0 },
  { id: 'leather-legguards', name: 'Leather Legguards', description: 'Heavy legs slow you down but absorb two hits', cost: 8, kind: 'clothing', slot: 'legs', sprite: 'leatherLegguards', speedBonus: -18, armorBonus: 2 },
  { id: 'leather-vest', name: 'Leather Vest', description: 'A sturdy vest that absorbs one hit', cost: 7, kind: 'clothing', slot: 'chest', sprite: 'leatherVest', speedBonus: 0, armorBonus: 1 },
  { id: 'ratto-companion', name: 'Ratto Familiar', description: 'A friend that fires at foes', cost: 8, kind: 'companion', companion: 'ratto' },
  { id: 'wisp-companion', name: 'Wisp Familiar', description: 'A friend that fires at foes', cost: 10, kind: 'companion', companion: 'wisp' },
  { id: 'croc-companion', name: 'Croc Familiar', description: 'A friend that fires at foes', cost: 10, kind: 'companion', companion: 'croc' },
  { id: 'mana-tonic', name: 'Mana Tonic', description: 'Restore two health with Q', cost: 4, kind: 'consumable' },
  { id: 'bomb-bundle', name: 'Bomb Bundle', description: 'Gain two bombs with Q', cost: 4, kind: 'consumable' },
  { id: 'mana-burst', name: 'Mana Burst', description: 'Blast all foes with Q', cost: 6, kind: 'consumable' },
];

const characterRoster = [
  { id: 'wanderer', name: 'Mage', className: 'Mage', startingStyle: 'magic', styleLabel: 'Magic tears', sprite: 'male', color: '#75d8ff', hue: 0, speed: 235, hp: 6, damage: 1, unlock: 'Available' },
  { id: 'arcanist', name: 'Warrior', className: 'Warrior', startingStyle: 'melee', styleLabel: 'Hand-to-hand', sprite: 'female', color: '#d7a8ff', hue: 95, speed: 210, hp: 8, damage: 2, unlock: 'Defeat a floor boss' },
  { id: 'warden', name: 'Rogue', className: 'Rogue', startingStyle: 'bow', styleLabel: 'Bow and arrows', sprite: 'neutral', color: '#fbd96f', hue: 205, speed: 250, hp: 5, damage: 1, unlock: 'Find a secret room' },
];
const keys = {};
const pointer = { x: canvas.width / 2, y: canvas.height / 2, down: false };

let mode = 'select';
let selectedIndex = 0;
let character;
let currentFloor = 1;
const finalFloor = 3;
let score = 0;
let coins = 0;
let keysHeld = 0;
let bombsHeld = 3;
let rooms = [];
let currentRoom;
let storyText = '';
let showMap = false;
let lastTime = 0;
let elapsed = 0;
let messageTimer = 0;
let autosaveTimer = 0;
let frostNovaCooldown = 0;

const weapon = {
  tearSize: 1,
  shotCount: 1,
  fireDelay: 0.23,
  projectileSpeed: 480,
  damageBonus: 0,
};
let activeCombatStyle = 'magic';
const ownedItems = new Set();
const combatStyles = new Set();
const meleeWeapons = new Set(['hands']);
const reservedUpgradeIds = new Set();
const consumables = [];
const equippedClothing = { legs: null, chest: null };

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 12,
  speed: 235,
  hp: 6,
  maxHp: 6,
  damage: 1,
  armor: 0,
  fireCooldown: 0,
  invuln: 0,
  lookX: 1,
  lookY: 0,
  moving: false,
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getSave() {
  let storedSave;
  try {
    storedSave = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
  } catch (error) {
    messageEl.textContent = 'Progress could not be read from browser storage; unlocks last for this visit.';
    return { arcanist: false, warden: false, bankedZenny: 0 };
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
    bankedZenny,
  };
}

const save = getSave();

function persistSave() {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(save));
  } catch (error) {
    messageEl.textContent = 'Progress could not be saved by this browser.';
  }
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

function updateHud() {
  if (!character) {
    statsEl.textContent = `Floor ${currentFloor} | Choose a delver`;
    return;
  }
  statsEl.textContent =
    `${character.className} • Lead: ${activeCombatStyle} [F] | Zenny: ${coins} | Bank: ${save.bankedZenny}`;
}

function showMessage(text, seconds = 2.5) {
  messageEl.textContent = text;
  messageTimer = seconds;
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

function createShopStock() {
  const available = shopItemCatalog.filter((item) =>
    item.kind === 'consumable' ||
      (!reservedUpgradeIds.has(item.id) && (item.kind === 'skill'
        ? !combatStyles.has(item.style)
        : !ownedItems.has(item.id))),
  );
  for (let i = available.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [available[i], available[swapIndex]] = [available[swapIndex], available[i]];
  }
  return available.slice(0, 3).map((item) => ({
    ...item,
    cost: Math.min(15, item.cost + Math.max(0, currentFloor - 1) * 2),
    purchased: false,
  }));
}

function createRoom(x, y, type = 'normal') {
  return {
    x,
    y,
    type,
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
    rewardClaimed: false,
    shopStock: null,
    rewardUpgrade: null,
    runtime: null,
  };
}

function roomKey(room) {
  return `${currentFloor}:${room.x},${room.y}`;
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
    rewardClaimed: room.rewardClaimed,
    shopStock: room.shopStock?.map(({ id, purchased }) => ({ id, purchased })) || null,
    rewardUpgrade: room.rewardUpgrade,
    secretExit: room.secretExit ? {
      direction: room.secretExit.direction,
      x: room.secretExit.room.x,
      y: room.secretExit.room.y,
    } : null,
    returnTo: room.returnTo ? { x: room.returnTo.x, y: room.returnTo.y } : null,
    returnDirection: room.returnDirection,
    runtime: room.runtime,
  }));
  return {
    version: 1,
    characterId: character.id,
    floor: currentFloor,
    currentRoom: { x: currentRoom.x, y: currentRoom.y },
    rooms: roomRecords,
    player: {
      x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
      speed: player.speed, damage: player.damage, armor: player.armor,
      lookX: player.lookX, lookY: player.lookY,
      fireCooldown: player.fireCooldown, invuln: player.invuln,
    },
    score,
    coins,
    keysHeld,
    bombsHeld,
    weapon,
    ownedItems: [...ownedItems],
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
  selectedIndex = characterRoster.indexOf(character);
  currentFloor = saved.floor;
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
  Object.assign(player, saved.player);
  score = saved.score || 0;
  coins = saved.coins || 0;
  keysHeld = saved.keysHeld || 0;
  bombsHeld = saved.bombsHeld || 0;
  Object.assign(weapon, saved.weapon);
  ownedItems.clear();
  for (const id of saved.ownedItems || []) ownedItems.add(id);
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
  showMessage('Paused. Press P or Esc to resume; X saves and exits.', 9999);
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
  1: { name: 'Candor Desert', wall: '#46352e', trim: '#d2a866', detail: '#f2d28c' },
  2: { name: 'Hurnscald Forest', wall: '#263a32', trim: '#90ae70', detail: '#c8d78c' },
  3: { name: 'Artis Quake Vault', wall: '#252630', trim: '#a86c67', detail: '#e0aa72' },
};

function createUpgradeReward(idSuffix, dungeonRooms) {
  const upgrades = shopItemCatalog.filter((item) =>
    ['passive', 'skill', 'weapon', 'clothing', 'ability'].includes(item.kind) &&
    (item.kind === 'skill' ? !combatStyles.has(item.style) : !ownedItems.has(item.id)) &&
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
  if (Math.random() < 0.3) {
    secret.rewardUpgrade = createUpgradeReward(`floor-${currentFloor}-secret`, [...occupied.values()]);
  }

  for (const source of randomize(mainPath.filter((room) => room.type === 'normal' && room.x >= 1 && room.x <= 5))) {
    if (Math.random() < 0.45) attachRoom([source], 'normal');
  }

  return { rooms: [...occupied.values()], startRoom };
}

function createEnemy(kind, x, y, boss = false) {
  const specs = {
    ratto: { radius: 12, speed: 65, hp: 3, color: '#dbb77b', archetype: 'leaper', leapMultiplier: 3.8, leapDuration: 0.28, leapCooldown: 1.9, leapWindup: 0.18, leapHeight: 13 },
    croc: { radius: 16, speed: 42, hp: 6, color: '#90bd7c', archetype: 'charger' },
    wisp: { radius: 11, speed: 54, hp: 3, color: '#b8a5ff', archetype: 'ranged' },
    jacko: { radius: 38, speed: 58, hp: 1700, color: '#ef9d38', archetype: 'boss', tripleShot: true },
    'spider-queen': { radius: 48, speed: 46, hp: 1000, color: '#b7766e', archetype: 'boss', tripleShot: true },
    golem: { radius: 52, speed: 35, hp: 1200, color: '#bd8c68', archetype: 'boss', tripleShot: true },
    bat: { radius: 15, speed: 105, hp: 4, color: '#9386bd', archetype: 'diver' },
    bluepar: { radius: 18, speed: 48, hp: 5, color: '#83c9ee', archetype: 'ranged', tripleShot: true },
    frog: { radius: 14, speed: 75, hp: 4, color: '#8fd37b', archetype: 'leaper', leapMultiplier: 5, leapDuration: 0.55, leapCooldown: 2.7, leapWindup: 0.42, leapHeight: 30 },
    mouboo: { radius: 25, speed: 39, hp: 9, color: '#d3d3c7', archetype: 'charger' },
    skeleton: { radius: 18, speed: 42, hp: 8, color: '#d7d4c8', archetype: 'ranged', bombTosser: true, bombWindup: 0.92, bombRadius: 94, bombFuse: 1.2 },
    slime: { radius: 18, speed: 35, hp: 5, color: '#88d68d', archetype: 'leaper', leapMultiplier: 2.4, leapDuration: 0.6, leapCooldown: 3.2, leapWindup: 0.6, leapHeight: 8 },
    snake: { radius: 17, speed: 50, hp: 5, color: '#d4b875', archetype: 'ranged', tripleShot: true, bombTosser: true },
    spider: { radius: 17, speed: 63, hp: 5, color: '#aaa3b3', archetype: 'stalker' },
  };
  const spec = specs[kind];
  const floorProgress = Math.max(0, currentFloor - 1);
  const bossHp = Math.ceil((1050 + currentFloor * 100) * (1 + floorProgress * 0.45));
  const enemyHp = Math.ceil(spec.hp * (1 + floorProgress * 0.2));
  const maxHp = boss ? Math.ceil(bossHp / (kind === 'jacko' ? 3 : 1)) : enemyHp;
  return {
    x,
    y,
    kind,
    radius: spec.radius,
    speed: spec.speed * (1 + floorProgress * (boss ? 0.14 : 0.08)),
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
    bombWindup: spec.bombWindup || 0.7,
    bombRadius: spec.bombRadius || 86,
    bombFuse: spec.bombFuse || 1.05,
    leapMultiplier: spec.leapMultiplier || 3.4,
    leapDuration: spec.leapDuration || 0.42,
    leapCooldown: spec.leapCooldown || 2.1,
    leapWindup: spec.leapWindup || 0.3,
    leapHeight: spec.leapHeight || 18,
    title: kind === 'jacko' ? 'JACKO, GHOST PUMPKIN'
      : kind === 'spider-queen' ? 'SPIDER QUEEN' : kind === 'golem' ? 'ANCIENT GOLEM' : '',
    phase: boss ? 1 : 0,
    behavior: boss ? 'jacko-idle' : spec.archetype === 'leaper' ? 'crawl'
      : spec.archetype === 'charger' ? 'patrol' : 'hover',
    stateTimer: Math.random() * 1.5,
    attackCooldown: boss ? 0.9 + Math.random() * 0.5
      : (1 + Math.random() * 1.5) / (1 + floorProgress * 0.12),
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
    attackIndex: 0,
    groundPoundTarget: null,
    chargeHit: false,
  };
}

function isDoorEntrancePosition(x, y, radius = 0) {
  const doorHalfWidth = DOORWAY_HALF_WIDTH + radius + 16;
  const entranceDepth = ROOM_WALL_THICKNESS + radius + 48;
  return (Math.abs(x - canvas.width / 2) <= doorHalfWidth &&
      (y <= entranceDepth || y >= canvas.height - entranceDepth)) ||
    (Math.abs(y - canvas.height / 2) <= doorHalfWidth &&
      (x <= entranceDepth || x >= canvas.width - entranceDepth));
}

function findEnemySpawnPosition(preferredX, preferredY, radius = 18, minimumPlayerDistance = 120, ignoredObstacle = null) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = attempt === 0 && Number.isFinite(preferredX) && Number.isFinite(preferredY)
      ? { x: preferredX, y: preferredY }
      : {
        x: ROOM_WALL_THICKNESS + radius + Math.random() * (canvas.width - 2 * (ROOM_WALL_THICKNESS + radius)),
        y: ROOM_WALL_THICKNESS + radius + Math.random() * (canvas.height - 2 * (ROOM_WALL_THICKNESS + radius)),
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
    { x: 300, y: 230 },
    { x: 660, y: 230 },
    { x: 480, y: 360 },
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
      pickups.push({
        x: obstacle.x,
        y: obstacle.y,
        kind: bombDrop ? 'bomb' : Math.random() < 0.6 ? 'coin' : 'bomb',
        guaranteedTreasure: obstacle.guaranteedDrop === true,
        room: obstacle.room,
      });
    } else {
      const roll = Math.random();
      if (roll < 0.08) pickups.push({ x: obstacle.x, y: obstacle.y, kind: 'coin' });
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

function grantUpgrade(item) {
  if (item.id === 'sanctum-blessing' || item.id.startsWith('sanctum-blessing-')) {
    player.maxHp += 1;
    player.hp = Math.min(player.maxHp, player.hp + 1);
    weapon.damageBonus += 1;
  } else if (item.kind === 'clothing') {
    equipClothing(item);
  } else if (item.id === 'pearl') {
    weapon.tearSize *= 1.45;
    weapon.damageBonus += 1;
  } else if (item.id === 'prism') {
    weapon.shotCount = Math.min(3, weapon.shotCount + 2);
  } else if (item.id === 'feather') {
    weapon.fireDelay = Math.max(0.11, weapon.fireDelay * 0.7);
    weapon.projectileSpeed += 70;
  } else if (item.kind === 'skill') {
    combatStyles.add(item.style);
  } else if (item.kind === 'weapon') {
    combatStyles.add('melee');
    meleeWeapons.add(item.weapon);
  }
  ownedItems.add(item.id);
  reservedUpgradeIds.delete(item.id);
  updateHud();
  showMessage(
    item.kind === 'clothing'
      ? `${item.name} equipped. Speed ${player.speed}; armor ${player.armor}.`
      : `${item.name} acquired. Your mana answers to practice, not birthright.`,
    3,
  );
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

function enemyKindsForCurrentMap() {
  if (currentFloor === 1) return ['ratto', 'croc', 'wisp', 'bat', 'snake', 'slime'];
  if (currentFloor === 2) return ['ratto', 'croc', 'wisp', 'frog', 'spider', 'mouboo', 'bluepar'];
  return ['ratto', 'wisp', 'bat', 'skeleton', 'spider', 'snake', 'slime', 'bluepar'];
}

function bossForCurrentArea() {
  if (currentFloor === 2) return 'spider-queen';
  if (currentFloor === 3) return 'golem';
  return 'jacko';
}

function spawnRoom(room) {
  const wasCleared = room.cleared;
  enemies.length = 0;
  projectiles.length = 0;
  enemyProjectiles.length = 0;
  particles.length = 0;
  pickups.length = 0;
  bombs.length = 0;
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
      (room.type !== 'miniboss' || room.cleared)) {
    pickups.push({ x: canvas.width / 2, y: canvas.height / 2, kind: 'upgrade', item: room.rewardUpgrade, room });
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
        canvas.width * 0.7,
        canvas.height * 0.45,
        bossSpec.frameWidth * bossSpec.scale / 2,
        150,
      );
      if (spawn) enemies.push(createEnemy(bossKind, spawn.x, spawn.y, true));
    } else if (!room.cleared) {
      room.cleared = true;
    }
  } else if (room.type === 'miniboss') {
    if (!room.entered) {
      const miniBoss = createEnemy('croc', canvas.width * 0.68, canvas.height * 0.5);
      miniBoss.miniBoss = true;
      miniBoss.hp = 18 + currentFloor * 3;
      miniBoss.maxHp = miniBoss.hp;
      miniBoss.radius = 24;
      miniBoss.speed *= 0.75;
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
    if (Math.random() >= emptyRoomChance) {
      const count = 1 + currentFloor + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i += 1) {
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const spawn = findEnemySpawnPosition(180 + Math.random() * 600, 120 + Math.random() * 300);
        if (spawn) enemies.push(createEnemy(kind, spawn.x, spawn.y));
      }
    }
    const availableObstacles = obstacleSpritesByFloor[currentFloor] || obstacleSpritesByFloor[3];
    const obstacleCount = Math.floor(Math.random() * (Math.min(3, currentFloor + 1) + 1));
    for (let i = 0; i < obstacleCount; i += 1) {
      const sprite = availableObstacles[Math.floor(Math.random() * availableObstacles.length)];
      let position;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const candidate = { x: 120 + Math.random() * 720, y: 100 + Math.random() * 340 };
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

  if (room.type === 'start' && currentFloor === 1) {
    storyText = 'From the desert edge of Candor, a trail of fading mana leads toward the old roads. Every delver may learn every art.';
  } else if (room.type === 'start' && currentFloor === 2) {
    storyText = 'Hurnscald’s forest roads grow quiet as the fading mana trail leads east.';
  } else if (room.type === 'start' && currentFloor === 3) {
    storyText = 'Beneath Artis, old accounts of the Great Quake echo through the sealed vault.';
  } else if (room.type === 'boss') {
    storyText = 'The corridor ends at the castle gate. A guardian stirs beyond the seal.';
  } else if (room.type === 'miniboss') {
    storyText = 'A powerful sentinel guards this optional side chamber.';
  } else if (room.type === 'secret') {
    storyText = 'A sacred chamber rests undisturbed, its hidden relics holding a gift. Disturb them at your own risk.';
    if (!save.warden) {
      save.warden = true;
      persistSave();
      showMessage('Secret found: Rogue is now selectable.', 4);
    }
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
  if (storyText) showMessage(storyText, 5);
  saveRunState();
}

function beginRun() {
  const entry = characterRoster[selectedIndex];
  if ((entry.id === 'arcanist' && !save.arcanist) || (entry.id === 'warden' && !save.warden)) return;

  character = entry;
  canvas.style.cursor = 'crosshair';
  player.maxHp = entry.hp;
  player.hp = entry.hp;
  player.speed = entry.speed;
  player.damage = entry.damage;
  player.armor = 0;
  equippedClothing.legs = null;
  equippedClothing.chest = null;
  weapon.tearSize = 1;
  weapon.shotCount = 1;
  weapon.fireDelay = 0.23;
  weapon.projectileSpeed = 480;
  weapon.damageBonus = 0;
  frostNovaCooldown = 0;
  ownedItems.clear();
  combatStyles.clear();
  meleeWeapons.clear();
  meleeWeapons.add('hands');
  reservedUpgradeIds.clear();
  combatStyles.add(entry.startingStyle);
  activeCombatStyle = entry.startingStyle;
  consumables.length = 0;
  companions.length = 0;
  player.meleeSwings = [];
  player.radius = 12;
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  player.fireCooldown = 0;
  player.invuln = 0;
  currentFloor = 1;
  score = 0;
  coins = 0;
  keysHeld = 0;
  bombsHeld = 3;
  showMap = false;
  autosaveTimer = 0;
  const generated = generateDungeon();
  rooms = generated.rooms;
  currentRoom = generated.startRoom;
  mode = 'playing';
  spawnRoom(currentRoom);
  saveRunState();
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
    const sideClearance = ROOM_WALL_THICKNESS + PLAYER_VISUAL_HALF_WIDTH + WALL_COLLISION_PADDING;
    const verticalClearance = ROOM_WALL_THICKNESS + player.radius + WALL_COLLISION_PADDING;
    const topClearance = ROOM_WALL_THICKNESS + PLAYER_VISUAL_HEIGHT + WALL_COLLISION_PADDING;
    player.x = direction === 'left' ? canvas.width - sideClearance
      : direction === 'right' ? sideClearance : canvas.width / 2;
    player.y = direction === 'up' ? canvas.height - verticalClearance
      : direction === 'down' ? topClearance : canvas.height / 2;
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

function shoot() {
  if (mode !== 'playing' || player.fireCooldown > 0) return;
  const baseAngle = Math.atan2(pointer.y - player.y, pointer.x - player.x);
  player.lookX = Math.cos(baseAngle);
  player.lookY = Math.sin(baseAngle);
  const learnedStyles = [...combatStyles];
  if (combatStyles.has('melee')) {
    const ownedWeapons = [...meleeWeapons];
    const strikeRange = Math.max(...ownedWeapons.map((item) => item === 'sword' ? 92 : item === 'daggers' ? 53 : 66));
    const damage = player.damage + weapon.damageBonus +
      ownedWeapons.reduce((bonus, item) => bonus + (item === 'sword' ? 2 : item === 'daggers' ? 1 : 0), 0);
    for (const enemy of [...enemies]) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy);
      const angleDifference = Math.atan2(Math.sin(Math.atan2(dy, dx) - baseAngle), Math.cos(Math.atan2(dy, dx) - baseAngle));
      if (distance <= strikeRange + enemy.radius && Math.abs(angleDifference) < 0.95 &&
        hasLineOfSight(player, enemy)) damageEnemy(enemy, damage);
    }
    for (let index = breakables.length - 1; index >= 0; index -= 1) {
      const obstacle = breakables[index];
      const dx = obstacle.x - player.x;
      const dy = obstacle.y - player.y;
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
    }));
    addParticles(player.x + Math.cos(baseAngle) * 44, player.y + Math.sin(baseAngle) * 44, '#ffc56b', 7 + ownedWeapons.length * 3, 100);
    updateHud();
  }
  const rangedStyles = learnedStyles.filter((style) => style === 'magic' || style === 'bow');
  for (const style of rangedStyles) {
    const styleOffset = rangedStyles.length > 1 && style !== activeCombatStyle
      ? style === 'magic' ? -0.08 : 0.08
      : 0;
    const spread = weapon.shotCount === 1 ? 0 : 0.16;
    for (let shot = 0; shot < weapon.shotCount; shot += 1) {
      const angle = baseAngle + styleOffset + (shot - (weapon.shotCount - 1) / 2) * spread;
      const vx = Math.cos(angle);
      const vy = Math.sin(angle);
      projectiles.push({
        x: player.x + vx * 18,
        y: player.y + vy * 18,
        vx: vx * weapon.projectileSpeed,
        vy: vy * weapon.projectileSpeed,
        radius: 6 * weapon.tearSize,
        size: weapon.tearSize,
        color: style === 'bow' ? '#d8b577' : weapon.shotCount > 1 ? '#ffc96a' : '#77e8ff',
        type: style === 'bow' ? 'arrow' : 'tear',
        damage: player.damage + weapon.damageBonus,
        ttl: 1.4,
        trailTimer: 0,
      });
    }
  }
  player.fireCooldown = weapon.fireDelay;
  fireCompanionsWithPlayer(baseAngle, rangedStyles);
}

function fireCompanionsWithPlayer(angle, styles) {
  for (const companion of companions) {
    if (companion.hp <= 0) continue;
    const colors = { ratto: '#f0c884', croc: '#9ce28f', wisp: '#c8a6ff' };
    for (const style of styles) {
      projectiles.push({
        x: companion.x,
        y: companion.y,
        vx: Math.cos(angle) * weapon.projectileSpeed,
        vy: Math.sin(angle) * weapon.projectileSpeed,
        radius: 5,
        size: 0.8,
        color: style === 'bow' ? '#d8b577' : colors[companion.kind],
        type: style === 'bow' ? 'arrow' : 'tear',
        damage: Math.max(1, player.damage),
        ttl: 1.2,
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

function fireEnemyProjectile(enemy) {
  const colors = {
    ratto: '#e5bd83', croc: '#8cdb85', wisp: '#c6a1ff', jacko: '#ff9b4a',
    bat: '#bca5e5', bluepar: '#91d8f5', frog: '#a1df79', mouboo: '#e3e1cf',
    skeleton: '#ded8c9', slime: '#8df2a6', snake: '#edcf7e', spider: '#c2bacb',
    'spider-queen': '#d88cba', golem: '#c6b29a',
  };
  const baseAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const count = enemy.boss || enemy.tripleShot ? 3 : 1;
  const spread = enemy.boss && enemy.phase >= 2 ? 0.14 : 0.38;
  const floorProgress = Math.max(0, currentFloor - 1);
  const baseSpeed = enemy.kind === 'wisp' ? 185 : 155;
  const speed = enemy.boss
    ? (enemy.phase >= 2 ? 340 : 255) * (1 + Math.max(0, currentFloor - 1) * 0.18)
    : baseSpeed * (1 + floorProgress * 0.12);
  for (let index = 0; index < count; index += 1) {
    const angle = baseAngle + (index - (count - 1) / 2) * spread;
    enemyProjectiles.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: enemy.kind === 'wisp' ? 8 : 6,
      color: colors[enemy.kind],
      damage: 1,
      ttl: 2.6,
      kind: enemy.kind,
    });
  }
  addParticles(enemy.x, enemy.y, colors[enemy.kind], count * 2, 35);
}

function throwEnemyBomb(enemy) {
  const target = enemy.bombTarget || player;
  const targetX = clamp(target.x, ROOM_WALL_THICKNESS + 18, canvas.width - ROOM_WALL_THICKNESS - 18);
  const targetY = clamp(target.y, ROOM_WALL_THICKNESS + 18, canvas.height - ROOM_WALL_THICKNESS - 18);
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

function fireJackoBurst(enemy, count = enemy.phase >= 2 ? 10 : 8) {
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
  if (distance > 245) {
    moveX += directionX * enemy.speed * 0.45 * movementMultiplier;
    moveY += directionY * enemy.speed * 0.45 * movementMultiplier;
  } else if (distance < 160) {
    moveX -= directionX * enemy.speed * 0.55 * movementMultiplier;
    moveY -= directionY * enemy.speed * 0.55 * movementMultiplier;
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
      const lead = phaseTwo ? 0.28 : 0.42;
      const targetX = clamp(player.x + directionX * player.speed * lead, 82, canvas.width - 82);
      const targetY = clamp(player.y + directionY * player.speed * lead, 82, canvas.height - 82);
      const aimAngle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
      enemy.spiderPounceX = Math.cos(aimAngle);
      enemy.spiderPounceY = Math.sin(aimAngle);
      enemy.spiderPounceTarget = { x: targetX, y: targetY };
      enemy.behavior = 'spider-pounce-windup';
      enemy.stateTimer = phaseTwo ? 0.34 : 0.52;
      enemy.attackCooldown = phaseTwo ? 1.8 : 2.6;
    } else {
      enemy.behavior = 'spider-web-windup';
      enemy.stateTimer = phaseTwo ? 0.38 : 0.68;
      enemy.attackCooldown = phaseTwo ? 2.6 : 3.6;
    }
  }
}

function updateGolemBoss(enemy, dt, directionX, directionY, distance, visible) {
  const phaseTwo = enemy.phase >= 2;
  if (enemy.behavior === 'golem-slam-windup') {
    if (enemy.stateTimer <= 0) {
      const slamTarget = enemy.slamTarget || player;
      const slamRadius = phaseTwo ? 112 : 74;
      if (distanceBetween(slamTarget, player) <= slamRadius) damagePlayer();
      fireEnemyProjectile(enemy);
      if (phaseTwo) fireJackoBurst(enemy, 12);
      enemy.behavior = 'golem-recover';
      enemy.stateTimer = phaseTwo ? 0.42 : 0.55;
      enemy.attackCooldown = phaseTwo ? 2.2 : 3.2;
    }
    return;
  }
  if (enemy.behavior === 'golem-recover') {
    if (enemy.stateTimer <= 0) enemy.behavior = 'jacko-idle';
    return;
  }

  const distanceDirection = distance < 125 ? -1 : distance > 170 ? 1 : 0;
  const movementMultiplier = phaseTwo ? 1.4 : 1;
  moveEnemy(enemy, directionX * enemy.speed * distanceDirection * movementMultiplier,
    directionY * enemy.speed * distanceDirection * movementMultiplier, dt);
  if (visible && enemy.attackCooldown <= 0) {
    enemy.behavior = 'golem-slam-windup';
    enemy.stateTimer = phaseTwo ? 0.42 : 0.78;
    enemy.attackCooldown = phaseTwo ? 2.2 : 3.2;
    enemy.slamTarget = { x: player.x, y: player.y };
  }
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
    if (distance > 270) {
      moveX += directionX * enemy.speed * 0.6 * movementMultiplier;
      moveY += directionY * enemy.speed * 0.6 * movementMultiplier;
    } else if (distance < 190) {
      moveX -= directionX * enemy.speed * 0.65 * movementMultiplier;
      moveY -= directionY * enemy.speed * 0.65 * movementMultiplier;
    }
    moveEnemy(enemy, moveX, moveY, dt);

    if (enemy.summonCooldown <= 0 && enemies.length < 7) {
      enemy.behavior = 'jacko-summon';
      enemy.stateTimer = phaseTwo ? 0.72 : 1;
      enemy.summonCooldown = phaseTwo ? 11 + Math.random() * 4 : 15 + Math.random() * 5;
      enemy.attackCooldown = Math.max(enemy.attackCooldown, 1.2);
    } else if (visible && enemy.attackCooldown <= 0) {
      const attackCount = phaseTwo ? 4 : 3;
      const attack = enemy.attackIndex % attackCount;
      enemy.attackIndex += 1;
      enemy.behavior = attack === 0 ? 'jacko-roll-windup'
        : attack === 1 ? 'jacko-jump-windup'
          : attack === 2 ? 'jacko-shot-windup' : 'jacko-ground-pound-windup';
      enemy.stateTimer = (phaseTwo ? 0.35 : 0.55) + (attack === 0 ? 0.12 : 0);
      enemy.attackCooldown = phaseTwo ? 2.15 + Math.random() * 0.6 : 2.8 + Math.random() * 0.8;
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
        enemy.y = clamp(player.y + (Math.random() - 0.5) * 180, 60, canvas.height - 60);
      } else if (edge === 1) {
        enemy.x = canvas.width + enemy.radius * 2;
        enemy.y = clamp(player.y + (Math.random() - 0.5) * 180, 60, canvas.height - 60);
      } else if (edge === 2) {
        enemy.x = clamp(player.x + (Math.random() - 0.5) * 240, 60, canvas.width - 60);
        enemy.y = -enemy.radius * 2;
      } else {
        enemy.x = clamp(player.x + (Math.random() - 0.5) * 240, 60, canvas.width - 60);
        enemy.y = canvas.height + enemy.radius * 2;
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
    enemy.x = enemy.resetFrom.x + (canvas.width / 2 - enemy.resetFrom.x) * progress;
    enemy.y = enemy.resetFrom.y + (canvas.height / 2 - enemy.resetFrom.y) * progress;
    if (enemy.stateTimer <= 0) {
      enemy.x = canvas.width / 2;
      enemy.y = canvas.height / 2;
      enemy.behavior = 'jacko-idle';
      enemy.attackCooldown = Math.max(enemy.attackCooldown, phaseTwo ? 0.8 : 1.2);
    }
  }
}

function dropLoot(x, y, boss = false) {
  if (boss) {
    pickups.push({ x, y, kind: 'key' });
    return;
  }
  if (Math.random() < 0.55) pickups.push({ x: x + 14, y, kind: 'coin' });
  if (Math.random() < 0.14) pickups.push({ x, y, kind: 'heart' });
  if (Math.random() < 0.08) pickups.push({ x: x - 12, y, kind: 'bomb' });
}

function damageEnemy(enemy, damage) {
  enemy.hp -= damage;
  enemy.hitFlash = 0.1;
  if (enemy.boss && enemy.phase === 1 && enemy.hp <= enemy.maxHp * 0.5) {
    enemy.phase = 2;
    enemy.attackCooldown = Math.min(enemy.attackCooldown, 0.7);
    enemy.summonCooldown = Math.min(enemy.summonCooldown, 4);
    showMessage(`${enemy.title} enters Phase II!`, 3);
    addParticles(enemy.x, enemy.y, '#ff8e38', 24, 150);
  }
  if (enemy.hp <= 0) {
    score += enemy.boss ? 100 : 10;
    dropLoot(enemy.x, enemy.y, enemy.boss);
    if (!enemy.boss && enemy.kind === 'croc' && Math.random() < 0.22 && breakables.length < 8) {
      breakables.push(createBreakableAt(
        clamp(enemy.x + (Math.random() - 0.5) * 48, 90, canvas.width - 90),
        clamp(enemy.y + (Math.random() - 0.5) * 48, 90, canvas.height - 90),
      ));
    }
    const wasBoss = enemy.boss;
    enemies.splice(enemies.indexOf(enemy), 1);
    if (wasBoss) {
      save.arcanist = true;
      persistSave();
      showMessage(enemies.length === 0
        ? `${enemy.title} falls. Warrior is now selectable; the seal opens.`
        : `${enemy.title} falls and unlocks the Warrior. Clear the remaining monsters to open the seal.`, 5);
    }
  }
}

function placeBomb() {
  if (mode !== 'playing' || bombsHeld <= 0 ||
    bombs.some((bomb) => bomb.owner !== 'enemy' && bomb.fuse > 0)) return;
  bombsHeld -= 1;
  bombs.push({ owner: 'player', x: player.x, y: player.y, fuse: 1.7, radius: 110 });
  updateHud();
}

function explodeBomb(bomb) {
  if (bomb.owner === 'enemy') {
    if (distanceBetween(bomb, player) <= bomb.radius && hasLineOfSight(bomb, player)) damagePlayer();
  } else {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      if (distanceBetween(bomb, enemies[i]) <= bomb.radius && hasLineOfSight(bomb, enemies[i])) {
        damageEnemy(enemies[i], 8);
      }
    }
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
      x: direction.name === 'left' ? 24 : direction.name === 'right' ? canvas.width - 24 : bomb.x,
      y: direction.name === 'up' ? 24 : direction.name === 'down' ? canvas.height - 24 : bomb.y,
    };
    const alongWall = direction.dx === 0
      ? Math.abs(bomb.x - canvas.width / 2) < 78
      : Math.abs(bomb.y - canvas.height / 2) < 78;
    if (alongWall && distanceBetween(bomb, wallPoint) < bomb.radius + 60) {
      secret.room.hidden = false;
      showMessage('The cracked wall gives way. A secret room lies beyond.', 4);
    }
  }
}

function isPlayerNearDoor(direction) {
  const verticalDoor = direction === 'up' || direction === 'down';
  const perpendicularPosition = verticalDoor ? player.x : player.y;
  const center = (verticalDoor ? canvas.width : canvas.height) / 2;
  const aligned = Math.abs(perpendicularPosition - center) <=
    DOORWAY_HALF_WIDTH - player.radius - WALL_COLLISION_PADDING;
  const reach = ROOM_WALL_THICKNESS + player.radius + 20;
  const nearWall = direction === 'up' ? player.y <= reach
    : direction === 'down' ? player.y >= canvas.height - reach
      : direction === 'left' ? player.x <= reach
        : player.x >= canvas.width - reach;
  return aligned && nearWall;
}

function interact(withdrawFromBank = false) {
  if (mode !== 'playing') return;
  if (currentRoom.type === 'boss' && currentRoom.cleared) {
    if (distanceBetween(player, { x: canvas.width * 0.72, y: canvas.height / 2 }) > 76) {
      showMessage('The seal is open. Approach the descent at the back of the chamber.', 2.5);
      return;
    }
    if (currentFloor === finalFloor) {
      mode = 'won';
      clearSavedRun();
      showMessage("The mana current flows toward Candor again. The Mana Tree's light steadies.", 8);
      return;
    }
    currentFloor += 1;
    const generated = generateDungeon();
    rooms = generated.rooms;
    currentRoom = generated.startRoom;
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    spawnRoom(currentRoom);
    saveRunState();
    showMessage(`Chapter ${currentFloor}: the trail descends deeper into the sanctum.`, 5);
    return;
  }
  if (currentRoom.type === 'bank' &&
      distanceBetween(player, { x: canvas.width / 2, y: canvas.height / 2 }) < 150) {
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
  if (currentRoom.type === 'shop' && distanceBetween(player, { x: canvas.width / 2, y: canvas.height / 2 }) < 150) {
    const available = currentRoom.shopStock?.find((item) => !item.purchased);
    if (available) buyShopItem(currentRoom.shopStock.indexOf(available));
    else showMessage('The keeper has sold out of this room’s wares.', 2);
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
  if (['passive', 'skill', 'weapon', 'clothing', 'ability'].includes(item.kind)) {
    grantUpgrade(item);
  } else if (item.kind === 'companion') {
    ownedItems.add(item.id);
    companions.push(createCompanion(item));
  } else if (item.kind === 'consumable') {
    const stack = consumables.find((entry) => entry.id === item.id);
    if (stack) stack.count += 1;
    else consumables.push({ id: item.id, name: item.name, count: 1 });
  }
  updateHud();
  if (!['passive', 'skill', 'weapon', 'clothing', 'ability'].includes(item.kind)) {
    showMessage(`${item.name} acquired: ${item.description}.${item.kind === 'consumable' ? ' Press Q to use it.' : ''}`, 3);
  }
}

function createCompanion(item) {
  return {
    id: item.id,
    kind: item.companion,
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
        damageEnemy(enemy, 8);
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

function damagePlayer() {
  if (player.invuln > 0 || mode !== 'playing') return;
  if (player.armor > 0) {
    player.armor -= 1;
    showMessage('Your clothing absorbs the hit.', 1.4);
  } else {
    player.hp -= 1;
  }
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
  enemy.x = clamp(enemy.x + vx * dt, wallClearance, canvas.width - wallClearance);
  enemy.y = clamp(enemy.y + vy * dt, wallClearance, canvas.height - wallClearance);
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
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const directionX = dx / distance;
  const directionY = dy / distance;
  const visible = distance < 430 && hasLineOfSight(enemy, player);
  enemy.attackCooldown -= dt * (enemy.boss ? 1 + Math.max(0, currentFloor - 1) * 0.2 : 1);
  enemy.stateTimer -= dt;
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  enemy.spitFlash = Math.max(0, enemy.spitFlash - dt);

  if (enemy.boss) {
    if (enemy.kind === 'spider-queen') {
      updateSpiderQueen(enemy, dt, directionX, directionY, distance, visible);
    } else if (enemy.kind === 'golem') {
      updateGolemBoss(enemy, dt, directionX, directionY, distance, visible);
    } else {
      updateArenaBoss(enemy, dt, directionX, directionY, distance, visible);
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
        x: enemy.x + Math.cos(enemy.laserAngle) * Math.max(canvas.width, canvas.height),
        y: enemy.y + Math.sin(enemy.laserAngle) * Math.max(canvas.width, canvas.height),
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
        enemy.behavior = 'windup';
        enemy.stateTimer = enemy.kind === 'mouboo' ? 0.9 : 0.65;
        enemy.attackCooldown = enemy.kind === 'mouboo' ? 3.8 : 2.8;
      }
      enemy.spawnCooldown -= dt;
      if (enemy.kind === 'croc' && enemy.spawnCooldown <= 0 && breakables.length < 8) {
        const offset = Math.random() * Math.PI * 2;
        const x = clamp(enemy.x + Math.cos(offset) * 54, 80, canvas.width - 80);
        const y = clamp(enemy.y + Math.sin(offset) * 54, 80, canvas.height - 80);
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
        x: clamp(player.x + (Math.random() - 0.5) * 48, ROOM_WALL_THICKNESS + 18, canvas.width - ROOM_WALL_THICKNESS - 18),
        y: clamp(player.y + (Math.random() - 0.5) * 48, ROOM_WALL_THICKNESS + 18, canvas.height - ROOM_WALL_THICKNESS - 18),
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
        damageEnemy(enemy, 2);
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
      color: colors[companion.kind],
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
      (verticalDoor ? canvas.width : canvas.height) / 2) <=
      DOORWAY_HALF_WIDTH - player.radius - WALL_COLLISION_PADDING;
    return doorwayAligned && currentRoom.cleared &&
      !currentRoom.lockedDoors[direction] &&
      (currentRoom.links[direction] ||
        (currentRoom.secretExit?.direction === direction && !currentRoom.secretExit.room.hidden));
  };
  if (player.y < 22 && canExit('up')) enterDoor('up');
  else if (player.x > canvas.width - 22 && canExit('right')) enterDoor('right');
  else if (player.y > canvas.height - 22 && canExit('down')) enterDoor('down');
  else if (player.x < 22 && canExit('left')) enterDoor('left');

  const sideWallClearance = ROOM_WALL_THICKNESS + PLAYER_VISUAL_HALF_WIDTH + WALL_COLLISION_PADDING;
  const bottomWallClearance = ROOM_WALL_THICKNESS + player.radius + WALL_COLLISION_PADDING;
  const topWallClearance = ROOM_WALL_THICKNESS + player.radius + WALL_COLLISION_PADDING;
  if (player.x < sideWallClearance && !canExit('left')) player.x = sideWallClearance;
  if (player.x > canvas.width - sideWallClearance && !canExit('right')) player.x = canvas.width - sideWallClearance;
  if (player.y < topWallClearance && !canExit('up')) player.y = topWallClearance;
  if (player.y > canvas.height - bottomWallClearance && !canExit('down')) {
    player.y = canvas.height - bottomWallClearance;
  }
}

function update(dt) {
  elapsed += dt;
  if (mode === 'playing') {
    frostNovaCooldown = Math.max(0, frostNovaCooldown - dt);
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
  if (mode !== 'playing' || showMap) return;
  updateBreakables(dt);

  const moveX = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
  const moveY = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
  const length = Math.hypot(moveX, moveY) || 1;
  player.moving = moveX !== 0 || moveY !== 0;
  player.x += (moveX / length) * player.speed * dt;
  player.y += (moveY / length) * player.speed * dt;
  player.x = clamp(player.x, 12, canvas.width - 12);
  player.y = clamp(player.y, 12, canvas.height - 12);
  resolveDoorCrossing();

  if (pointer.down || keys[' ']) shoot();
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.meleeSwings = player.meleeSwings.filter((swing) => {
    swing.timer -= dt;
    return swing.timer > 0;
  });

  for (const enemy of enemies) {
    updateEnemy(enemy, dt);
    if (distanceBetween(player, enemy) < enemy.radius + player.radius + 2) damagePlayer();
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
    const rockIndex = breakables.findIndex((rock) => !rock.broken && distanceBetween(projectile, rock) < projectile.radius + rock.radius);
    const enemy = enemies.find((candidate) => distanceBetween(projectile, candidate) < projectile.radius + candidate.radius);
    if (rockIndex >= 0) {
      damageObstacle(breakables[rockIndex], 1, 'projectile');
      projectiles.splice(i, 1);
    } else if (enemy) {
      damageEnemy(enemy, projectile.damage);
      addParticles(projectile.x, projectile.y, projectile.color, 6, 100);
      projectiles.splice(i, 1);
    } else if (projectile.ttl <= 0 || projectile.x < 0 || projectile.x > canvas.width || projectile.y < 0 || projectile.y > canvas.height) {
      projectiles.splice(i, 1);
    }
  }

  for (let i = enemyProjectiles.length - 1; i >= 0; i -= 1) {
    const projectile = enemyProjectiles[i];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.ttl -= dt;
    const blockedByObstacle = breakables.some((obstacle) => !obstacle.broken &&
      distanceBetween(projectile, obstacle) < obstacle.radius + projectile.radius);
    if (blockedByObstacle) {
      enemyProjectiles.splice(i, 1);
    } else if (shieldWithCompanion(projectile)) {
      enemyProjectiles.splice(i, 1);
    } else if (distanceBetween(player, projectile) < player.radius + projectile.radius) {
      damagePlayer();
      addParticles(projectile.x, projectile.y, projectile.color, 6, 80);
      enemyProjectiles.splice(i, 1);
    } else if (projectile.ttl <= 0 || projectile.x < 32 || projectile.x > canvas.width - 32 ||
      projectile.y < 32 || projectile.y > canvas.height - 32) {
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
    if (currentRoom.type === 'miniboss' && currentRoom.rewardUpgrade && !currentRoom.rewardClaimed) {
      pickups.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
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
  const theme = floorThemes[currentFloor] || floorThemes[3];
  if (currentRoom.type === 'secret' && sacredRoomTiles.complete && sacredRoomTiles.naturalWidth > 0) {
    ctx.fillStyle = '#16131b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 64; y < canvas.height - 64; y += 32) {
      for (let x = 64; x < canvas.width - 64; x += 32) {
        const variation = (Math.floor(x / 32) + Math.floor(y / 32) * 3) % sacredRoomFloorTileIds.length;
        const tileId = sacredRoomFloorTileIds[variation];
        const sourceX = (tileId % 16) * 32;
        const sourceY = Math.floor(tileId / 16) * 32;
        ctx.drawImage(sacredRoomTiles, sourceX, sourceY, 32, 32, x, y, 32, 32);
      }
    }
    ctx.fillStyle = 'rgba(22, 18, 25, 0.74)';
    ctx.fillRect(64, 64, canvas.width - 128, 32);
    ctx.fillStyle = '#ead8ac';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SACRED HIDDEN SANCTUM', canvas.width / 2, 61);
  } else {
    const terrain = terrainTiles[currentFloor] || terrainTiles[3];
    const image = terrain.image;
    if (image.complete && image.naturalWidth >= 512 && image.naturalHeight >= 32) {
      ctx.fillStyle = theme.wall;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      if (currentFloor === 3) ctx.filter = 'hue-rotate(205deg) saturate(0.75) brightness(0.72)';
      for (let row = 2; row * 32 < canvas.height - 64; row += 1) {
        for (let column = 2; column * 32 < canvas.width - 64; column += 1) {
          const tileId = terrain.tileIds[(column * 7 + row * 13) % terrain.tileIds.length];
          const sourceX = (tileId % 16) * 32;
          const sourceY = Math.floor(tileId / 16) * 32;
          ctx.drawImage(image, sourceX, sourceY, 32, 32, column * 32, row * 32, 32, 32);
        }
      }
      ctx.restore();
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
        for (let x = 0; x < canvas.width; x += 32) {
          const tileIndex = Math.floor(x / 32);
          const atVerticalDoor = x < canvas.width / 2 + 48 && x + 32 > canvas.width / 2 - 48;
          if (!(atVerticalDoor && hasOpenDoor('up'))) {
            drawWallTile(tileIndex, x, 0);
            drawWallTile(tileIndex + 1, x, 32);
          }
          if (!(atVerticalDoor && hasOpenDoor('down'))) {
            drawWallTile(tileIndex + 1, x, canvas.height - 64);
            drawWallTile(tileIndex + 2, x, canvas.height - 32);
          }
        }
        for (let y = 32; y < canvas.height - 32; y += 32) {
          const tileIndex = Math.floor(y / 32);
          const atHorizontalDoor = y < canvas.height / 2 + 48 && y + 32 > canvas.height / 2 - 48;
          if (!(atHorizontalDoor && hasOpenDoor('left'))) {
            drawWallTile(tileIndex, 0, y);
            drawWallTile(tileIndex + 1, 32, y);
          }
          if (!(atHorizontalDoor && hasOpenDoor('right'))) {
            drawWallTile(tileIndex + 1, canvas.width - 64, y);
            drawWallTile(tileIndex + 2, canvas.width - 32, y);
          }
        }
      }
    } else {
      ctx.fillStyle = theme.wall;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  ctx.strokeStyle = `${theme.trim}66`;
  ctx.lineWidth = 3;
  ctx.strokeRect(63, 63, canvas.width - 126, canvas.height - 126);

  for (const direction of directions) {
    const secretDoor = currentRoom.secretExit?.direction === direction.name &&
      !currentRoom.secretExit.room.hidden;
    const hasDoor = (currentRoom.links[direction.name] || secretDoor) && currentRoom.cleared;
    if (!hasDoor) continue;
    const locked = currentRoom.lockedDoors[direction.name] === true;
    ctx.fillStyle = locked ? '#a77d42' : '#5f7652';
    if (direction.name === 'up' || direction.name === 'down') {
      ctx.fillRect(canvas.width / 2 - 42, direction.name === 'up' ? 40 : canvas.height - 64, 84, 24);
      ctx.fillStyle = locked ? '#fff0bd' : '#dce8c8';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(locked ? (keysHeld > 0 ? 'KEY • E' : 'LOCKED') : 'OPEN', canvas.width / 2, direction.name === 'up' ? 56 : canvas.height - 48);
    } else {
      ctx.fillRect(direction.name === 'left' ? 40 : canvas.width - 64, canvas.height / 2 - 42, 24, 84);
      ctx.save();
      ctx.translate(direction.name === 'left' ? 52 : canvas.width - 52, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = locked ? '#fff0bd' : '#dce8c8';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(locked ? (keysHeld > 0 ? 'KEY • E' : 'LOCKED') : 'OPEN', 0, 4);
      ctx.restore();
    }
  }

  if (currentRoom.secretExit?.room.hidden) {
    const direction = currentRoom.secretExit.direction;
    ctx.strokeStyle = '#b78f69';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (direction === 'up' || direction === 'down') {
      const y = direction === 'up' ? 38 : canvas.height - 38;
      ctx.moveTo(canvas.width / 2 - 26, y - 8);
      ctx.lineTo(canvas.width / 2 + 26, y + 8);
      ctx.moveTo(canvas.width / 2 + 18, y - 8);
      ctx.lineTo(canvas.width / 2 - 18, y + 8);
    } else {
      const x = direction === 'left' ? 38 : canvas.width - 38;
      ctx.moveTo(x - 8, canvas.height / 2 - 24);
      ctx.lineTo(x + 8, canvas.height / 2 + 24);
      ctx.moveTo(x - 8, canvas.height / 2 + 18);
      ctx.lineTo(x + 8, canvas.height / 2 - 18);
    }
    ctx.stroke();
  }
}

function drawEnemy(enemy) {
  if (enemy.boss && enemy.kind === 'jacko' &&
    (enemy.behavior === 'jacko-ground-pound-hidden' ||
      enemy.x < 0 || enemy.x > canvas.width || enemy.y < 0 || enemy.y > canvas.height)) return;
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
    } else if (enemy.kind === 'spider-queen') {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
      const standFrames = [36, 18, 0, 126, 108, 90, 72, 54];
      const base = standFrames[directionIndex];
      const attacking = enemy.behavior !== 'jacko-idle' && enemy.behavior !== 'jacko-ground-pound-hidden';
      frame = attacking
        ? base + 9 + Math.floor(elapsed * (enemy.phase >= 2 ? 12 : 8)) % 9
        : base + Math.floor(elapsed * 6) % 9;
    } else if (enemy.kind === 'golem') {
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
    } else {
      const frames = sprite.frames || [0, 1, 2, 3];
      frame = frames[Math.floor(elapsed * (enemy.phase >= 2 ? 10 : 6)) % frames.length];
    }
    const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
    const sourceX = (frame % columns) * sprite.frameWidth;
    const sourceY = Math.floor(frame / columns) * sprite.frameHeight;
    const scale = sprite.scale * (enemy.boss && enemy.kind !== 'jacko' ? 1.4 : 1);
    const width = sprite.frameWidth * scale;
    const height = sprite.frameHeight * scale;
    const hop = enemy.archetype === 'leaper' && enemy.behavior === 'leap'
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
      enemy.kind === 'jacko' && enemy.behavior === 'jacko-roll') {
      ctx.rotate(elapsed * 18);
    }
    const frostAffected = enemy.freezeTimer > 0 || enemy.slowTimer > 0;
    if (frostAffected) {
      ctx.filter = 'hue-rotate(155deg) saturate(1.8) brightness(1.2)';
      ctx.shadowColor = '#59d7ff';
      ctx.shadowBlur = enemy.freezeTimer > 0 ? 22 : 14;
    } else if (enemy.kind === 'jacko') {
      ctx.shadowColor = '#ff8e38';
      ctx.shadowBlur = enemy.phase >= 2 ? 30 : 16;
      if (enemy.phase >= 2) ctx.filter = 'saturate(1.5) brightness(1.25)';
    }
    ctx.drawImage(sprite.image, sourceX, sourceY, sprite.frameWidth, sprite.frameHeight,
      -width / 2, -height / 2, width, height);
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
    const length = Math.max(canvas.width, canvas.height);
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
  const scale = companion.kind === 'croc' ? 1.15 : 1.05;
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  const frame = companion.kind === 'wisp' ? Math.floor(elapsed * 5) % 5 : 0;
  const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
  const glow = companion.kind === 'wisp' ? '#c8a6ff' : '#a8e39c';
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
  const sheet = humanoidSprites[character.sprite];
  const direction = Math.abs(player.lookX) > Math.abs(player.lookY)
    ? player.lookX < 0 ? 'left' : 'right'
    : player.lookY < 0 ? 'up' : 'down';
  const directionRow = { down: 0, left: 1, up: 2, right: 3 }[direction];
  const frame = player.moving ? 1 + Math.floor(elapsed * 10) % 6 : 0;
  const frameIndex = directionRow * 18 + frame;
  ctx.save();
  if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.4;
  drawHumanoid(sheet, frameIndex, player.x, player.y, 1.35, character.hue);
  for (const slot of ['legs', 'chest']) {
    const clothing = equippedClothing[slot];
    if (clothing) drawClothing(clothing, frameIndex, player.x, player.y, 1.35);
  }
  drawHead(character.id, direction, player.x, player.y, 1.35);
  ctx.restore();
}

function drawClothing(clothing, frameIndex, x, y, scale) {
  const sprite = clothingSprites[clothing.sprite];
  if (!sprite.image.complete || sprite.image.naturalWidth === 0) return;
  const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
  const sourceX = (frameIndex % columns) * sprite.frameWidth;
  const sourceY = Math.floor(frameIndex / columns) * sprite.frameHeight;
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  ctx.drawImage(
    sprite.image,
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
  const head = headSprites[style];
  if (!head.image.complete || head.image.naturalWidth === 0) return;
  const directionFrame = { down: 0, left: 1, up: 2, right: 3 }[direction];
  const size = 32 * scale;
  const sourceX = directionFrame * head.frameWidth;
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
      x - size / 2,
      y - 64 * scale + 6,
      size,
      size,
    );
  } catch (error) {
    if (!isPixelReadbackSecurityError(error)) return;
    ctx.drawImage(
      head.image,
      sourceX,
      0,
      head.frameWidth,
      head.frameHeight,
      x - size / 2,
      y - 64 * scale + 6,
      size,
      size,
    );
  }
}

function drawWorld() {
  drawRoomFloor();
  if (currentRoom.type === 'boss' && currentRoom.cleared) {
    ctx.fillStyle = '#a8d7b4';
    ctx.fillRect(canvas.width * 0.72 - 30, canvas.height / 2 - 8, 60, 16);
    ctx.strokeStyle = '#e1f4d1';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width * 0.72 - 30, canvas.height / 2 - 8, 60, 16);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DESCEND  [E]', canvas.width * 0.72, canvas.height / 2 - 18);
  }
  if (currentRoom.type === 'shop') {
    drawHumanoid(humanoidSprites.neutral, 0, canvas.width / 2, canvas.height / 2, 1.35, 40);
    drawHead('keeper', 'down', canvas.width / 2, canvas.height / 2, 1.35);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('KEEPER  [E TO TRADE]', canvas.width / 2, canvas.height / 2 - 28);
    ctx.fillStyle = '#d3c4a6';
    ctx.font = '12px Arial';
    ctx.fillText('Choose an offer with 1, 2, or 3', canvas.width / 2, canvas.height / 2 + 43);
    ctx.fillStyle = '#ab8058';
    ctx.fillRect(canvas.width / 2 - 34, canvas.height / 2 + 18, 68, 11);
    const stock = currentRoom.shopStock || [];
    stock.forEach((item, index) => {
      const x = 150 + index * 230;
      const y = canvas.height - 98;
      ctx.fillStyle = item.purchased ? 'rgba(63, 77, 63, 0.92)' : 'rgba(25, 22, 29, 0.94)';
      ctx.fillRect(x, y, 210, 64);
      ctx.strokeStyle = item.purchased ? '#77936a' : '#b79664';
      ctx.strokeRect(x, y, 210, 64);
      ctx.fillStyle = item.purchased ? '#9bb38e' : '#f2dfa9';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`${index + 1}. ${item.name}  -  ${item.cost} zenny`, x + 9, y + 20);
      ctx.fillStyle = '#d4c7ae';
      ctx.font = '11px Arial';
      ctx.fillText(item.purchased ? 'SOLD' : item.description, x + 9, y + 41);
      ctx.textAlign = 'center';
    });
  }
  if (currentRoom.type === 'bank') {
    ctx.fillStyle = 'rgba(35, 29, 23, 0.92)';
    ctx.fillRect(canvas.width / 2 - 155, canvas.height / 2 - 82, 310, 164);
    ctx.strokeStyle = '#d7b66e';
    ctx.lineWidth = 3;
    ctx.strokeRect(canvas.width / 2 - 155, canvas.height / 2 - 82, 310, 164);
    ctx.fillStyle = '#f4d78e';
    ctx.font = 'bold 22px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('Zenny Vault', canvas.width / 2, canvas.height / 2 - 38);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = '15px Arial';
    ctx.fillText(`Carried: ${coins}  ·  Stored: ${save.bankedZenny}`, canvas.width / 2, canvas.height / 2);
    ctx.font = '13px Arial';
    ctx.fillText('E · Deposit all   |   Shift+E · Withdraw all', canvas.width / 2, canvas.height / 2 + 38);
    ctx.fillStyle = '#d7b66e';
    ctx.fillRect(canvas.width / 2 - 34, canvas.height / 2 + 52, 68, 10);
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
    if (!sprite.image.complete || sprite.image.naturalWidth === 0) continue;
    const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
    const sourceX = (rock.frame % columns) * sprite.frameWidth;
    const sourceY = Math.floor(rock.frame / columns) * sprite.frameHeight;
    const width = sprite.frameWidth * sprite.scale;
    const height = sprite.frameHeight * sprite.scale;
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
      ctx.save();
      ctx.shadowColor = '#ffd86e';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffd86e';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 14 + Math.sin(elapsed * 4) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#332519';
      ctx.font = 'bold 17px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('↑', pickup.x, pickup.y + 6);
      ctx.fillStyle = '#fff1c9';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(pickup.item.name, pickup.x, pickup.y - 25);
      ctx.restore();
    } else if (pickup.kind === 'heart' && heartImage.complete && heartImage.naturalWidth > 0) {
      ctx.drawImage(heartImage, pickup.x - 12, pickup.y - 12, 24, 24);
    } else if (pickup.kind === 'bomb') {
      ctx.fillStyle = '#25232a';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (pickup.kind === 'key') {
      ctx.fillStyle = '#fbd96f';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('⚿', pickup.x, pickup.y + 7);
    } else {
      ctx.fillStyle = pickup.kind === 'coin' ? '#ffd75a' : '#f5e6ce';
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
    if (projectile.type === 'arrow') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#8d5b32';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10 * (projectile.size || 1), 0);
      ctx.lineTo(10 * (projectile.size || 1), 0);
      ctx.stroke();
      ctx.fillStyle = '#dfc995';
      ctx.beginPath();
      ctx.moveTo(12 * (projectile.size || 1), 0);
      ctx.lineTo(5 * (projectile.size || 1), -4 * (projectile.size || 1));
      ctx.lineTo(5 * (projectile.size || 1), 4 * (projectile.size || 1));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#8d5b32';
      ctx.beginPath();
      ctx.moveTo(-10 * (projectile.size || 1), 0);
      ctx.lineTo(-15 * (projectile.size || 1), -4 * (projectile.size || 1));
      ctx.lineTo(-13 * (projectile.size || 1), 0);
      ctx.lineTo(-15 * (projectile.size || 1), 4 * (projectile.size || 1));
      ctx.closePath();
      ctx.fill();
    } else if (stoneImage.complete && stoneImage.naturalWidth > 0) {
      ctx.drawImage(stoneImage, projectile.x - size / 2, projectile.y - size / 2, size, size);
    } else {
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const projectile of enemyProjectiles) {
    ctx.save();
    ctx.shadowColor = projectile.color;
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
    ctx.save();
    ctx.globalAlpha = 0.8 * (1 - progress);
    ctx.strokeStyle = swing.weapon === 'sword' ? '#d7e9f6' : swing.weapon === 'daggers' ? '#fff0b0' : '#ffd381';
    ctx.lineWidth = swing.weapon === 'sword' ? 7 : swing.weapon === 'daggers' ? 5 : 8;
    ctx.shadowColor = swing.weapon === 'sword' ? '#a7d8ff' : '#ffaf58';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(player.x, player.y, swing.reach + progress * 12, swing.angle - 0.85, swing.angle + 0.85);
    ctx.stroke();
    ctx.restore();
  }
  for (const enemy of enemies) drawEnemy(enemy);
  drawPlayer();
  for (const companion of companions) drawCompanion(companion);
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
        : room.type === 'shop' ? '#d9aa66' : room.type === 'bank' ? '#d7b66e' : '#514d59';
    ctx.fillRect(x + 8, y + 8, cell - 16, cell - 16);
    ctx.fillStyle = '#e9dfd0';
    ctx.font = '12px Arial';
    ctx.fillText(room.type === 'boss' ? 'B' : room.type === 'miniboss' ? '!'
      : room.type === 'shop' ? '$' : room.type === 'bank' ? 'Z' : room.type === 'secret' ? '?' : '',
    x + cell / 2, y + cell / 2 + 4);
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
  ctx.fillText(`${floorThemes[currentFloor]?.name || 'Sanctum'}  [M]`, panel.x + 9, panel.y + 15);

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
        room.type === 'secret' ? '#c69be5' : '#aaa19a';
    ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
    if (room.type === 'boss' || room.type === 'miniboss' || room.type === 'shop' ||
        room.type === 'bank' || room.type === 'secret') {
      ctx.fillStyle = '#211e25';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(room.type === 'boss' ? 'B' : room.type === 'miniboss' ? '!'
        : room.type === 'shop' ? '$' : room.type === 'bank' ? 'Z' : '?',
      x + cell / 2, y + cell / 2 + 3);
    }
    if (room === currentRoom) {
      ctx.strokeStyle = '#fff1d7';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
    }
  }
}

function drawGameHud() {
  if (!character) return;
  const theme = floorThemes[currentFloor] || floorThemes[3];
  const activeConsumable = consumables.find((item) => item.count > 0);
  const activeCompanions = companions.filter((companion) => companion.hp > 0).length;
  const leftHud = { x: 32, y: 2 };
  const rightHud = { x: 560, y: 2 };
  ctx.save();
  const drawIndicatorBorder = (x, y, width, height) => {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(225, 201, 160, 0.58)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.restore();
  };
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 4;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = theme.detail;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#211a17';
  ctx.strokeText(`${theme.name} · Floor ${currentFloor}`, leftHud.x + 10, leftHud.y + 16);
  ctx.fillText(`${theme.name} · Floor ${currentFloor}`, leftHud.x + 10, leftHud.y + 16);
  const healthX = leftHud.x + 10;
  for (let index = 0; index < player.maxHp; index += 1) {
    const x = healthX + index * 17;
    if (index < player.hp && heartImage.complete && heartImage.naturalWidth > 0) {
      ctx.drawImage(heartImage, x, leftHud.y + 35, 14, 14);
    } else {
      const y = leftHud.y + 35;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 13);
      ctx.bezierCurveTo(x + 4, y + 11, x, y + 8, x + 1, y + 4);
      ctx.bezierCurveTo(x + 2, y, x + 6, y, x + 7, y + 3);
      ctx.bezierCurveTo(x + 9, y, x + 13, y, x + 13, y + 4);
      ctx.bezierCurveTo(x + 14, y + 8, x + 10, y + 11, x + 7, y + 13);
      if (index < player.hp) {
        ctx.fillStyle = '#df7180';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(244, 220, 211, 0.72)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    drawIndicatorBorder(x - 1, leftHud.y + 34, 16, 16);
  }

  const armorX = healthX + player.maxHp * 17 + 12;
  ctx.fillStyle = '#d7e1ee';
  ctx.beginPath();
  ctx.moveTo(armorX + 5, leftHud.y + 35);
  ctx.lineTo(armorX + 11, leftHud.y + 38);
  ctx.lineTo(armorX + 10, leftHud.y + 45);
  ctx.lineTo(armorX + 5, leftHud.y + 49);
  ctx.lineTo(armorX, leftHud.y + 45);
  ctx.lineTo(armorX - 1, leftHud.y + 38);
  ctx.closePath();
  ctx.fill();
  drawIndicatorBorder(armorX - 2, leftHud.y + 33, 15, 18);
  for (let index = 0; index < player.armor; index += 1) {
    const x = armorX + 15 + index * 12;
    ctx.beginPath();
    ctx.moveTo(x + 4, leftHud.y + 35);
    ctx.lineTo(x + 8, leftHud.y + 42);
    ctx.lineTo(x + 4, leftHud.y + 49);
    ctx.lineTo(x, leftHud.y + 42);
    ctx.closePath();
    ctx.fill();
    drawIndicatorBorder(x - 1, leftHud.y + 34, 10, 17);
  }

  const resourcesX = rightHud.x + 12;
  ctx.fillStyle = '#f3d486';
  ctx.beginPath();
  ctx.arc(resourcesX + 5, rightHud.y + 17, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3f3021';
  ctx.font = 'bold 8px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Z', resourcesX + 5, rightHud.y + 17);
  drawIndicatorBorder(resourcesX - 2, rightHud.y + 9, 15, 17);
  ctx.textAlign = 'left';
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = '#f3d486';
  ctx.fillText(coins, resourcesX + 13, rightHud.y + 17);

  const keyX = resourcesX + 48;
  ctx.strokeStyle = '#f3d486';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(keyX + 4, rightHud.y + 15, 3, 0, Math.PI * 2);
  ctx.moveTo(keyX + 7, rightHud.y + 15);
  ctx.lineTo(keyX + 14, rightHud.y + 15);
  ctx.lineTo(keyX + 14, rightHud.y + 19);
  ctx.stroke();
  drawIndicatorBorder(keyX - 2, rightHud.y + 7, 18, 19);
  ctx.fillStyle = '#f3d486';
  ctx.fillText(keysHeld, keyX + 18, rightHud.y + 17);

  const bombX = keyX + 46;
  ctx.fillStyle = '#c5c2c0';
  ctx.beginPath();
  ctx.arc(bombX + 6, rightHud.y + 18, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c774';
  ctx.fillRect(bombX + 8, rightHud.y + 10, 2, 4);
  drawIndicatorBorder(bombX - 2, rightHud.y + 8, 17, 19);
  ctx.fillStyle = '#e4d7c7';
  ctx.fillText(bombsHeld, bombX + 16, rightHud.y + 17);

  const familiarX = bombX + 44;
  ctx.fillStyle = '#cdb8f0';
  ctx.beginPath();
  ctx.arc(familiarX + 5, rightHud.y + 17, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#302538';
  ctx.beginPath();
  ctx.arc(familiarX + 3, rightHud.y + 16, 1, 0, Math.PI * 2);
  ctx.arc(familiarX + 7, rightHud.y + 16, 1, 0, Math.PI * 2);
  ctx.fill();
  drawIndicatorBorder(familiarX - 2, rightHud.y + 8, 15, 18);
  ctx.fillStyle = '#cdb8f0';
  ctx.fillText(activeCompanions, familiarX + 13, rightHud.y + 17);
  ctx.fillStyle = '#f4e6c4';
  ctx.font = 'bold 9px Arial';
  ctx.fillText(activeConsumable
    ? `Q · ${activeConsumable.name.slice(0, 18)} ×${activeConsumable.count}` : 'Q · No consumable',
  rightHud.x + 12, rightHud.y + 43);
  if (ownedItems.has('frost-rune')) {
    ctx.fillStyle = frostNovaCooldown > 0 ? '#9fd8e8' : '#8feaff';
    ctx.fillText(`C · Frost Rune ${frostNovaCooldown > 0 ? `${Math.ceil(frostNovaCooldown)}s` : 'READY'}`,
      rightHud.x + 12, rightHud.y + 57);
  }
  ctx.fillStyle = 'rgba(244, 230, 196, 0.86)';
  ctx.fillText('P · Pause', leftHud.x + 10, leftHud.y + 66);
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
      : 'MINI-BOSS', canvas.width / 2, y + 12);
  }
}

function isCharacterUnlocked(entry) {
  return entry.id === 'wanderer' || (entry.id === 'arcanist' && save.arcanist) ||
    (entry.id === 'warden' && save.warden);
}

function characterCardBounds(index) {
  const x = canvas.width / 2 + (index - 1) * 220;
  return { x: x - 91, y: 190, width: 182, height: 205 };
}

function characterStartBounds() {
  return { x: canvas.width / 2 - 100, y: 486, width: 200, height: 38 };
}

function resumeRunBounds() {
  return { x: canvas.width / 2 - 120, y: 442, width: 240, height: 32 };
}

function drawCharacterSelect() {
  ctx.fillStyle = '#171720';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e4c99e';
  ctx.font = 'bold 35px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('MANA: HOLLOW SANCTUM', canvas.width / 2, 95);
  ctx.fillStyle = '#c5b9a6';
  ctx.font = '16px Arial';
  ctx.fillText('Click a delver to select • Click descend or press Enter', canvas.width / 2, 132);

  characterRoster.forEach((entry, index) => {
    const unlocked = isCharacterUnlocked(entry);
    const x = canvas.width / 2 + (index - 1) * 220;
    const y = 280;
    const bounds = characterCardBounds(index);
    const hovered = pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
      pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
    ctx.fillStyle = index === selectedIndex ? '#3f3943' : '#27252d';
    ctx.fillRect(x - 91, y - 90, 182, 205);
    ctx.strokeStyle = index === selectedIndex || hovered ? '#e9c57e' : '#6d6472';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 91, y - 90, 182, 205);
    ctx.globalAlpha = unlocked ? 1 : 0.38;
    drawHumanoid(humanoidSprites[entry.sprite], 0, x, y - 24, 1.1, entry.hue);
    drawHead(entry.id, 'down', x, y - 24, 1.1);
    ctx.fillStyle = '#f2e8d8';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(entry.name, x, y + 14);
    ctx.font = '14px Arial';
    ctx.fillText(`${entry.className}  •  ${entry.styleLabel}`, x, y + 39);
    ctx.fillText(`HP ${entry.hp}  •  Damage ${entry.damage}`, x, y + 57);
    ctx.fillStyle = unlocked ? '#a8d39b' : '#dfa5a2';
    ctx.font = '12px Arial';
    ctx.fillText(unlocked ? 'UNLOCKED' : entry.unlock, x, y + 83);
    ctx.globalAlpha = 1;
  });
  ctx.fillStyle = '#c5b9a6';
  ctx.font = '13px Arial';
  ctx.fillText('Mage casts tears • Warrior brawls • Rogue fires arrows', canvas.width / 2, 438);
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
  } else {
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
  if (mode === 'select') {
    drawCharacterSelect();
    return;
  }
  drawWorld();
  if (mode === 'playing') {
    drawMinimap();
    drawGameHud();
  }
  if (mode === 'paused') drawPauseOverlay();
  if (showMap) drawMap();
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
    ctx.fillText('P or Esc · Resume', canvas.width / 2, canvas.height / 2);
    ctx.fillText('X · Save and exit to title', canvas.width / 2, canvas.height / 2 + 34);
    ctx.fillText('Your rooms and progress are saved automatically.', canvas.width / 2, canvas.height / 2 + 72);
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.04);
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function chooseCharacter(key) {
  const delta = key === 'ArrowRight' || key === 'd' ? 1 : -1;
  for (let attempt = 0; attempt < characterRoster.length; attempt += 1) {
    selectedIndex = (selectedIndex + delta + characterRoster.length) % characterRoster.length;
    const entry = characterRoster[selectedIndex];
    if (entry.id === 'wanderer' || (entry.id === 'arcanist' && save.arcanist) || (entry.id === 'warden' && save.warden)) break;
  }
  updateHud();
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys[event.key] = true;
  keys[key] = true;
  if (event.repeat) return;
  if (event.key === ' ' || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();

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
  if (mode === 'playing' && key === 'c') useFrostNova();
  if (key === 'e') interact(event.shiftKey);
  if (mode === 'playing' && currentRoom.type === 'shop' && ['1', '2', '3'].includes(key)) {
    const nearKeeper = distanceBetween(player, { x: canvas.width / 2, y: canvas.height / 2 }) < 150;
    if (nearKeeper) buyShopItem(Number(key) - 1);
  }
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
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  pointer.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  if (mode === 'select') {
    const overCard = characterRoster.some((entry, index) => {
      const bounds = characterCardBounds(index);
      return pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
        pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height && isCharacterUnlocked(entry);
    });
    const start = characterStartBounds();
    const overStart = pointer.x >= start.x && pointer.x <= start.x + start.width &&
      pointer.y >= start.y && pointer.y <= start.y + start.height;
    canvas.style.cursor = overCard || overStart ? 'pointer' : 'default';
  } else {
    canvas.style.cursor = 'crosshair';
  }
}

canvas.addEventListener('pointermove', updatePointerPosition);
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) return;
  updatePointerPosition(event);
  if (mode === 'select') {
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
    const selectedCard = characterRoster.findIndex((entry, index) => {
      const bounds = characterCardBounds(index);
      return pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
        pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
    });
    if (selectedCard >= 0) {
      if (isCharacterUnlocked(characterRoster[selectedCard])) {
        selectedIndex = selectedCard;
        updateHud();
      } else {
        showMessage(characterRoster[selectedCard].unlock, 2.5);
      }
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
if (!restoreRun()) messageEl.textContent = 'Choose a delver to begin the descent.';
window.addEventListener('pagehide', saveRunState);
requestAnimationFrame(loop);
