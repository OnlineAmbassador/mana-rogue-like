/* Enemy and boss creation, attacks, damage, and AI. */

function estimatedPlayerDps() {
  const profile = characterProfile();
  const base = player.damage + weapon.damageBonus;
  const rangedDamage = base * weapon.shotDamageMultiplier;
  const volley = Math.max(1, weapon.shotCount);
  const interval = Math.max(0.12, weapon.fireDelay * FIRE_RATE_SCALE);
  const magic = rangedDamage * profile.magic * volley / interval;
  const bow = rangedDamage * profile.bow * profile.bowRate * volley / interval;
  const meleeBonus = [...meleeWeapons].reduce((sum, item) => sum + (item === 'sword' ? 2 : item === 'daggers' ? 1 : 0), 0);
  const meleeInterval = Math.max(0.5,
    (nativeStyle() === 'melee' ? character.fireDelay || 0.3 : 0.3) * FIRE_RATE_SCALE * 2.4) / profile.meleeRate;
  const melee = (base + meleeBonus) * MELEE_BASE_SCALE * profile.melee / meleeInterval;
  return Math.max(6, magic, bow, melee);
}

// How regular mobs answer the weapon the player relies on (see dominantAIStyle). Scale fields are multipliers on
// the existing tactic knobs; tokenBonus and punishRecovery are on/off. Bosses never read this.
const styleAIProfiles = {
  neutral: { ringScale: 1, dodgeScale: 1, dodgeAll: false, tokenBonus: 0, spacingScale: 1, rangedRate: 1, punishRecovery: false },
  // Melee: casters kite wide, and foes commit while the player recovers from a swing.
  melee: { ringScale: 1.3, dodgeScale: 1, dodgeAll: false, tokenBonus: 0, spacingScale: 1, rangedRate: 1, punishRecovery: true },
  // Bow: kiting is punished: foes close in, dodge more often and one more melee mob may engage.
  bow: { ringScale: 0.75, dodgeScale: 1.5, dodgeAll: true, tokenBonus: 1, spacingScale: 1, rangedRate: 1, punishRecovery: false },
  // Magic: foes spread out to blunt area and chain effects, and ranged mobs act a little faster.
  magic: { ringScale: 1, dodgeScale: 1, dodgeAll: false, tokenBonus: 0, spacingScale: 1.6, rangedRate: 1.15, punishRecovery: false },
};

// The player's profile for the style scales how hard the counter bites (a Warrior's sword draws a firmer one).
function aiStyleProfile() {
  const style = dominantAIStyle;
  const row = styleAIProfiles[style];
  if (!row) return styleAIProfiles.neutral;
  const intensity = clamp(characterProfile()[style] ?? 1, 0.8, 1.3);
  const scaled = (value) => 1 + (value - 1) * intensity;
  return { ...row, ringScale: scaled(row.ringScale), dodgeScale: scaled(row.dodgeScale),
    spacingScale: scaled(row.spacingScale), rangedRate: scaled(row.rangedRate) };
}

const styleRangedArchetypes = ['ranged', 'cluster-caster', 'web-spitter'];

// Input-adaptive tactics. Every derived number and the rule behind it (R1-R10) is recorded in docs/BALANCE.md; change a
// value there, here and in tests/tuning.test.js together. Values marked "playtest" have no stronger anchor than the
// pacing of the surrounding fights.
const ADAPTIVE_AI_TUNING = {
  adaptSeconds: 2.5, // playtest: stable play needed before enemies switch profile
  roomGraceSeconds: 6, // playtest: no wide pulse this soon after entering a room
  floorOneRamp: 0.5, // R5: share of a profile applied on floor 1 (full strength from floor 2)
  tempoPerFloor: 0.08, // R4: the existing per-floor attack-cooldown scaling
  minAttackGap: 0.25, // R6: seconds between ordinary attack starts; about human reaction time
  maxMeleeAttackers: 4, // R7: the base cap of 3 plus at most one adaptation slot
  maxTacticalSpeed: 1.25, // R8: times an enemy's speed stat; the enrage multiplier
  floorLeadCap: 0.45, // seconds of floor-based shot lead (unchanged)
  mobReactionSeconds: 0.14, // shots arriving sooner than this are not dodged
  bossPressureCadence: { boss: 1.5, mini: 1.4 }, // playtest: multiplier on the path-marker interval
  pulse: {
    minFloor: 2,
    range: 430, // the shared sight range
    escapeMargin: 1.15, // R1: radius = ground speed * warning * margin
    radiusMin: 180,
    radiusMax: 320,
    mobCooldown: 10, // playtest
    bossCooldown: 7, // playtest
    dashCueSeconds: 0.2, // R2: must not exceed DASH_INVULN_SECONDS
    mobDamage: 1,
    bossDamage: 2,
  },
  // R10: controller >= keyboard/mouse >= touch on the threat axes (attackSlots, tempoFloors, beatScale, warning,
  // dodgeBonus, flankLead). strafe, nearDodgeBonus and shotShare counter how each input moves or aims.
  // tempoFloors is attack tempo in floors of the usual +8% per floor; shotShare is the share of the shot's flight
  // time that enemies lead beyond the floor-based lead (always below 1, so a stop or turn still dodges it).
  profiles: {
    neutral: { strafe: 0, flankLead: 0, dodgeBonus: 0, nearDodgeBonus: 0, attackSlots: 0, beatScale: 1,
      shotShare: 0, warning: 1.1, tempoFloors: 0 },
    touch: { strafe: 0.48, flankLead: 0.1, dodgeBonus: 0.08, nearDodgeBonus: 0.32, attackSlots: 0, beatScale: 0.85,
      shotShare: 0.07, warning: 1.1, tempoFloors: 1 },
    controller: { strafe: 0.75, flankLead: 0.28, dodgeBonus: 0.22, nearDodgeBonus: 0.12, attackSlots: 1, beatScale: 0.7,
      shotShare: 0.13, warning: 0.95, tempoFloors: 2 },
    keyboard: { strafe: 0.4, flankLead: 0.18, dodgeBonus: 0.12, nearDodgeBonus: 0.08, attackSlots: 0, beatScale: 0.8,
      shotShare: 0.18, warning: 1.05, tempoFloors: 1.5 },
  },
};
// Largest sideways component (in enemy speed) that keeps total tactical speed within maxTacticalSpeed.
const TACTICAL_LATERAL_CAP = Math.sqrt(ADAPTIVE_AI_TUNING.maxTacticalSpeed ** 2 - 1);

function makeInputAIState() {
  return { mode: null, pending: null, timer: 0, room: null, pressureCooldown: ADAPTIVE_AI_TUNING.roomGraceSeconds };
}

const inputAI = makeInputAIState();
const inputProfileCache = { name: null, ramp: null, profile: null };

function resetInputAI() {
  Object.assign(inputAI, makeInputAIState());
}

// One step of the input adaptation: a new input is only adopted after adaptSeconds of stable use, and each room
// restarts the wide-pulse grace period. Pure, so it can be tested without the game loop.
function stepInputAI(state, inputMode, dt, room) {
  const tuning = ADAPTIVE_AI_TUNING;
  const next = { ...state };
  if (next.room !== room) {
    next.room = room;
    next.pressureCooldown = tuning.roomGraceSeconds;
  }
  next.pressureCooldown = Math.max(0, next.pressureCooldown - dt);
  if (!tuning.profiles[inputMode]) return next;
  if (next.mode === null) next.mode = inputMode;
  if (next.mode === inputMode) {
    next.pending = null;
    next.timer = 0;
    return next;
  }
  if (next.pending !== inputMode) {
    next.pending = inputMode;
    next.timer = 0;
  }
  next.timer += dt;
  if (next.timer >= tuning.adaptSeconds) {
    next.mode = next.pending;
    next.pending = null;
    next.timer = 0;
  }
  return next;
}

function updateInputAI(dt) {
  if (mode !== 'playing' || dt <= 0) return;
  Object.assign(inputAI, stepInputAI(inputAI, lastInputMode, dt, currentRoom));
}

// The pause-menu "Adaptive enemies" setting. Off restores the combat behavior from before input adaptation.
function adaptiveEnemiesEnabled() {
  return typeof gameSettings === 'undefined' || gameSettings.adaptiveEnemies !== false;
}

function adaptiveActive() {
  return inputAI.mode !== null && adaptiveEnemiesEnabled();
}

function adaptiveRamp() {
  return currentFloor <= 1 ? ADAPTIVE_AI_TUNING.floorOneRamp : 1;
}

function blendInputProfile(name, ramp) {
  const tuning = ADAPTIVE_AI_TUNING;
  const neutral = tuning.profiles.neutral;
  const row = tuning.profiles[name];
  const blend = (axis) => neutral[axis] + (row[axis] - neutral[axis]) * ramp;
  return {
    strafe: blend('strafe'),
    flankLead: blend('flankLead'),
    dodgeBonus: blend('dodgeBonus'),
    nearDodgeBonus: blend('nearDodgeBonus'),
    shotShare: blend('shotShare'),
    beatScale: blend('beatScale'),
    tempo: 1 + tuning.tempoPerFloor * row.tempoFloors * ramp,
    attackSlots: Math.floor(row.attackSlots * ramp),
    warning: row.warning,
  };
}

function aiInputProfile() {
  const name = adaptiveActive() ? inputAI.mode : 'neutral';
  const ramp = adaptiveRamp();
  if (inputProfileCache.name !== name || inputProfileCache.ramp !== ramp) {
    inputProfileCache.name = name;
    inputProfileCache.ramp = ramp;
    inputProfileCache.profile = blendInputProfile(name, ramp);
  }
  return inputProfileCache.profile;
}

// Attack-cooldown tick multiplier for one enemy; bosses and promoted boss-AI foes always tick at 1.
function styleCooldownRate(enemy) {
  if (enemy.boss || enemy.miniBoss || enemy.bossAI) return 1;
  return styleRangedArchetypes.includes(enemy.archetype) ? aiStyleProfile().rangedRate : 1;
}

// Proper names for monsters whose sprite keys don't read as one.
const monsterDisplayNames = {
  'slime-mother': 'Great Red Slime', bosspinkie: 'Pinkie Matriarch', golem: 'Ancient Golem',
  banditlord: 'Bandit Lord', yetiking: 'Yeti King', forestdragon: 'Forest Dragon',
  nightdragon: 'Night Dragon', vampirebat: 'Vampire Bat', junglefowl: 'Jungle Fowl',
};

function monsterDisplayName(kind) {
  return monsterDisplayNames[kind] ||
    kind.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

// Source of Mana mobs that match a Hollow Sanctum enemy, with the cues SoM ships for each.
const somMobEvents = {
  ratto: ['attack', 'hit', 'death'],
  bat: ['attack', 'death'],
  slime: ['attack', 'hit', 'death'],
  snake: ['attack'],
  scorpion: ['attack', 'hit'],
  croc: ['attack', 'dodge', 'hit'],
  fluffy: ['attack', 'dodge', 'hit'],
  skeleton: ['death'],
  shroom: ['attack', 'hit', 'death'],
  pinkie: ['attack', 'dodge'],
  piou: ['attack', 'dodge', 'hit', 'death'],
  turtle: ['attack', 'dodge', 'hit', 'death'],
};

const somMobByEnemy = {
  ratto: 'ratto', bat: 'bat', vampirebat: 'bat', slime: 'slime',
  snake: 'snake', scorpion: 'scorpion', croc: 'croc', fluffy: 'fluffy', skeleton: 'skeleton',
  'spore-sower': 'shroom', bosspinkie: 'pinkie', junglefowl: 'piou', snail: 'turtle',
};

// As in SoM, any mob without its own hit or dodge cue uses the shared one.
const somSharedEnemySounds = { hit: 'som:alteration/hit.ogg', dodge: 'som:alteration/dodge.ogg' };

// TMW cues for species with no Source of Mana equivalent: attack is the swing, hit is the hurt cue.
const tmwSpecies = (attack, hit, death) => ({ attack, hit, death });

const tmwEnemySounds = {
  zombie: tmwSpecies('monsters/zombie/zombie-miss1.ogg', null, 'monsters/zombie/zombie-dying1.ogg'),
  spider: tmwSpecies('monsters/spider/spider-hit1.ogg', null, 'monsters/spider/spider-die1.ogg'),
  'spider-queen': tmwSpecies('monsters/spider/spider-hit1.ogg'),
  bee: tmwSpecies('monsters/bee/bee-miss1.ogg', 'monsters/bee/hurt.ogg', 'monsters/bee/bee-die1.ogg'),
  yeti: tmwSpecies('monsters/yeti/yeti-miss1.ogg', 'monsters/yeti/yeti-hurt1.ogg', 'monsters/yeti/yeti-die1.ogg'),
  yetiking: tmwSpecies('monsters/yeti/yeti-miss1.ogg', 'monsters/yeti/yeti-hurt1.ogg', 'monsters/yeti/yeti-die1.ogg'),
  snowman: tmwSpecies('monsters/snowman_boss/miss1.ogg'),
  'snowman-boss': tmwSpecies('monsters/snowman_boss/miss1.ogg'),
  golem: tmwSpecies('monsters/golem/miss1.ogg', null, 'monsters/golem/die.ogg'),
  reaper: tmwSpecies('monsters/reaper/reaper-hit1.ogg', 'monsters/reaper/reaper-hurt1.ogg', 'monsters/reaper/reaper-die1.ogg'),
  jacko: tmwSpecies(null, null, 'monsters/pumpkin/die1.ogg'),
  forestdragon: tmwSpecies('monsters/dragon/hit.ogg', null, 'monsters/dragon/die.ogg'),
  nightdragon: tmwSpecies('monsters/dragon/hit.ogg', null, 'monsters/dragon/die.ogg'),
  frostiana: tmwSpecies('monsters/frostiana/hit1.ogg'),
  'slime-mother': tmwSpecies(null, 'monsters/slime-super/slime-super-hurt1.ogg', 'monsters/slime-super/slime-super-die1.ogg'),
  wisp: tmwSpecies(null, null, 'monsters/ghost/ghost-die1.ogg'),
};

// Source of Mana's cue for the species, else its TMW cue, else the shared hit/dodge cue.
// Attack and death return null when nothing matches so the caller's generic cue plays.
function enemySound(enemy, event) {
  const mob = somMobByEnemy[enemy.kind];
  if (mob && somMobEvents[mob].includes(event)) return `som:entities/${mob}/${event}.ogg`;
  return tmwEnemySounds[enemy.kind]?.[event] || somSharedEnemySounds[event] || null;
}

function createEnemy(kind, x, y, boss = false) {
  recordEnemyDiscovery(kind);
  const specs = {
    ratto: { radius: 12, speed: 65, hp: 3, color: '#dbb77b', archetype: 'leaper', leapMultiplier: 3.8, leapDuration: 0.28, leapCooldown: 1.9, leapWindup: 0.18, leapHeight: 13 },
    piou: { radius: 12, speed: 72, hp: 3, color: '#e9c77c', archetype: 'leaper', leapMultiplier: 4.4, leapDuration: 0.3, leapCooldown: 1.7, leapWindup: 0.16, leapHeight: 15 },
    maggot: { radius: 13, speed: 44, hp: 5, color: '#c4c77c', archetype: 'charger' },
    tortuga: { radius: 20, speed: 28, hp: 10, color: '#8bbf83', archetype: 'stalker' },
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
  // Phase changes add two recovery windows, so keep each guardian's baseline fight closer to a minute.
  const bossHp = Math.ceil(Math.max(500 + floorProgress * 130,
    estimatedPlayerDps() * (56 + floorProgress * 3)));
  const baseEnemyHp = Math.ceil(spec.hp * (1 + floorProgress * 0.32 + floorProgress * floorProgress * 0.025));
  const enemyHp = Math.max(baseEnemyHp, 5 + floorProgress * 2);
  const maxHp = boss ? bossHp : enemyHp;
  return {
    x,
    y,
    kind,
    radius: spec.radius,
    // Bosses keep a speed floor so a dodging player stays only slightly ahead.
    speed: boss ? Math.max(spec.speed * (1 + floorProgress * 0.08), 140 + floorProgress * 4)
      : spec.speed * (1 + Math.min(0.65, floorProgress * 0.075)),
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

function createBossSummon(kind, x, y) {
  const minion = createEnemy(kind, x, y);
  minion.bossSummoned = true;
  return minion;
}

function isEnemyAvailableForCurrentRun(kind) {
  const unlockAtSeconds = enemyUnlockAtSeconds[kind];
  if (!unlockAtSeconds) return true;
  const availableEnemies = runProgressionSnapshot?.enemyIds || createRunProgressionSnapshot().enemyIds;
  return availableEnemies.has(kind);
}

function enemyKindsForCurrentMap() {
  const fallbackKinds = ['slime', 'ratto', 'bat', 'snake', 'scorpion', 'bandit'];
  const pools = {
    tulimshar: ['slime', 'ratto', 'piou', 'bat', 'snake', 'scorpion', 'bandit'],
    hurnscald: ['ratto', 'croc', 'wisp', 'frog', 'spider', 'mouboo', 'bluepar', 'bee', 'spore-sower', 'fluffy', 'snail'],
    graveyard: ['skeleton', 'zombie', 'spider', 'vampirebat', 'maggot'],
    artis: ['ratto', 'wisp', 'skeleton', 'spider', 'slime', 'bluepar', 'zombie', 'fluffy', 'snail', 'maggot'],
    halinarzo: ['bandit', 'scorpion', 'mouboo', 'spore-sower', 'croc', 'junglefowl', 'tortuga'],
    nivalis: ['snowman', 'yeti', 'vampirebat', 'wisp', 'bee'],
    frostia: ['frostiana', 'snowman', 'yeti', 'vampirebat', 'spore-sower'],
    candor: ['troll', 'zombie', 'junglefowl', 'spore-sower', 'bandit', 'mouboo', 'snake'],
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

function applyBossAIPromotion(enemy) {
  enemies.push(enemy);
  if (enemy.boss || enemy.miniBoss || enemy.linkId) return enemy;
  const playtimeSeconds = typeof save !== 'undefined' && Number.isFinite(save.playtimeSeconds)
    ? save.playtimeSeconds : 0;
  const experienceTier = Math.min(8, Math.floor(playtimeSeconds / 1800));
  const unlockedCharacterCount = typeof save !== 'undefined' && Array.isArray(save.unlockedCharacters)
    ? save.unlockedCharacters.length : 0;
  if (currentFloor < 3 &&
      !(currentFloor === 1 && (experienceTier > 0 || unlockedCharacterCount >= 3))) return enemy;
  const bossCapable = ['scorpion', 'bandit', 'mouboo', 'spider', 'bluepar', 'skeleton', 'zombie', 'spore-sower',
    'junglefowl', 'snowman', 'yeti', 'vampirebat', 'frostiana', 'troll'];
  if (!bossCapable.includes(enemy.kind)) return enemy;
  const unlockBonus = Math.min(0.12, unlockedCharacterCount * 0.01);
  const chance = currentFloor === 1
    ? Math.min(0.3, experienceTier * 0.035 + unlockBonus * 0.5)
    : Math.min(0.52, (currentFloor - 2) * 0.1 + unlockBonus);
  if (Math.random() >= chance) return enemy;
  enemy.bossAI = true;
  enemy.phase = 1;
  enemy.maxHp = Math.ceil(enemy.maxHp * 1.25);
  enemy.hp = enemy.maxHp;
  enemy.speed *= 0.85;
  enemy.eliteGlow = true;
  return enemy;
}

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
    candor: ['troll', 'junglefowl', 'spore-sower'],
    worldedge: ['troll', 'skeleton', 'zombie'],
  };
  const availableKinds = (pools[currentRegionId()] || pools.tulimshar).filter(isEnemyAvailableForCurrentRun);
  return availableKinds.length > 0 ? availableKinds : ['bosspinkie', 'scorpion', 'bandit'];
}

function bossForCurrentArea() {
  return ({
    tulimshar: 'slime-mother', hurnscald: 'jacko',
    graveyard: 'reaper', artis: 'golem', halinarzo: 'banditlord',
    nivalis: 'snowman-boss', frostia: 'yetiking', candor: 'forestdragon', worldedge: 'nightdragon',
  })[currentRegionId()] || 'slime-mother';
}

function addRoomRewardPickup(room) {
  if (!room.rewardUpgrade || room.rewardClaimed) return;
  if (['miniboss', 'shrine'].includes(room.type) && !room.cleared) return;
  if (pickups.some((pickup) => pickup.kind === 'upgrade' && pickup.item?.id === room.rewardUpgrade.id)) return;
  pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, kind: 'upgrade', item: room.rewardUpgrade, room });
}

function playEnemyAttackSound(enemy, volume = enemy.boss ? 0.3 : 0.14) {
  const attackSound = enemySound(enemy, 'attack');
  if (attackSound) {
    playSound(attackSound, volume);
  } else if (enemy.boss) {
    playSound(enemy.kind === 'jacko' ? 'monsters/pumpkin/hit1.ogg' : 'ML/Roar.ogg', volume);
  } else {
    playSound('monsters/zombie/zombiemiss.ogg', volume);
  }
}

// Speed of an ordinary (non-boss, non-special) enemy shot; also the basis for how far enemies may lead a target.
function ordinaryShotSpeed(enemy) {
  const baseSpeed = enemy.kind === 'wisp' ? 185 : 155;
  return baseSpeed * (1 + Math.max(0, currentFloor - 1) * 0.12);
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
  let aimX = player.x;
  let aimY = player.y;
  if (!enemy.boss && currentFloor >= 2) {
    // Lead the target a little so standing still or running in a straight line gets punished.
    const lead = Math.min(0.55, 0.15 + (currentFloor - 2) * 0.12) * Math.min(1, distanceBetween(enemy, player) / 260);
    aimX += playerVelocity.x * lead;
    aimY += playerVelocity.y * lead;
  }
  if (enemy.shotTarget && (enemy.behavior === 'shoot-windup' || enemy.inBurst)) {
    aimX = enemy.shotTarget.x;
    aimY = enemy.shotTarget.y;
  }
  if (!enemy.boss && !enemy.miniBoss && !enemy.inBurst && !specialKind && currentFloor >= 3 &&
    enemy.kind !== 'wisp' && Math.random() < Math.min(0.5, (currentFloor - 2) * 0.15)) {
    enemy.burstRemaining = 2;
    enemy.burstTimer = 0.14;
  }
  const baseAngle = Math.atan2(aimY - enemy.y, aimX - enemy.x);
  const count = specialKind ? 1 : enemy.boss || enemy.tripleShot ? 3 : 1;
  const spread = enemy.boss && enemy.phase >= 2 ? 0.14 : 0.38;
  const speed = specialKind === 'venom' || specialKind === 'web-glob' ? 125 : enemy.boss || enemy.miniBoss
    ? (enemy.phase >= 2 ? 340 : 255) * (1 + Math.max(0, currentFloor - 1) * 0.18)
    : ordinaryShotSpeed(enemy);
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

function burstClusterOrb(orb, owner = 'enemy') {
  const shardCount = 8;
  const shardSpeed = 172;
  playSound('monsters/mushroom/spawn2.ogg', 0.24);
  for (let index = 0; index < shardCount; index += 1) {
    const angle = (Math.PI * 2 * index) / shardCount;
    const shard = {
      x: orb.x,
      y: orb.y,
      vx: Math.cos(angle) * shardSpeed,
      vy: Math.sin(angle) * shardSpeed,
      radius: 5,
      color: owner === 'player' && orb.magicCluster ? magicColor(orb) : '#d78be7',
      ttl: 1.6,
    };
    if (owner === 'player') {
      spawnPlayerProjectile({
        ...shard,
        size: 1,
        type: orb.magicCluster ? 'elemental' : 'spore-shard',
        element: orb.magicCluster ? orb.element : null,
        shape: orb.magicCluster ? 'seed' : undefined,
        slowOnHit: 0.75,
        hitEnemies: orb.target ? [orb.target] : [],
        ignoreObstacle: orb.obstacle,
        damage: orb.magicCluster ? Math.max(1, Math.round(orb.damage * 0.35))
          : Math.max(1, Math.ceil((player.damage + weapon.damageBonus) * 0.75)),
        trailTimer: 0,
      });
    } else {
      enemyProjectiles.push({ ...shard, damage: 1, kind: 'spore-shard' });
    }
  }
  addParticles(orb.x, orb.y, owner === 'player' && orb.magicCluster ? magicColor(orb) : '#e5a0f2', 14, 90);
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
  const phaseThree = enemy.phase >= 3;
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
      enemy.stateTimer = phaseThree ? 0.28 : phaseTwo ? 0.34 : 0.48;
    }
    return;
  }
  if (enemy.behavior === 'spider-pounce') {
    const pounceSpeed = enemy.speed * (phaseThree ? 6.1 : phaseTwo ? 5.4 : 4.2);
    moveEnemy(enemy, enemy.leapX * pounceSpeed, enemy.leapY * pounceSpeed, dt);
    if (enemy.stateTimer <= 0) {
      triggerCameraShake('spiderPounce');
      enemy.behavior = 'spider-recover';
      enemy.stateTimer = phaseThree ? 0.2 : phaseTwo ? 0.28 : 0.48;
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
      for (let index = 0; index < (phaseThree ? 4 : phaseTwo ? 3 : 2) && enemies.length < 7; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const spawn = findEnemySpawnPosition(
          enemy.x + Math.cos(angle) * 76,
          enemy.y + Math.sin(angle) * 76,
          17,
        );
        if (spawn) enemies.push(createBossSummon('spider', spawn.x, spawn.y));
      }
      enemy.behavior = 'jacko-idle';
    }
    return;
  }

  const tangentX = -directionY;
  const tangentY = directionX;
  const movementMultiplier = phaseThree ? 1.55 : phaseTwo ? 1.3 : 1;
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
    enemy.stateTimer = phaseThree ? 0.35 : phaseTwo ? 0.5 : 0.8;
    enemy.summonCooldown = phaseThree ? 8 : phaseTwo ? 10 : 15;
    enemy.attackCooldown = Math.max(enemy.attackCooldown, 1.2);
  } else if (visible && enemy.attackCooldown <= 0) {
    enemy.spiderAttackIndex = (enemy.spiderAttackIndex || 0) + 1;
    const attackSet = bossPhaseAttackSets['spider-queen'][enemy.phase - 1];
    const pounce = attackSet[(enemy.spiderAttackIndex - 1) % attackSet.length] === 'pounce';
    if (pounce) {
      playEnemyAttackSound(enemy, 0.18);
      const lead = phaseThree ? 0.18 : phaseTwo ? 0.28 : 0.42;
      const targetX = clamp(player.x + directionX * player.speed * lead, 82, ROOM_W - 82);
      const targetY = clamp(player.y + directionY * player.speed * lead, 82, ROOM_H - 82);
      const aimAngle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
      enemy.spiderPounceX = Math.cos(aimAngle);
      enemy.spiderPounceY = Math.sin(aimAngle);
      enemy.spiderPounceTarget = { x: targetX, y: targetY };
      enemy.behavior = 'spider-pounce-windup';
      enemy.stateTimer = phaseThree ? 0.32 : phaseTwo ? 0.48 : 0.68;
      enemy.attackCooldown = phaseThree ? 2.2 : phaseTwo ? 3.2 : 4;
    } else {
      playEnemyAttackSound(enemy, 0.18);
      enemy.behavior = 'spider-web-windup';
      enemy.stateTimer = phaseThree ? 0.32 : phaseTwo ? 0.5 : 0.8;
      enemy.attackCooldown = phaseThree ? 2.5 : phaseTwo ? 3.6 : 4.8;
    }
  }
}

function updateGolemBoss(enemy, dt, directionX, directionY, distance, visible) {
  const phaseTwo = enemy.phase >= 2;
  const phaseThree = enemy.phase >= 3;
  if (enemy.behavior === 'golem-slam-windup') {
    if (enemy.stateTimer <= 0) {
      const slamTarget = enemy.slamTarget || player;
      const slamRadius = phaseThree ? 120 : phaseTwo ? 96 : 64;
      triggerCameraShake('golemSlam');
      if (distanceBetween(slamTarget, player) <= slamRadius) damagePlayer(enemy.boss ? 2 : 1, enemy);
      fireEnemyProjectile(enemy);
      if (phaseTwo) fireJackoBurst(enemy, phaseThree ? 14 : 8);
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
      enemy.stateTimer = phaseThree ? 0.45 : phaseTwo ? 0.6 : 0.78;
      enemy.golemChargeSpeed = phaseThree ? 720 : phaseTwo ? 590 : 470;
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
      damagePlayer(1, enemy);
    }
    if (enemy.stateTimer <= 0) {
      triggerCameraShake('groundPound');
      fireBossRadial(enemy, phaseThree ? 18 : phaseTwo ? 12 : 8, 175, 'stone', '#c6b29a', elapsed * 0.2);
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
      fireBossRadial(enemy, phaseThree ? 20 : phaseTwo ? 14 : 8, 185, 'stone', '#c6b29a', elapsed * 0.25);
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
  const movementMultiplier = phaseThree ? 1.65 : phaseTwo ? 1.4 : 1;
  moveEnemy(enemy, directionX * enemy.speed * distanceDirection * movementMultiplier,
    directionY * enemy.speed * distanceDirection * movementMultiplier, dt);
  if (visible && enemy.attackCooldown <= 0) {
    const attackSet = bossPhaseAttackSets.golem[enemy.phase - 1];
    const attack = attackSet[(enemy.golemAttackIndex || 0) % attackSet.length];
    enemy.golemAttackIndex = (enemy.golemAttackIndex || 0) + 1;
    playEnemyAttackSound(enemy, 0.24);
    enemy.behavior = `golem-${attack}-windup`;
    enemy.stateTimer = attack === 'slam' ? phaseThree ? 0.48 : phaseTwo ? 0.64 : 0.92
      : attack === 'charge' ? 0.8 : 0.72;
    enemy.attackCooldown = phaseThree ? 2.3 : phaseTwo ? 3.2 : 4.2;
    enemy.slamTarget = { x: player.x, y: player.y };
  }
}

function uniqueBossSignature(kind, attackIndex = 0, phase = 1) {
  const phaseSets = bossPhaseAttackSets[kind];
  const rotation = phaseSets?.[clamp(phase, 1, 3) - 1] || bossAttackRotations[kind];
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
    const count = phaseTwo ? 3 : 2;
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
    if (distanceBetween(target, player) < radius) damagePlayer(enemy.boss ? 2 : 1, enemy);
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
      if (spawn) enemies.push(createBossSummon(
        summonKinds[Math.floor(Math.random() * summonKinds.length)], spawn.x, spawn.y));
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
        enemies.push(createBossSummon(kind, spawn.x, spawn.y));
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
    enemy.gustVisualTimer = 1.1;
    enemy.gustVisualAngle = angle;
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
  if (distanceBetween(player, enemy) < player.radius + enemy.radius + 40) damagePlayer(0.5, enemy);
  createGroundHazard(enemy.x, enemy.y, 'ooze');
  const trails = phaseTwo ? 3 : 2;
  for (let index = 0; index < trails; index += 1) {
    const angle = index * Math.PI * 2 / trails + Math.random() * 0.4;
    const reach = 110 + Math.random() * 60;
    createGroundHazard(
      clamp(enemy.x + Math.cos(angle) * reach, 80, ROOM_W - 80),
      clamp(enemy.y + Math.sin(angle) * reach, 80, ROOM_H - 80),
      'ooze',
    );
  }
  const aliveMinions = () => enemies.filter((other) => other.surpriseSpawn && other.kind === 'slime').length;
  for (let index = 0; index < (phaseTwo ? 3 : 2) && aliveMinions() < 3; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const spawn = findEnemySpawnPosition(enemy.x + Math.cos(angle) * 90, enemy.y + Math.sin(angle) * 90, 18, 0, enemy);
    if (!spawn) continue;
    const minion = createBossSummon('slime', spawn.x, spawn.y);
    minion.archetype = 'ranged';
    minion.arrowShot = true;
    minion.behavior = 'hover';
    minion.surpriseSpawn = true;
    enemies.push(minion);
  }
  addParticles(enemy.x, enemy.y, '#8df2a6', 20, 140);
}

function contactDamage(enemy) {
  return 1;
}

function updateUniqueBoss(enemy, dt, directionX, directionY, distance, visible) {
  const phaseTwo = enemy.phase >= 2;
  const phaseThree = enemy.phase >= 3;
  if (enemy.behavior === 'signature-laser-windup') {
    if (enemy.stateTimer <= 0) {
      enemy.behavior = 'signature-laser';
      enemy.stateTimer = phaseThree ? 0.9 : phaseTwo ? 0.72 : 0.52;
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
      damagePlayer(0.5, enemy);
    }
    if (enemy.stateTimer <= 0) {
      fireBossRadial(enemy, phaseThree ? 12 : phaseTwo ? 8 : 4, 205, 'void-orb', '#a98be4', enemy.laserAngle);
      enemy.behavior = 'signature-recover';
      enemy.stateTimer = 0.45;
      enemy.attackCooldown = phaseThree ? 1.8 : phaseTwo ? 2.6 : 3.7;
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
      damagePlayer(contactDamage(enemy), enemy);
    }
    if (enemy.stateTimer <= 0) {
      if (enemy.signature === 'yeti-slam') {
        triggerCameraShake('groundPound');
        if (distanceBetween(player, enemy) < player.radius + (phaseTwo ? 112 : 82)) damagePlayer(0.5, enemy);
        createGroundHazard(enemy.x, enemy.y, 'web');
      }
      if (enemy.signature === 'slime-crash') slimeMotherCrash(enemy, phaseTwo);
      enemy.behavior = 'signature-recover';
      enemy.stateTimer = 0.45;
      enemy.attackCooldown = phaseThree ? 1.8 : phaseTwo ? 2.6 : 3.8;
    }
    return;
  }
  if (enemy.behavior === 'signature-windup') {
    if (enemy.stateTimer <= 0) {
      const projectileCount = enemyProjectiles.length;
      resolveUniqueBossAttack(enemy, phaseTwo);
      if (enemy.miniBoss) {
        for (let index = projectileCount; index < enemyProjectiles.length; index += 1) {
          if (enemyProjectiles[index].damage > 0) enemyProjectiles[index].damage = contactDamage(enemy);
        }
      }
    }
    return;
  }
  if (enemy.behavior === 'signature-recover') {
    if (enemy.stateTimer <= 0) enemy.behavior = 'jacko-idle';
    return;
  }
  const spacing = distance > 90 ? 1 : 0;
  if (enemy.boss || enemy.miniBoss) {
    // Bosses and minibosses never stand still: they strafe constantly while closing in.
    const strafe = Math.sin(elapsed * 0.9 + enemy.x * 0.01) >= 0 ? 1 : -1;
      const pressure = enemy.miniBoss ? 1.25 : 1;
      const phasePressure = phaseThree ? 1.25 : 1;
      moveEnemy(enemy,
        (directionX * (distance > 90 ? 1 : 0.3) - directionY * strafe * 0.55) * enemy.speed * pressure * phasePressure,
        (directionY * (distance > 90 ? 1 : 0.3) + directionX * strafe * 0.55) * enemy.speed * pressure * phasePressure, dt);
  } else {
    moveEnemy(enemy, directionX * enemy.speed * spacing, directionY * enemy.speed * spacing, dt);
  }
  if (!visible || enemy.attackCooldown > 0) return;
  const phaseRotation = bossPhaseAttackSets[enemy.kind]?.[Math.min(2, enemy.phase - 1)] || bossAttackRotations[enemy.kind];
  enemy.signature = uniqueBossSignature(enemy.kind, enemy.bossAttackIndex || 0, enemy.phase);
  if (phaseRotation) {
    enemy.bossAttackIndex = ((enemy.bossAttackIndex || 0) + 1) % phaseRotation.length;
  }
  enemy.signatureTarget = { x: player.x, y: player.y };
  enemy.chargeHit = false;
  enemy.behavior = 'signature-windup';
  enemy.stateTimer = phaseThree ? 0.28 : phaseTwo ? 0.42 : enemy.miniBoss ? 0.55 : 0.68;
  enemy.attackCooldown = enemy.miniBoss
    ? (phaseThree ? 1 : phaseTwo ? 1.5 : 2.2)
    : phaseThree ? 1.6 : phaseTwo ? 2.6 : 3.7;
  playEnemyAttackSound(enemy, 0.24);
}

function updateArenaBoss(enemy, dt, directionX, directionY, distance, visible) {
  enemy.summonCooldown -= dt;
  const phaseTwo = enemy.phase >= 2;
  const phaseThree = enemy.phase >= 3;
  const movementMultiplier = phaseThree ? 1.65 : phaseTwo ? 1.35 : 1;

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
      const attackSet = bossPhaseAttackSets.jacko[enemy.phase - 1];
      const attack = attackSet[enemy.attackIndex % attackSet.length];
      enemy.attackIndex += 1;
      playEnemyAttackSound(enemy, 0.24);
      enemy.behavior = attack === 'roll' ? 'jacko-roll-windup'
        : attack === 'jump' ? 'jacko-jump-windup'
          : attack === 'shot' ? 'jacko-shot-windup' : 'jacko-ground-pound-windup';
      enemy.stateTimer = (phaseThree ? 0.38 : phaseTwo ? 0.55 : 0.78) + (attack === 'roll' ? 0.18 : 0);
      enemy.attackCooldown = phaseThree ? 2.2 + Math.random() * 0.4
        : phaseTwo ? 3.2 + Math.random() * 0.8 : 3.8 + Math.random() * 1.1;
      enemy.groundPoundTarget = phaseTwo && attack === 'ground-pound' ? { x: player.x, y: player.y } : null;
    }
    return;
  }

  if (enemy.behavior === 'jacko-summon') {
    if (enemy.stateTimer <= 0) {
      const kinds = enemyKindsForCurrentMap();
      for (let index = 0; index < (phaseThree ? 3 : 2) && enemies.length < 7; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const spawn = findEnemySpawnPosition(
          enemy.x + Math.cos(angle) * 76,
          enemy.y + Math.sin(angle) * 76,
        );
        if (spawn) enemies.push(createBossSummon(kind, spawn.x, spawn.y));
      }
      fireJackoBurst(enemy, phaseThree ? 10 : 6);
      enemy.behavior = 'jacko-idle';
    }
    return;
  }

  if (enemy.behavior === 'jacko-roll-windup') {
    if (enemy.stateTimer <= 0) {
      enemy.behavior = 'jacko-roll';
      enemy.leapX = directionX;
      enemy.leapY = directionY;
      enemy.stateTimer = phaseThree ? 1.15 : phaseTwo ? 1.05 : 0.9;
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
      enemy.stateTimer = phaseThree ? 0.56 : phaseTwo ? 0.7 : 0.85;
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
      enemy.stateTimer = phaseThree ? 0.34 : phaseTwo ? 0.48 : 0.65;
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
    const chargeSpeed = phaseThree ? 920 : phaseTwo ? 760 : 620;
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
        damagePlayer(1, enemy);
      }
    }
    if (targetReached || enemy.stateTimer <= 0) {
      enemy.x = enemy.groundPoundTarget.x;
      enemy.y = enemy.groundPoundTarget.y;
      enemy.behavior = 'jacko-ground-pound-land';
      enemy.stateTimer = 0.34;
      triggerCameraShake('groundPound');
      if (distanceBetween(player, enemy) < player.radius + 90) damagePlayer(2, enemy);
      fireJackoBurst(enemy, phaseThree ? 16 : phaseTwo ? 12 : 8);
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

// Summoned, split-off, ambush and altar-ambush foes are opt-in or repeatable, so they never drop materials.
function materialDropsAllowed(enemy) {
  return !(enemy.boss || enemy.bossSummoned || enemy.isOffspring || enemy.surpriseSpawn || enemy.noMaterialDrops);
}

function materialDropChance(key, enemy) {
  const strong = enemy.elite || enemy.miniBoss ? MATERIAL_DROP_TUNING.strongFoeMultiplier : 1;
  const luck = Math.max(0, player.luck || 0);
  return (MATERIAL_DROP_TUNING.rates[key] + luck * MATERIAL_DROP_TUNING.luckBonus[key]) * strong;
}

function rollMaterialDrops(x, y, enemy) {
  if (!materialDropsAllowed(enemy)) return;
  let offsetX = -12;
  for (const key of Object.keys(materialCatalog)) {
    if (Math.random() >= materialDropChance(key, enemy)) continue;
    pickups.push({ x: x + offsetX, y: y + 16, kind: 'material', material: key });
    offsetX += 24;
  }
}

function dropLoot(x, y, boss = false, bossSummoned = false, foe = null) {
  const gems = boss ? 8 : 1 + (Math.random() < 0.35 ? 1 : 0);
  for (let gem = 0; gem < gems; gem += 1) {
    pickups.push({ x: x + (Math.random() - 0.5) * 36, y: y + (Math.random() - 0.5) * 36, kind: 'xp' });
  }
  if (boss) {
    const abilityCount = ownedAbilityCount() + reservedAbilityCount();
    const abilities = shopItemCatalog.filter((item) => item.kind === 'ability' &&
      !ownedItems.has(item.id) && !reservedUpgradeIds.has(item.id) &&
      !abilityAlreadyOffered(item.id) &&
      (item.id === 'orbiting-projectiles' || abilityCount < 2) &&
      save.purchasedAbilityIds.includes(item.id) && isUpgradeAvailable(item));
    if (abilities.length > 0) {
      const ability = abilities[Math.floor(Math.random() * abilities.length)];
      markAbilityOffered(ability);
      pickups.push({ x, y, kind: 'upgrade', item: ability, room: currentRoom });
    } else {
      // No eligible ability: the guardian still leaves a heart and some zeny.
      pickups.push({ x, y, kind: 'heart' });
      spawnCoin(x + 18, y);
      spawnCoin(x - 18, y);
    }
    // Every guardian leaves a Lifestone; it never counts as owned, so each boss drops another.
    const lifestone = shopItemCatalog.find((item) => item.id === 'lifestone');
    if (lifestone) pickups.push({ x: x + 44, y, kind: 'upgrade', item: lifestone, room: currentRoom });
    return;
  }
  if (foe) rollMaterialDrops(x, y, foe);
  if (Math.random() < 0.3) spawnCoin(x + 14, y);
  if (!bossSummoned && Math.random() < 0.14) pickups.push({ x, y, kind: 'heart' });
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

function damageEnemy(enemy, damage, impactX = player.x, impactY = player.y, ignoreFirstHitCap = false, applyHitStop = true) {
  if (damage > 0) damage = Math.max(1, Math.round(damage * curioMultiplier('damage')));
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
  // A single volley or blast cannot erase a fresh enemy before it can react.
  if (damage > 0 && enemy.hp === enemy.maxHp && enemy.maxHp > 1) enemy.firstHitTimer = 0.12;
  if (damage > 0 && enemy.firstHitTimer > 0) {
    damage = Math.min(damage, Math.max(0, enemy.hp - 1));
  }
  enemy.hp -= damage;
  enemy.hitFlash = 0.16;
  // Elemental ticks pass applyHitStop = false and would flood the screen with numbers.
  if (applyHitStop && typeof addDamageNumber === 'function') {
    addDamageNumber(enemy.x, enemy.y - enemy.radius - 8, damage);
  }
  const hitSound = enemy.hp > 0 && damage > 0 && !(enemy.hitSoundUntil > performance.now())
    ? enemySound(enemy, 'hit') : null;
  if (hitSound) {
    enemy.hitSoundUntil = performance.now() + 140;
    playSound(hitSound, enemy.boss ? 0.2 : 0.16);
  }
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
  if (applyHitStop) hitStopTimer = Math.max(hitStopTimer, enemy.boss ? 0.04 : 0.025);
  const nextPhase = enemy.phase === 1 && enemy.hp <= enemy.maxHp * (2 / 3) ? 2
    : enemy.phase === 2 && enemy.hp <= enemy.maxHp / 3 ? 3 : 0;
  if ((enemy.boss || enemy.miniBoss) && nextPhase) {
    enemy.phase = nextPhase;
    enemy.attackCooldown = Math.min(enemy.attackCooldown, 0.7);
    enemy.summonCooldown = Math.min(enemy.summonCooldown, 4);
    enemy.bossAttackIndex = 0;
    enemy.golemAttackIndex = 0;
    enemy.spiderAttackIndex = 0;
    player.hp = Math.min(player.maxHp, player.hp + phaseRewardHealAmount());
    updateHud();
    if (enemy.kind === 'yetiking' || enemy.kind === 'yeti') {
      enemy.yetiBaseSpeed = enemy.speed;
      enemy.behavior = 'yeti-berserk-windup';
      enemy.stateTimer = 0.55;
      enemy.signatureTarget = { x: player.x, y: player.y };
    }
    const phaseName = ['I', 'II', 'III'][enemy.phase - 1];
    showMessage(`${enemy.title} enters Phase ${phaseName}! You recover up to two hearts.`, 3.5);
    addParticles(enemy.x, enemy.y, enemy.phase === 3 ? '#f5dd82' : '#ff8e38', 24, 150);
  }
  if (enemy.hp <= 0) {
    score += enemy.boss ? 100 : 10;
    // A satisfying pop on every kill.
    addParticles(enemy.x, enemy.y - 10, enemy.color || '#ffffff', enemy.boss ? 40 : 16, enemy.boss ? 260 : 170);
    addParticles(enemy.x, enemy.y - 10, '#fff6d8', enemy.boss ? 18 : 6, 120);
    runStats.kills += 1;
    if (enemy.boss) runStats.guardians += 1;
    onClassKill(enemy);
    killStreak = killStreakTimer > 0 ? killStreak + 1 : 1;
    killStreakTimer = 3.2;
    if (killStreak % 3 === 0) {
      const bonusCoin = reserveCoin();
      if (bonusCoin) {
        coins += 1;
        runStats.zenyFound += 1;
      }
      streakCallout.timer = streakCallout.duration;
      streakCallout.x = player.x;
      streakCallout.y = player.y - 42;
      streakCallout.text = `${killStreak} CHAIN${bonusCoin ? '  +1 ZENY' : ''}`;
      addParticles(enemy.x, enemy.y, '#ffe08b', 8, 95);
      playSound('special/fanfare.ogg', 0.12);
    }
    playSound(enemy.kind === 'jacko' ? 'monsters/pumpkin/die1.ogg'
      : enemySound(enemy, 'death') || 'monsters/zombie/zombiedie.ogg', enemy.boss ? 0.65 : 0.38);
    if (enemy.boss || enemy.miniBoss) triggerCameraShake('bomb');
    dropLoot(enemy.x, enemy.y, enemy.boss, enemy.bossSummoned, enemy);
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
      showMessage(`${linkedTwin.title || monsterDisplayName(linkedTwin.kind)} loses its linked armor.`, 2.5);
    }
    spawnEnemyOffspring(enemy);
    if (wasBoss || wasMiniBoss) {
      // Telegraphed attacks still in flight must not land after the guardian has fallen.
      bossStrikes.length = 0;
      enemyProjectiles.length = 0;
      for (let i = groundHazards.length - 1; i >= 0; i--) if (groundHazards[i].owner !== 'player') groundHazards.splice(i, 1);
      for (let i = bombs.length - 1; i >= 0; i--) if (bombs[i].owner === 'enemy') bombs.splice(i, 1);
      player.invuln = Math.max(player.invuln, 1.2);
    }
    if (wasBoss) {
      for (const minion of enemies.splice(0)) addParticles(minion.x, minion.y, minion.color || '#ffffff', 10, 110);
      enemyProjectiles.length = 0;
      bossStrikes.length = 0;
      groundHazards.length = 0;
      for (let i = bombs.length - 1; i >= 0; i--) if (bombs[i].owner === 'enemy') bombs.splice(i, 1);
      playSound('som:alteration/quest-done.ogg', 0.5);
      recordFloorClear(currentFloor);
      const unlockedId = ({
        'slime-mother': 'tulimshar-guard', bosspinkie: 'candor-runner',
        jacko: 'hurnscald-herbalist', golem: 'artis-archivist',
        reaper: 'graveyard-keeper', banditlord: 'halinarzo-ranger',
        'snowman-boss': 'nivalis-oracle', yetiking: 'frostia-reclaimer',
        forestdragon: 'candor-keeper', nightdragon: 'world-edge-veteran',
      })[enemy.kind];
      const newlyUnlocked = unlockedId ? unlockCharacter(unlockedId) : false;
      const unlockedName = characterRoster.find((entry) => entry.id === unlockedId)?.name;
      recordStory(`${enemy.title} defeated`, `${enemy.title} has fallen, and the Kaore in this land begins to thin.${newlyUnlocked && unlockedName ? ` ${unlockedName} is now available.` : ''}`);
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

function moveEnemy(enemy, vx, vy, dt) {
  if (calmMobBehaviors.has(enemy.behavior) || calmBossStates.has(enemy.behavior)) {
    const steered = steerEnemyVelocity(enemy, vx, vy);
    vx = steered.x;
    vy = steered.y;
  }
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
  enemy.x = clamp(enemy.x, wallClearance, ROOM_W - wallClearance);
  enemy.y = clamp(enemy.y, wallClearance, ROOM_H - wallClearance);
}

const steeringCover = [];

function steerEnemyVelocity(enemy, vx, vy) {
  const speed = Math.hypot(vx, vy);
  if (speed < 1) return { x: vx, y: vy };
  const clearance = ROOM_WALL_THICKNESS + enemy.radius + WALL_COLLISION_PADDING;
  const lookahead = Math.max(40, speed * 0.4);
  const dx = vx / speed;
  const dy = vy / speed;
  // Only cover within sweep distance of any heading can block it, so gather that once per call instead of testing
  // every breakable for each of the up to seven candidate headings.
  const reach = lookahead + enemy.radius + 3;
  steeringCover.length = 0;
  for (const obstacle of breakables) {
    if (obstacle.broken) continue;
    if (Math.abs(obstacle.x - enemy.x) > reach + obstacle.radius ||
        Math.abs(obstacle.y - enemy.y) > reach + obstacle.radius) continue;
    steeringCover.push(obstacle);
  }
  const free = (x, y) => {
    const endX = enemy.x + x * lookahead;
    const endY = enemy.y + y * lookahead;
    if (endX < clearance || endX > ROOM_W - clearance || endY < clearance || endY > ROOM_H - clearance) return false;
    for (const obstacle of steeringCover) {
      const projection = clamp(((obstacle.x - enemy.x) * x + (obstacle.y - enemy.y) * y) / lookahead, 0, 1);
      const gap = Math.hypot(obstacle.x - enemy.x - x * lookahead * projection,
        obstacle.y - enemy.y - y * lookahead * projection);
      if (gap < obstacle.radius + enemy.radius + 3) return false;
    }
    return true;
  };
  if (free(dx, dy)) return { x: vx, y: vy };
  const side = enemy.navigationSide || enemy.strafeDirection || 1;
  for (const turn of [Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4]) {
    for (const sign of [side, -side]) {
      const angle = turn * sign;
      const x = dx * Math.cos(angle) - dy * Math.sin(angle);
      const y = dx * Math.sin(angle) + dy * Math.cos(angle);
      if (free(x, y)) {
        enemy.navigationSide = sign;
        return { x: x * speed, y: y * speed };
      }
    }
  }
  return { x: 0, y: 0 };
}

// R7: melee mobs that may commit at once. The floor-based base is capped at 3; the weapon-style bonus and the input
// slot add to it, but never past maxMeleeAttackers.
function meleeAttackerLimit(styleTokenBonus, inputSlots) {
  return Math.min(ADAPTIVE_AI_TUNING.maxMeleeAttackers,
    Math.min(3, 1 + Math.floor(currentFloor / 2)) + styleTokenBonus + inputSlots);
}

function applyMobTactics(enemy, dt, directionX, directionY, distance) {
  const floorScale = Math.max(0, currentFloor - 1);
  enemy.dodgeCooldown = Math.max(0, (enemy.dodgeCooldown ?? 0.8) - dt);
  enemy.tacticTimer = (enemy.tacticTimer ?? Math.random() * 1.2) - dt;

  if (!enemy.enraged && enemy.maxHp >= 4 && enemy.hp <= enemy.maxHp * 0.3) {
    enemy.enraged = true;
    enemy.speed *= 1.25;
    enemy.attackCooldown = Math.min(enemy.attackCooldown, 0.4);
    addParticles(enemy.x, enemy.y, '#ff5a3c', 10, 90);
  }
  if (enemy.enraged) enemy.attackCooldown -= dt * 0.5;

  if (enemy.burstRemaining > 0) {
    enemy.burstTimer -= dt;
    if (enemy.burstTimer <= 0) {
      enemy.burstRemaining -= 1;
      enemy.burstTimer = 0.14;
      enemy.inBurst = true;
      fireEnemyProjectile(enemy);
      enemy.inBurst = false;
    }
  }

  if (enemy.dodgeTimer > 0) {
    enemy.dodgeTimer -= dt;
    moveEnemy(enemy, enemy.dodgeX * enemy.speed * 3.4, enemy.dodgeY * enemy.speed * 3.4, dt);
    return true;
  }

  if (!calmMobBehaviors.has(enemy.behavior)) return false;
  const styleAI = aiStyleProfile();
  const input = aiInputProfile();
  if (tryDashPressure(enemy)) return true;
  if (enemy.attackCooldown <= 0 && distance < 430 && !mobAttackBeatAvailable(enemy)) {
    const ring = (styleRangedArchetypes.includes(enemy.archetype) ? 265 : 205) * styleAI.ringScale;
    const radial = distance > ring + 25 ? 0.6 : distance < ring - 25 ? -0.6 : 0;
    const side = enemy.strafeDirection || 1;
    moveEnemy(enemy, (directionX * radial - directionY * side * 0.55) * enemy.speed,
      (directionY * radial + directionX * side * 0.55) * enemy.speed, dt);
    return true;
  }

  const evasive = styleAI.dodgeAll || ['ranged', 'stalker', 'diver', 'cluster-caster'].includes(enemy.archetype);
  if ((currentFloor >= 2 || adaptiveActive()) && evasive && enemy.dodgeCooldown <= 0) {
    for (const shot of projectiles) {
      if (shot.owner === 'companion') continue;
      const rx = enemy.x - shot.x;
      const ry = enemy.y - shot.y;
      const shotSpeed = Math.hypot(shot.vx, shot.vy) || 1;
      const ahead = (rx * shot.vx + ry * shot.vy) / shotSpeed;
      if (ahead < 20 || ahead > 190) continue;
      if (adaptiveActive() && ahead / shotSpeed < ADAPTIVE_AI_TUNING.mobReactionSeconds) continue;
      const side = (rx * -shot.vy + ry * shot.vx) / shotSpeed;
      if (Math.abs(side) > enemy.radius + shot.radius + 22) continue;
      enemy.dodgeCooldown = Math.max(0.9, 2.4 - floorScale * 0.25);
      const proximity = clamp(1 - distance / 260, 0, 1);
      const chance = (0.15 + floorScale * 0.1) * styleAI.dodgeScale +
        input.dodgeBonus + input.nearDodgeBonus * proximity;
      if (Math.random() > Math.min(0.75, chance)) break;
      const sign = side >= 0 ? 1 : -1;
      enemy.dodgeX = (-shot.vy / shotSpeed) * sign;
      enemy.dodgeY = (shot.vx / shotSpeed) * sign;
      enemy.dodgeTimer = 0.16;
      playSound(enemySound(enemy, 'dodge'), 0.14);
      addParticles(enemy.x, enemy.y, '#ffffff', 3, 40);
      return true;
    }
  }

  let nearestAlly = null;
  let nearestDistance = Infinity;
  const meleeArchetypes = ['charger', 'leaper', 'stalker', 'diver'];
  if (meleeArchetypes.includes(enemy.archetype) && distance < 420) {
    // Hades-style attack tokens: only a few melee mobs may commit at once; the rest circle and wait.
    const maxAttackers = meleeAttackerLimit(styleAI.tokenBonus, input.attackSlots);
    // A melee player mid-recovery is open: waiting foes line up their next strike for the end of it.
    if (styleAI.punishRecovery && player.fireCooldown > 0.2 && distance < 220) {
      enemy.attackCooldown = Math.min(enemy.attackCooldown, 0.25);
    }
    const engaged = enemies.filter((other) => other !== enemy && meleeArchetypes.includes(other.archetype) &&
      !calmMobBehaviors.has(other.behavior)).length;
    if (engaged >= maxAttackers && enemy.attackCooldown <= 0.3) {
      const ring = 215;
      const radial = distance > ring + 30 ? 0.8 : distance < ring - 30 ? -0.8 : 0;
      const side = enemy.strafeDirection || 1;
      moveEnemy(enemy,
        (directionX * radial - directionY * side * 0.6) * enemy.speed,
        (directionY * radial + directionX * side * 0.6) * enemy.speed, dt);
      enemy.attackCooldown = Math.max(enemy.attackCooldown, 0.25);
      return true;
    }
  }
  for (const ally of enemies) {
    if (ally === enemy || ally.boss) continue;
    const gap = distanceBetween(enemy, ally);
    if (gap < nearestDistance) {
      nearestDistance = gap;
      nearestAlly = ally;
    }
    const spacing = (enemy.radius + ally.radius + 10) * styleAI.spacingScale;
    if (gap < spacing && gap > 0) {
      moveEnemy(enemy, ((enemy.x - ally.x) / gap) * enemy.speed * 0.8,
        ((enemy.y - ally.y) / gap) * enemy.speed * 0.8, dt);
    }
  }
  if (nearestAlly && enemy.tacticTimer <= 0 && nearestDistance < 180) {
    const relX = nearestAlly.x - enemy.x;
    const relY = nearestAlly.y - enemy.y;
    const cross = -directionY * relX + directionX * relY;
    // Circle the opposite way from the nearest ally so the pack surrounds the player.
    enemy.strafeDirection = cross >= 0 ? -1 : 1;
    enemy.tacticTimer = 1.2 + Math.random();
  }
  if (input.strafe > 0 && distance < 430 && distance > enemy.radius + player.radius + 20 &&
      enemy.attackCooldown > 0.3) {
    if (enemy.tacticTimer <= 0) {
      enemy.strafeDirection = -(enemy.strafeDirection || 1);
      enemy.tacticTimer = inputAI.mode === 'controller' ? 0.65 : 1.1;
    }
    const side = enemy.strafeDirection || 1;
    const targetX = player.x + playerVelocity.x * input.flankLead;
    const targetY = player.y + playerVelocity.y * input.flankLead;
    const flankAngle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
    const proximity = inputAI.mode === 'touch' ? 0.5 + clamp(1 - distance / 260, 0, 1) : 1;
    // Added on top of the archetype's own movement, so it is capped to keep the total within maxTacticalSpeed.
    const lateral = enemy.speed * Math.min(input.strafe * proximity, TACTICAL_LATERAL_CAP);
    moveEnemy(enemy, -Math.sin(flankAngle) * side * lateral, Math.cos(flankAngle) * side * lateral, dt);
  }
  return false;
}

function dashPressureActive() {
  return bossStrikes.some((strike) => strike.dashCheck);
}

function mobAttackBeatAvailable(enemy) {
  if (dashPressureActive()) return false;
  const squad = enemies.filter((other) => !other.boss && !other.miniBoss && !other.bossAI &&
    other.hp > 0 && distanceBetween(other, player) < 430 && hasLineOfSight(other, player));
  if (squad.some((other) => other !== enemy && other.attackSpacingTimer > 0)) return false;
  const active = squad.filter((other) => !calmMobBehaviors.has(other.behavior) &&
    other.behavior !== 'recover').length;
  if (active >= (currentFloor >= 4 ? 2 : 1) + aiInputProfile().attackSlots) return false;
  const next = squad.filter((other) => calmMobBehaviors.has(other.behavior) && other.attackCooldown <= 0)
    .sort((a, b) => a.attackCooldown - b.attackCooldown)[0];
  return !next || next === enemy;
}

function spawnBossStrike(x, y, radius, duration, damage, knockFrom = null) {
  if (bossStrikes.length >= 14) return;
  bossStrikes.push({
    x: clamp(x, 70, ROOM_W - 70),
    y: clamp(y, 70, ROOM_H - 70),
    radius, duration, timer: duration, damage, knockFrom,
  });
}

// R1: the pulse is sized so that walking away at ground speed during the warning cannot clear it, for any class.
function dashPulseRadius() {
  const pulse = ADAPTIVE_AI_TUNING.pulse;
  return clamp(Math.round(baseGroundSpeed() * aiInputProfile().warning * pulse.escapeMargin),
    pulse.radiusMin, pulse.radiusMax);
}

// Conditions that keep a wide pulse from starting, one named predicate each (true blocks the pulse).
function playerCannotDashNow() {
  return dashCooldown > 0 || dashTimer > 0 || player.invuln > 0;
}

function anotherAttackInProgress() {
  return enemies.some((other) => other.hp > 0 && (other.extraWindup > 0 || other.burstRemaining > 0 || other.linkDash ||
    (!calmMobBehaviors.has(other.behavior) && !calmBossStates.has(other.behavior) &&
    other.behavior !== 'recover')));
}

function hostileThreatsNearPlayer(clearance) {
  return enemyProjectiles.length > 0 || bombs.some((bomb) => bomb.owner === 'enemy') ||
    groundHazards.some((hazard) => hazard.owner !== 'player' &&
      distanceBetween(hazard, player) < hazard.radius + clearance);
}

// Why `enemy` cannot start a wide pulse right now, or null when it can.
function dashPressureBlocker(enemy) {
  const pulse = ADAPTIVE_AI_TUNING.pulse;
  if (!adaptiveActive()) return 'adaptive-off';
  if (currentFloor < pulse.minFloor) return 'floor-too-low';
  if (inputAI.pressureCooldown > 0 || currentRoom.cleared) return 'cooldown';
  if (playerCannotDashNow()) return 'player-cannot-dash';
  if (bossStrikes.length > 0) return 'strike-active';
  if (distanceBetween(enemy, player) > pulse.range || !hasLineOfSight(enemy, player)) return 'out-of-reach';
  if ((enemy.boss || enemy.miniBoss) && enemy.phase < 2) return 'boss-phase';
  if (anotherAttackInProgress()) return 'attack-in-progress';
  if (hostileThreatsNearPlayer(dashPulseRadius())) return 'hostile-threats';
  return null;
}

function tryDashPressure(enemy) {
  if (dashPressureBlocker(enemy)) return false;
  const pulse = ADAPTIVE_AI_TUNING.pulse;
  const warning = aiInputProfile().warning;
  spawnBossStrike(player.x, player.y, dashPulseRadius(), warning, enemy.boss ? pulse.bossDamage : pulse.mobDamage);
  bossStrikes[bossStrikes.length - 1].dashCheck = true;
  inputAI.pressureCooldown = enemy.boss ? pulse.bossCooldown : pulse.mobCooldown;
  // R3: no follow-up attack lands inside the invulnerability a hit from this pulse would grant.
  enemy.attackCooldown = Math.max(enemy.attackCooldown, warning + PLAYER_HIT_INVULN_SECONDS);
  showMessage('Wide pulse! Dash at the flash.', warning + 0.5);
  playEnemyAttackSound(enemy, 0.2);
  return true;
}

function updateBossStrikes(dt) {
  for (let index = bossStrikes.length - 1; index >= 0; index -= 1) {
    const strike = bossStrikes[index];
    strike.timer -= dt;
    if (strike.timer > 0) continue;
    bossStrikes.splice(index, 1);
    addParticles(strike.x, strike.y, '#ff6a4a', 14, 150);
    triggerCameraShake('groundPound');
    if (distanceBetween(player, strike) < strike.radius + player.radius * 0.6) {
      damagePlayer(strike.damage, strike);
      if (strike.knockFrom && mode === 'playing') {
        const angle = Math.atan2(player.y - strike.y, player.x - strike.x);
        player.x = clamp(player.x + Math.cos(angle) * 90, 12, ROOM_W - 12);
        player.y = clamp(player.y + Math.sin(angle) * 90, 12, ROOM_H - 12);
      }
    }
  }
}

function applyBossPressure(enemy, dt, directionX, directionY, distance) {
  if (enemy.x < 0 || enemy.x > ROOM_W || enemy.y < 0 || enemy.y > ROOM_H) return;
  const mini = !enemy.boss;
  const phaseTwo = enemy.phase >= 2;
  if (!calmBossStates.has(enemy.behavior)) return;
  if (bossStrikes.length > 0 || enemy.extraWindup > 0) return;
  if (tryDashPressure(enemy)) return;
  const still = playerStillTimer > 0.9;
  enemy.pressureCooldown = (enemy.pressureCooldown ?? 2.5) - dt;
  enemy.smackCooldown = Math.max(0, (enemy.smackCooldown ?? 1.2) - dt);

  if (enemy.smackCooldown <= 0 && distance < enemy.radius + 100) {
    spawnBossStrike(enemy.x, enemy.y, enemy.radius + 105, 1.1, mini ? 1 : 2, enemy);
    enemy.smackCooldown = phaseTwo ? 3.2 : 4;
    playEnemyAttackSound(enemy, 0.2);
    return;
  }

  // A stationary player is hunted: the boss closes in faster the longer they stay put.
  if (still && calmBossStates.has(enemy.behavior) && distance > enemy.radius + 50) {
    const hunt = Math.min(1.1, 0.5 + (playerStillTimer - 0.9) * 0.25);
    moveEnemy(enemy, directionX * enemy.speed * hunt, directionY * enemy.speed * hunt, dt);
  }

  if (enemy.boss && !enemy.miniBoss && !adaptiveEnemiesEnabled()) return;
  if (enemy.pressureCooldown > 0) return;
  const cadence = ADAPTIVE_AI_TUNING.bossPressureCadence;
  enemy.pressureCooldown = (still ? 2.0 : phaseTwo ? 3.4 : 4.4) * (mini ? cadence.mini : cadence.boss);
  const lead = still ? 0.2 : 0.45;
  const futureX = player.x + playerVelocity.x * lead;
  const futureY = player.y + playerVelocity.y * lead;
  const strikeRadius = mini ? 50 : 60;
  const warning = 1.25;
  const damage = mini ? 1 : 2;
  spawnBossStrike(futureX, futureY, strikeRadius, warning + (phaseTwo ? 0.15 : 0), damage);
  showMessage(still ? 'Keep moving!' : 'A foe marks your path!', 1.2);
}

function updateEnemy(enemy, dt) {
  enemy.firstHitTimer = Math.max(0, (enemy.firstHitTimer || 0) - dt);
  enemy.attackSpacingTimer = Math.max(0, (enemy.attackSpacingTimer || 0) - dt);
  if (updateWildMagicStatus(enemy, dt)) return;
  const previousBehavior = enemy.behavior;
  if ((enemy.boss || enemy.miniBoss) && calmBossStates.has(enemy.behavior) && bossStrikes.length > 0) {
    enemy.attackCooldown = Math.max(enemy.attackCooldown, dt * 5 + 0.1);
  }
  updateEnemyBehavior(enemy, dt);
  if (!enemy.boss && !enemy.miniBoss && !enemy.bossAI &&
    calmMobBehaviors.has(previousBehavior) && !calmMobBehaviors.has(enemy.behavior)) {
    const input = aiInputProfile();
    enemy.attackSpacingTimer = Math.max(ADAPTIVE_AI_TUNING.minAttackGap,
      (currentFloor >= 4 ? 0.35 : 0.55) * input.beatScale);
    if (enemy.behavior === 'shoot-windup') {
      const floorLead = Math.min(ADAPTIVE_AI_TUNING.floorLeadCap, Math.max(0, currentFloor - 1) * 0.1);
      // R9: input prediction closes only a share of the remaining flight time, so it never becomes perfect aim.
      const flightTime = distanceBetween(enemy, player) / ordinaryShotSpeed(enemy);
      const lead = floorLead + input.shotShare * Math.max(0, flightTime - floorLead);
      enemy.shotTarget = { x: player.x + playerVelocity.x * lead, y: player.y + playerVelocity.y * lead };
    }
  }
  if ((enemy.boss || enemy.miniBoss) && enemy.behavior !== previousBehavior &&
    enemy.behavior.includes('windup')) {
    enemy.stateTimer = Math.max(enemy.stateTimer, enemy.boss ? 0.95 : 0.7);
  }
}

function updateEnemyBehavior(enemy, dt) {
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  enemy.swordHitEffectTimer = Math.max(0, (enemy.swordHitEffectTimer || 0) - dt);
  enemy.gustVisualTimer = Math.max(0, (enemy.gustVisualTimer || 0) - dt);
  enemy.freezeTimer = Math.max(0, enemy.freezeTimer || 0);
  enemy.slowTimer = Math.max(0, enemy.slowTimer || 0);
  if (enemy.freezeTimer > 0) {
    enemy.freezeTimer = Math.max(0, enemy.freezeTimer - dt);
    if (enemy.freezeTimer > 0) return;
  }
  if (enemy.slowTimer > 0) {
    enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
    dt *= enemy.boss ? 0.8 : enemy.miniBoss ? 0.65 : 0.4;
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
    ? 1 + Math.max(0, currentFloor - 1) * 0.06 : 1 + Math.max(0, currentFloor - 1) * 0.08) * (enemy.boss ? 1.3 : 1) *
    styleCooldownRate(enemy) * (!enemy.boss && !enemy.miniBoss && !enemy.bossAI ? aiInputProfile().tempo : 1);
  enemy.stateTimer -= dt;
  enemy.spitFlash = Math.max(0, enemy.spitFlash - dt);

  if (enemy.boss || enemy.miniBoss || enemy.bossAI) {
    if (enemy.boss || enemy.miniBoss) applyBossPressure(enemy, dt, directionX, directionY, distance);
    if (adaptiveEnemiesEnabled() && bossStrikes.length > 0 && calmBossStates.has(enemy.behavior)) return;
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
  if (applyMobTactics(enemy, dt, directionX, directionY, distance)) return;

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
        const summoned = createEnemy('fluffy', spawn.x, spawn.y);
        summoned.noMaterialDrops = true;
        enemies.push(summoned);
        addParticles(spawn.x, spawn.y, '#f5e5c8', 9, 42);
        playSound('monsters/fluffy/hit1.ogg', 0.12);
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
          damagePlayer(1, enemy);
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
        damagePlayer(0.5, enemy);
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
  const preferredRange = 220 + Math.min(70, (currentFloor - 1) * 10);
  const strafeSpeed = Math.min(1.05, 0.65 + (currentFloor - 1) * 0.06);
  let moveX = tangentX * enemy.speed * strafeSpeed;
  let moveY = tangentY * enemy.speed * strafeSpeed;
  if (distance > preferredRange + 35) {
    moveX += directionX * enemy.speed * 0.65;
    moveY += directionY * enemy.speed * 0.65;
  } else if (distance < preferredRange - 65) {
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
