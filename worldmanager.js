/* Rooms, map generation, pickups, shops, and world objects. */

function curioMultiplier(key) {
  let multiplier = chaosStatus?.[key] || 1;
  for (const item of shopItemCatalog) {
    if (item.kind === 'curio' && item.effects?.[key] && ownedItems.has(item.id)) multiplier *= item.effects[key];
  }
  return multiplier;
}

function rollChaosStatus(duration) {
  const next = chaosStatuses[Math.floor(Math.random() * chaosStatuses.length)];
  chaosStatus = next;
  chaosTimer = duration;
  if (next.ghost) player.invuln = Math.max(player.invuln, 3);
  showMessage(next.text, 2.2);
  const parts = Object.entries(next).filter(([key]) => effectKeyLabels[key]).map(([key, value]) =>
    `${value > 1 ? '+' : '-'}${effectKeyLabels[key]}`);
  showPickupBanner('Status change', next.ghost ? ['+BRIEF INVULNERABILITY'] : parts);
}

function updateChaos(dt, roomEntered = false) {
  const room = ownedItems.has('curio-dice');
  const timed = ownedItems.has('curio-wild-card');
  if (!room && !timed) {
    chaosStatus = null;
    return;
  }
  if (roomEntered) {
    if (room) rollChaosStatus(600);
    return;
  }
  chaosTimer -= dt;
  if (timed && chaosTimer <= 0) rollChaosStatus(14);
}

function spawnCurioDrop(x, y, room) {
  const stocked = new Set((currentRoom?.shopStock || []).map((item) => item.id));
  const pool = shopItemCatalog.filter((item) => item.kind === 'curio' && !ownedItems.has(item.id) &&
    !stocked.has(item.id) && !reservedUpgradeIds.has(item.id));
  if (pool.length === 0) return false;
  pickups.push({ x, y, kind: 'curio', item: pool[Math.floor(Math.random() * pool.length)], room });
  return true;
}

function applyRandomFireMode(item) {
  const style = item.style;
  if (!['melee', 'bow', 'magic'].includes(style) ||
      !['skill', 'weapon', 'mod', 'element'].includes(item.kind)) return null;
  const chargeAlreadyFound = Object.values(fireModes).includes('charge');
  const chargedModeFound = !chargeAlreadyFound && Math.random() < 0.05;
  const choices = style === 'bow' ? ['rapid', 'triple'] : ['rapid'];
  const selected = chargedModeFound ? 'charge' : choices[Math.floor(Math.random() * choices.length)];
  if (chargedModeFound) {
    for (const weaponStyle of ['melee', 'bow', 'magic']) fireModes[weaponStyle] = 'charge';
  } else {
    fireModes[style] = selected;
  }
  player.meleeCharge = 0;
  player.bowHold = 0;
  player.magicHold = 0;
  player.chargeFraction = 0;
  return selected;
}

function markAbilityOffered(item) {
  if (item?.kind === 'ability' && typeof runOfferedAbilityIds !== 'undefined') {
    runOfferedAbilityIds.add(item.id);
  }
}

function abilityAlreadyOffered(id) {
  return typeof runOfferedAbilityIds !== 'undefined' && runOfferedAbilityIds.has(id);
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
    ooze: { radius: 44, duration: 4.5, slow: 1.2, color: '#7fd68e' },
    fire: { radius: 34, duration: 6, damage: 1, color: '#ff7a2a' },
    water: { radius: 54, duration: 7, slow: 1.2, color: '#4aa8e0' },
    lightning: { radius: 44, duration: 1, damage: 1, damageCooldown: 0.7, color: '#f4ea7a' },
    miasma: { radius: 46, duration: 3.8, damage: 1, color: '#a5d64f' },
  };
  const spec = specs[kind];
  if (!spec) return;
  if (kind === 'ooze') {
    const oozes = groundHazards.filter((hazard) => hazard.kind === 'ooze');
    if (oozes.length >= 6) groundHazards.splice(groundHazards.indexOf(oozes[0]), 1);
  }
  groundHazards.push({ x, y, kind, owner, ...spec, ...overrides, ttl: overrides.duration ?? spec.duration, damageCooldown: overrides.damageCooldown ?? spec.damageCooldown ?? 0.35 });
}

function updateGroundHazards(dt) {
  for (let index = groundHazards.length - 1; index >= 0; index -= 1) {
    const hazard = groundHazards[index];
    // A boss death mid-loop clears groundHazards, leaving stale indices.
    if (!hazard) continue;
    hazard.ttl -= dt;
    hazard.damageCooldown -= dt;
    if ((hazard.kind === 'miasma' || hazard.kind === 'fire') && hazard.owner === 'player') {
      if (hazard.damageCooldown <= 0) {
        for (const enemy of [...enemies]) {
          if (hazard.damage > 0 && distanceBetween(enemy, hazard) <= enemy.radius + hazard.radius) {
            damageEnemy(enemy, hazard.damage, hazard.x, hazard.y, false, !hazard.suppressHitStop);
            if (hazard.kind === 'fire' && hazard.damage > 0) enemy.burnTimer = Math.max(enemy.burnTimer || 0, 1.2);
          }
        }
        hazard.damageCooldown = hazard.kind === 'fire' ? 0.5 : 0.85;
      }
    } else if (distanceBetween(player, hazard) < player.radius + hazard.radius) {
      if (hazard.slow) player.groundSlowTimer = Math.max(player.groundSlowTimer, 0.15);
      if (hazard.damage && hazard.damageCooldown <= 0) {
        damagePlayer(0.5, hazard);
        hazard.damageCooldown = 0.8;
      }
    }
    if (hazard.ttl <= 0 && groundHazards[index] === hazard) groundHazards.splice(index, 1);
  }
}

function igniteMiasmaAt(x, y, suppressHitStop = false) {
  for (let index = groundHazards.length - 1; index >= 0; index -= 1) {
    const cloud = groundHazards[index];
    if (!cloud || cloud.kind !== 'miasma' || cloud.owner !== 'player' ||
        distanceBetween(cloud, { x, y }) > cloud.radius + 24) continue;
    groundHazards.splice(index, 1);
    triggerCameraShake('bomb');
    addParticles(cloud.x, cloud.y, magicElementPalette.fire, 16, 115);
    for (const enemy of [...enemies]) {
      if (distanceBetween(enemy, cloud) <= cloud.radius + enemy.radius) {
        damageEnemy(enemy, 3, cloud.x, cloud.y, false, !suppressHitStop);
      }
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

function createShopStock() {
  const abilityCount = ownedAbilityCount();
  const available = shopItemCatalog.filter((item) => {
    if (item.kind === 'companion') return false;
    if (!isUpgradeAvailable(item)) return false;
    if (item.id.startsWith('heart-vessel-') && !heartVesselAllowed()) return false;
    if (reservedUpgradeIds.has(item.id) || ownedItems.has(item.id)) return false;
    if (item.kind === 'ability' && abilityAlreadyOffered(item.id)) return false;
    if (item.kind === 'ability' && item.id !== 'orbiting-projectiles' &&
        abilityCount + reservedAbilityCount() >= 2) return false;
    return item.kind !== 'skill' || !combatStyles.has(item.style);
  });
  const costFor = (item) => Math.max(MIN_ABILITY_COST,
    Math.min(15, item.cost + Math.max(0, currentFloor - 1) * 2));
  const bomb = { id: 'shop-bomb', name: 'Bomb', description: 'Gain one bomb immediately',
    cost: Math.min(15, 4 + Math.max(0, currentFloor - 1) * 2), kind: 'shop-bomb', purchased: false };
  const heart = { id: 'shop-heart', name: 'Heart', description: 'Restore one health point',
    cost: Math.min(15, 3 + Math.max(0, currentFloor - 1) * 2), kind: 'shop-heart', purchased: false };
  const abilities = available.filter((item) => item.kind === 'ability');
  const upgrades = available.filter((item) => item.kind !== 'ability' && item.kind !== 'consumable');
  const stock = [bomb, heart];
  if (abilities.length > 0) {
    const first = abilities.splice(Math.floor(Math.random() * abilities.length), 1)[0];
    markAbilityOffered(first);
    stock.push({ ...first, cost: costFor(first), purchased: false });
    if (abilities.length > 0 && Math.random() < 0.2) {
      const second = abilities.splice(Math.floor(Math.random() * abilities.length), 1)[0];
      markAbilityOffered(second);
      stock.push({ ...second, cost: costFor(second), purchased: false });
    }
  } else if (upgrades.length > 0) {
    const item = upgrades[Math.floor(Math.random() * upgrades.length)];
    stock.push({ ...item, cost: costFor(item), purchased: false });
  } else {
    stock[1] = { id: 'shop-heart-2', name: 'Heart', description: 'Restore one health point',
      cost: heart.cost, kind: 'shop-heart', purchased: false };
  }
  return stock;
}

function shopItemStillValid(item) {
  if (item.purchased || item.kind === 'consumable') return true;
  if (item.kind === 'companion') return companions.length < 2 && !ownedItems.has(item.id);
  if (ownedItems.has(item.id)) return false;
  if (item.kind === 'ability' && item.id !== 'orbiting-projectiles' && ownedAbilityCount() >= 2) return false;
  if (item.kind === 'skill' && combatStyles.has(item.style)) return false;
  return true;
}

function refreshShopStock(room) {
  if (!room.shopStock || room.shopStock.every(shopItemStillValid)) return;
  const fresh = createShopStock().filter((candidate) =>
    !room.shopStock.some((item) => item.id === candidate.id));
  room.shopStock = room.shopStock.map((item) => {
    if (shopItemStillValid(item)) return item;
    return fresh.shift() || { ...item, purchased: true, soldOut: true };
  });
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
    optionalBranch: false,
    bombCache: false,
    keyCache: false,
    guardChargeGranted: false,
    trialCompleted: false,
    trialGroupId: null,
    trialStep: 0,
    trialSteps: 1,
    trialBranch: 0,
    trialMirrors: null,
    trialMode: null,
    trialNodes: null,
    trialSequence: null,
    trialProgress: 0,
    trialTime: 0,
    trialRewardSpawned: false,
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
  if (!room.sizeKey) room.sizeKey = 'small';
  const size = ROOM_SIZES[room.sizeKey] || ROOM_SIZES.small;
  ROOM_W = size.w;
  ROOM_H = size.h;
}

function roomAreaBonus() {
  return Math.round((ROOM_W * ROOM_H / (960 * 540) - 1) * 1.1);
}

function createUpgradeReward(idSuffix, dungeonRooms) {
  const abilityCount = ownedAbilityCount() + reservedAbilityCount();
  const upgrades = shopItemCatalog.filter((item) =>
    ['passive', 'skill', 'weapon', 'mod', 'curio', 'clothing', 'ability', 'element'].includes(item.kind) &&
    (item.kind === 'skill' ? !combatStyles.has(item.style) : !ownedItems.has(item.id)) &&
    isUpgradeAvailable(item) &&
    (!item.id.startsWith('heart-vessel-') || heartVesselAllowed()) &&
    (item.kind !== 'ability' || item.id === 'orbiting-projectiles' || abilityCount < 2) &&
    (item.kind !== 'ability' || !abilityAlreadyOffered(item.id)) &&
    !reservedUpgradeIds.has(item.id) &&
    !dungeonRooms.some((room) => room.shopStock?.some((stockItem) => stockItem.id === item.id)),
  );
  const familiarUnlock = upgrades.find((item) => item.id === 'orbiting-projectiles');
  const reward = familiarUnlock
    ? { ...familiarUnlock }
    : upgrades.length > 0
      ? { ...upgrades[Math.floor(Math.random() * upgrades.length)] }
    : {
      id: `sanctum-blessing-${idSuffix}`,
      name: 'Sanctum Blessing',
      description: 'Gain a heart and stronger attacks',
      kind: 'passive',
    };
  markAbilityOffered(reward);
  reservedUpgradeIds.add(reward.id);
  return reward;
}

function generateDungeon() {
  let lastError = null;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      return generateDungeonAttempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function generateDungeonAttempt() {
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
  for (let step = 1; step <= 4; step += 1) {
    const options = randomize([
      { x: cursor.x + 1, y: cursor.y }, { x: cursor.x + 1, y: cursor.y },
      { x: cursor.x, y: cursor.y - 1 }, { x: cursor.x, y: cursor.y + 1 },
      { x: cursor.x - 1, y: cursor.y },
    ]).filter(({ x, y }) => x >= 0 && x <= 6 && y >= 0 && y <= 6 && !occupied.has(keyFor(x, y)));
    const choice = options[0];
    const next = choice && addConnectedRoom(cursor, choice.x, choice.y, step === 4 ? 'boss' : 'normal');
    if (!next) throw new Error('Could not create the main route through the dungeon.');
    mainPath.push(next);
    cursor = next;
  }

  const extraExit = attachRoom([startRoom], 'normal');
  if (!extraExit) {
    throw new Error('Could not create a second ordinary exit from the starting room.');
  }

  const secretHostCandidates = mainPath.filter((room) => room.type === 'normal');
  const secretHost = randomize(secretHostCandidates)
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
  secret.extraKeyChance = 0.35;
  secretHost.secretExit = { direction: secretDirection.name, room: secret };
  occupied.set(keyFor(secret.x, secret.y), secret);

  const specialPath = mainPath.filter((room) => room.type === 'normal');
  const shopRoom = attachRoom(specialPath, 'shop');
  const miniBossRoom = attachRoom(specialPath, 'miniboss');
  const lockTarget = attachRoom(specialPath, 'normal');
  if (!shopRoom || !miniBossRoom || !lockTarget) {
    throw new Error('Could not place all special rooms in the generated dungeon.');
  }
  shopRoom.shopStock = createShopStock();

  const extraRooms = [];
  const optionalRoomSources = () => [...occupied.values()].filter((room) =>
    room.type !== 'boss' && room.type !== 'secret' && !room.optionalBranch);
  for (let index = 0; index < 3; index += 1) {
    const room = attachRoom(optionalRoomSources(), 'normal');
    if (!room) throw new Error('Could not place all optional dead-end rooms.');
    room.optionalBranch = true;
    extraRooms.push(room);
  }
  const bombCacheRoomIndex = Math.floor(Math.random() * extraRooms.length);
  const bombCacheRoom = extraRooms[bombCacheRoomIndex];
  bombCacheRoom.bombCache = true;
  bombCacheRoom.rewardRoom = true;
  const shrineCandidates = extraRooms.filter((room) => room !== bombCacheRoom);
  const hasElementalShrine = Math.random() < 0.75;
  const gatedRoom = shrineCandidates.splice(
    Math.floor(Math.random() * shrineCandidates.length), 1,
  )[0];
  if (hasElementalShrine) {
    gatedRoom.type = 'elemental-shrine';
    gatedRoom.shrineElement = randomize(
      Object.keys(magicElementPalette).filter((element) => element !== activeMagicElement),
    )[0];
  } else {
    gatedRoom.type = 'shrine';
    gatedRoom.rewardUpgrade = createUpgradeReward(`floor-${currentFloor}-optional`, [...occupied.values()]);
  }
  const returnDirection = Object.keys(gatedRoom.links)[0];
  const returnVector = directions.find((direction) => direction.name === returnDirection);
  const gatedSource = returnVector ? [...occupied.values()].find((room) =>
    room !== gatedRoom && room.x === gatedRoom.x + returnVector.dx &&
    room.y === gatedRoom.y + returnVector.dy) : null;
  if (!returnDirection || !returnVector || !gatedSource) {
    throw new Error('Could not lock the optional shrine or ability room.');
  }
  gatedRoom.lockedDoors[returnDirection] = true;
  gatedSource.lockedDoors[oppositeDirection[returnDirection]] = true;
  const keyCacheRoom = shrineCandidates[0];
  if (keyCacheRoom) keyCacheRoom.keyCache = true;

  const lockedDirection = directions.find((direction) => lockTarget.links[direction.name]);
  const lockSource = lockedDirection
    ? [...occupied.values()].find((room) =>
      room !== lockTarget &&
      room.x === lockTarget.x + lockedDirection.dx &&
      room.y === lockTarget.y + lockedDirection.dy)
    : null;
  if (!lockSource) throw new Error('Could not connect the locked reward room.');
  lockTarget.type = 'trial';
  lockTarget.rewardRoom = Math.random() < 0.45;
  lockSource.lockedDoors[oppositeDirection[lockedDirection.name]] = true;
  lockTarget.lockedDoors[lockedDirection.name] = true;
  if (Math.random() < 0.35) {
    const secondTrialRoom = attachRoom([lockTarget], 'trial');
    if (secondTrialRoom) {
      const groupId = `floor-${currentFloor}-trial-${lockTarget.x}-${lockTarget.y}`;
      lockTarget.trialGroupId = groupId;
      lockTarget.trialStep = 1;
      lockTarget.trialSteps = 2;
      secondTrialRoom.trialGroupId = groupId;
      secondTrialRoom.trialStep = 2;
      secondTrialRoom.trialSteps = 2;
      secondTrialRoom.rewardRoom = true;
      lockTarget.rewardRoom = false;
      initializeRewardTrial(secondTrialRoom);
    }
  }
  keysHeld = Math.max(keysHeld, 1);
  miniBossRoom.rewardUpgrade = createUpgradeReward(`floor-${currentFloor}-map`, [...occupied.values()]);
  initializeRewardTrial(lockTarget);

  // Exactly one oversized room per map; never the boss, shop, secret, shrine, or start room.
  const largeCandidates = [...occupied.values()].filter((room) => ['normal', 'miniboss'].includes(room.type));
  const largeRoom = randomize(largeCandidates)[0];
  const largeKeys = ['large', 'wide', 'tall'];
  for (const room of occupied.values()) room.sizeKey = 'small';
  if (largeRoom) largeRoom.sizeKey = largeKeys[Math.floor(Math.random() * largeKeys.length)];

  return { rooms: [...occupied.values()], startRoom };
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

function collectConsumable(item) {
  const stack = consumables.find((entry) => entry.id === item.id);
  if (stack) stack.count += 1;
  else consumables.push({ id: item.id, name: item.name, count: 1 });
}

function dropBreakableConsumable(obstacle) {
  if (obstacle.bossSpawned || obstacle.guaranteedDrop || obstacle.purposeDrop) return false;
  if (Math.random() >= Math.min(0.2, 0.12 + player.luck * 0.02)) return false;
  const choices = shopItemCatalog.filter((item) => item.kind === 'consumable');
  const item = choices[Math.floor(Math.random() * choices.length)];
  pickups.push({ x: obstacle.x, y: obstacle.y, kind: 'consumable', item, room: obstacle.room });
  return true;
}

function placeRoomObstacles(room) {
  if (room.type !== 'normal' && room.type !== 'shrine') return;
  const roll = Math.random();
  const spots = [];
  const solid = obstacleSprites[0];
  if (roll < 0.3) {
    spots.push([0.3, 0.3, solid], [0.7, 0.3, solid], [0.3, 0.7, solid], [0.7, 0.7, solid]);
  } else if (roll < 0.5) {
    spots.push([0.3, 0.3, solid], [0.7, 0.7, solid]);
  }
  const cachePool = regionObstacleSprites()
    .filter((sprite) => sprite.type === 'bomb-only');
  if (cachePool.length && Math.random() < 0.35) {
    const cornerX = Math.random() < 0.5 ? 0.1 : 0.9;
    const cornerY = Math.random() < 0.5 ? 0.16 : 0.84;
    spots.push([cornerX, cornerY, cachePool[Math.floor(Math.random() * cachePool.length)], true]);
  }
  for (const [fx, fy, sprite, cache] of spots) {
    const position = { x: ROOM_W * fx, y: ROOM_H * fy };
    const clear = distanceBetween(position, player) > sprite.radius + player.radius + 60 &&
      enemies.every((enemy) => distanceBetween(position, enemy) > sprite.radius + enemy.radius + 20);
    if (!clear) continue;
    const obstacle = createBreakableAt(position.x, position.y, sprite);
    obstacle.room = room;
    if (cache) obstacle.purposeDrop = true;
    breakables.push(obstacle);
  }
}

function spawnRewardRelics(room, count = 3) {
  if (room.treasureClaimed || !room.rewardRoom) return;
  const availableObstacles = regionObstacleSprites();
  const rewardObstacles = availableObstacles.filter((sprite) =>
    sprite.type !== 'solid' && sprite.type !== 'bomb-only');
  const guaranteedSprite = rewardObstacles[0];
  if (!guaranteedSprite) return;
  const preferredPositions = [
    { x: ROOM_W / 2 - 180, y: ROOM_H / 2 - 130 },
    { x: ROOM_W / 2 + 180, y: ROOM_H / 2 - 130 },
    { x: ROOM_W / 2, y: ROOM_H / 2 },
  ];
  let guaranteedSpawned = false;
  for (let index = 0; index < count; index += 1) {
    const sprite = guaranteedSpawned
      ? rewardObstacles[index % rewardObstacles.length] : guaranteedSprite;
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
  const obstacleSound = obstacle.sprite?.sound;
  if (obstacle.hp > 0) {
    if (obstacleSound) playThrottledSound(obstacleSound.hit, 0.2, 80);
    return;
  }
  if (obstacleSound) playSound(obstacleSound.break, 0.3);

  if (!obstacle.dropConsumed) {
    obstacle.dropConsumed = true;
    const bombDrop = source === 'bomb' && Math.random() < 0.5;
    if (dropBreakableConsumable(obstacle)) {
      // Consumables share the loot roll so breaking scenery is useful without flooding supplies.
    } else if (obstacle.purposeDrop) {
      const hurt = player.hp < player.maxHp;
      const roll = Math.random();
      if (roll < 0.14 && spawnCurioDrop(obstacle.x, obstacle.y, obstacle.room)) {
        // curio spawned
      } else if (hurt && roll < 0.5) pickups.push({ x: obstacle.x, y: obstacle.y, kind: 'heart', room: obstacle.room });
      else if (roll < 0.8) spawnCoin(obstacle.x, obstacle.y);
      else pickups.push({ x: obstacle.x, y: obstacle.y, kind: 'bomb', room: obstacle.room });
    } else if (bombDrop || obstacle.guaranteedDrop) {
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
      if (roll < 0.05 + player.luck * 0.02 && spawnCurioDrop(obstacle.x, obstacle.y, obstacle.room)) {
        // curio spawned
      } else if (roll < 0.13) spawnCoin(obstacle.x, obstacle.y);
      else if (roll < 0.17) pickups.push({ x: obstacle.x, y: obstacle.y, kind: 'heart' });
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
  if (ownedItems.has(item.id) && !['consumable', 'ammo'].includes(item.kind)) {
    showMessage(`You already own ${item.name}.`, 2);
    return false;
  }
  if (item.id === 'guardian-heart') {
    const healthCap = (character ? startingHearts(character) : BASE_HEARTS) + MAX_EXTRA_HEARTS;
    const previousMaxHp = player.maxHp;
    player.maxHp = Math.min(healthCap, player.maxHp + 2);
    player.hp = Math.min(player.maxHp, player.hp + phaseRewardHealAmount());
    const gainedContainer = player.maxHp > previousMaxHp;
    ownedItems.add(item.id);
    markAbilityOffered(item);
    recordItemDiscovery(item);
    updateHud();
    showMessage(gainedContainer
      ? 'Guardian Heart: one heart container gained and up to two hearts restored.'
      : 'Guardian Heart: your capacity is full, so it restores up to two hearts.', 4);
    showPickupBanner(item.name, [gainedContainer ? '+1 HEART CONTAINER' : 'CAPACITY FULL', 'RESTORED UP TO 2 HEARTS']);
    popOverPlayer({ icon: 'heart', color: '#ff7b8e', image: shopItemIconImages[item.id] });
    return true;
  }
  if (!isUpgradeAvailable(item)) {
    showMessage('That upgrade is not available yet.', 2);
    return false;
  }
  if (item.kind === 'ability' && (ownedItems.has(item.id) ||
      (item.id !== 'orbiting-projectiles' && ownedAbilityCount() >= 2))) {
    showMessage('Your two ability slots are already filled.', 2);
    return false;
  }
  if (['ability', 'element', 'skill'].includes(item.kind)) {
    // Never slows an attack that is already faster than the 0.55 s floor.
    weapon.fireDelay = Math.max(Math.min(weapon.fireDelay, 0.55), weapon.fireDelay * 0.88);
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
    weapon.shotCount = Math.min(5, weapon.shotCount + 4);
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
  } else if (item.kind === 'mod') {
    // One modifier per weapon style: a new one replaces the old, which can be bought again later.
    for (const other of shopItemCatalog) {
      if (other.kind === 'mod' && other.style === item.style) ownedItems.delete(other.id);
    }
    player.meleeCharge = 0;
    player.bowHold = 0;
  } else if (item.kind === 'element') {
    combatStyles.add('magic');
    magicElements.add(item.element);
  } else if (item.id === 'frost-rune') {
    frostNovaCooldown = 0;
    frostActive = true;
  } else if (item.id === 'bonded-aegis') {
    player.aegisCharges = 3;
  }
  ownedItems.add(item.id);
  if (item.id === 'spore-bloom') unlockCharacter('mycelia-sporeling');
  const sideEffectMode = applyRandomFireMode(item);
  recordItemDiscovery(item);
  reservedUpgradeIds.delete(item.id);
  playSound('som:alteration/skillup.ogg', 0.35);
  updateHud();
  showMessage(
    item.kind === 'clothing'
      ? `${item.name} equipped. Speed ${player.speed}; armor ${player.armor}.`
      : item.quip || itemQuips[item.id]
        ? `${item.quip || itemQuips[item.id]} (${item.description || attackMorphs[item.id]?.label || ''})${
          item.kind === 'mod' && styleSynergy(item.style) ? ` CLASS SYNERGY: ${character.className} supercharges it!` : ''}`
        : attackMorphs[item.id]
        ? `${item.name} acquired. Your attacks change: ${attackMorphs[item.id].label}.`
        : `${item.name} acquired. Your mana answers to practice, not birthright.`,
    3,
  );
  const effectTags = [...itemEffectTagsFor(item)];
  if (sideEffectMode) effectTags.push(`${sideEffectMode.toUpperCase()} MODE`);
  showPickupBanner(item.name, effectTags);
  popOverPlayer({ icon: 'item', color: '#ffe38a', image: shopItemIconImages[item.id] });
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

function spawnRoom(room) {
  player.meleeSwings = [];
  player.swordParryTimer = 0;
  player.swordParryRadius = 0;
  player.swordParryFlash = 0;
  player.swordParryDamage = 0;
  player.swordParryRewarded = false;
  applyRoomSize(room);
  if (room.type === 'trial') initializeRewardTrial(room);
  if (room.type === 'start' && !room.entered) {
    player.x = ROOM_W / 2;
    player.y = ROOM_H / 2;
  }
  const wasCleared = room.cleared;
  const wasVisited = room.visited;
  enemies.length = 0;
  projectiles.length = 0;
  enemyProjectiles.length = 0;
  particles.length = 0;
  pickups.length = 0;
  bombs.length = 0;
  groundHazards.length = 0;
  bossStrikes.length = 0;
  lightningArcs.length = 0;
  sporePods.length = 0;
  laserBeams.length = 0;
  breakables.length = 0;
  playerStillTimer = 0;
  updateChaos(0, true);
  for (const companion of companions) {
    companion.hp = companion.maxHp;
    companion.respawnTimer = 0;
    companion.hitCooldown = 0;
    companion.x = player.x;
    companion.y = player.y;
    companion.enemyCooldowns = new Map();
  }
  room.visited = true;
  if (room.type === 'shop') refreshShopStock(room);
  const restoredRuntime = restoreRoomRuntime(room);
  // Older saves could hold several copies of the same reward; keep one.
  const seenUpgradeIds = new Set();
  for (let index = pickups.length - 1; index >= 0; index -= 1) {
    const upgradeId = pickups[index].kind === 'upgrade' ? pickups[index].item?.id : null;
    if (!upgradeId) continue;
    if (seenUpgradeIds.has(upgradeId)) pickups.splice(index, 1);
    else seenUpgradeIds.add(upgradeId);
  }
  addRoomRewardPickup(room);
  if (room.type === 'secret') {
    const relic = typeof manaLoreRelics === 'undefined'
      ? null : manaLoreRelics.find((entry) => entry.region === currentRegionId());
    const foundRelics = Array.isArray(save.loreRelics) ? save.loreRelics : [];
    const relicInRuntime = room.runtime?.pickups?.some((pickup) =>
      pickup.kind === 'lore-relic' && pickup.item?.id === relic?.id);
    if (relic && !foundRelics.includes(relic.id) &&
        !relicInRuntime && !hasLooseLoreRelic(relic.id)) {
      pickups.push({
        x: ROOM_W / 2 - 140,
        y: ROOM_H / 2 + 80,
        kind: 'lore-relic',
        item: relic,
      });
    }
  }
  if (room.bombCache && !wasVisited) {
    pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2 + 120, kind: 'bomb', room });
  }
  if (room.keyCache && !wasVisited) {
    pickups.push({ x: ROOM_W / 2 + 70, y: ROOM_H / 2 + 120, kind: 'key', room });
  }
  if (restoredRuntime) {
    if (room.type === 'trial' && room.trialCompleted && !room.trialRewardSpawned &&
        (!room.trialGroupId || room.trialStep >= room.trialSteps)) {
      grantRewardTrialLoot(room);
      saveRunState();
    }
    room.visited = true;
    room.entered = true;
    updateHud();
    return;
  }
  if (room.type === 'trial') {
    room.cleared = room.trialCompleted === true;
    initializeRewardTrial(room);
  } else if (room.type === 'shop' || room.type === 'bank' || room.type === 'start' ||
      room.type === 'elemental-shrine') {
    room.cleared = true;
    if (room.type !== 'start') {
      for (let index = breakables.length - 1; index >= 0; index -= 1) {
        if (!breakables[index].room || breakables[index].room === room) breakables.splice(index, 1);
      }
    }
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
      miniBoss.hp = Math.max(45 + currentFloor * 15, strongestPlayerSingleHit() * 6);
      miniBoss.maxHp = miniBoss.hp;
      miniBoss.radius = Math.max(miniBoss.radius * 1.4, 28);
      miniBoss.speed = Math.max(miniBoss.speed * 1.5, 90 + currentFloor * 8);
      miniBoss.title = {
        croc: 'MARSH KRAB', scorpion: 'DUNE STALKER', bandit: 'ROAD CAPTAIN',
        bosspinkie: 'PINKIE MATRIARCH',
        mouboo: 'MOU-BOO ELDER', spider: 'RUIN STALKER', 'spider-queen': 'SPIDER QUEEN',
        bluepar: 'GREAT BLUEPAR',
        skeleton: 'BONE GUARD', zombie: 'RESTLESS VETERAN', 'spore-sower': 'SPORE SOWER',
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
      const count = Math.max(2, (room.type === 'shrine' ? 2 + currentFloor : currentFloor + Math.floor(Math.random() * 2)) + roomAreaBonus());
      let linkedPairSpawned = false;
      for (let i = 0; i < count; i += 1) {
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const spawn = findEnemySpawnPosition(180 + Math.random() * (ROOM_W - 360), 120 + Math.random() * (ROOM_H - 240));
        if (!spawn) continue;
        const enemy = applyBossAIPromotion(applyEliteMutation(createEnemy(kind, spawn.x, spawn.y)));
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
    placeRoomObstacles(room);
    if (enemies.length === 0) {
      room.cleared = true;
      grantOrbitGuardChargeUp(room);
    }
  }
  if (room.type !== 'trial' && room.rewardRoom && !room.treasureClaimed) {
    spawnRewardRelics(room, room.type === 'secret' ? 3 : 2);
  }
  room.entered = true;

  if (room.type === 'start') {
    const regionStories = {
      tulimshar: 'Tulimshar, where every descent begins. Beyond its walls lie the old mines that gave up the Mana Seed.',
      candor: 'Candor Island is where many new adventurers learn the roads. This side-story follows a rumor from the coast; it leaves the island’s established stories intact.',
      hurnscald: 'Hurnscald’s woodland roads. Mayor Rakinorf hears from every traveler bound for the World Edge. Mana’s flow runs deep beneath the forest.',
      graveyard: 'The old graveyard. The stones stay quiet until Mana’s flow passes under them, and then the Kaore-tainted dead begin to stir.',
      artis: 'The Artis Ruins. Elanore tells of the last living Mana Tree, saddened by war. The seed may be seeking that distant kin.',
      halinarzo: 'Halinarzo’s library holds clues to old pathways. Markings record the flow of Mana through the town’s roads.',
      nivalis: 'Snowbound Nivalis. The Blue Sage is said to know the northern trails, and Mana’s flow runs clear through the ice.',
      frostia: 'Frostia, ruled by King Gelid. Its ice caves magnify Mana’s pulse and draw the tainted down the trail.',
      fortress: 'Candor Island, where ships put in and new adventurers learn the roads. Mana’s flow runs down into the caves below, and the seed pulls after it.',
      worldedge: 'The World Edge, where Hurnscald’s maps give out. Mana’s flow runs clearer here than anywhere else.',
    };
    storyText = regionStories[currentRegionId()];
    if (currentRegionId() === 'hurnscald' && unlockCharacter('hurnscald-herbalist')) {
      showMessage('Reached Hurnscald: Hurnscald Herbalist is now selectable.', 4);
    }
    if (currentRegionId() === 'artis' && unlockCharacter('artis-archivist')) {
      showMessage('Reached the Artis Ruins: Artis Archivist is now selectable.', 4);
    }
  } else if (room.type === 'boss') {
    storyText = `${currentFloorTheme().name}: a guardian steeped in Kaore bars the way down.`;
  } else if (room.type === 'miniboss') {
    storyText = 'A powerful sentinel holds this side chamber.';
  } else if (room.type === 'secret') {
    storyText = 'A concealed chamber holds an echo of the old mana current. Its other contents are uncertain.';
    unlockCharacter('world-edge-pilgrim');
  } else if (room.type === 'trial') {
    storyText = 'An old leyline lens puzzle blocks the reward. Turn each facet and follow the light to the receiver.';
  } else if (room.type === 'shop') {
    storyText = 'A traveling merchant has laid out wares for anyone bold enough to come this far.';
  } else if (room.type === 'bank') {
    storyText = 'A quiet vault keeps your stored zenny safe between descents.';
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

function tryUnlock(room, direction) {
  if (!room.lockedDoors[direction]) return true;
  if (keysHeld <= 0) {
    showMessage('This door is locked. Find a key.', 2);
    return false;
  }
  keysHeld -= 1;
  playSound('som:entities/chest/open.ogg', 0.35);
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
  player.knockback = null;
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
      suppressHeldAttackInput();
      captureRoomRuntime(currentRoom);
      currentRoom = secret;
      placeAtEntry();
      spawnRoom(currentRoom);
      saveRunState();
    }
    return;
  }
  if (currentRoom.type === 'secret' && currentRoom.returnDirection === direction) {
    suppressHeldAttackInput();
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
  suppressHeldAttackInput();
  captureRoomRuntime(currentRoom);
  currentRoom = room;
  placeAtEntry();
  spawnRoom(currentRoom);
  saveRunState();
}

function resetFloorCoins() {
  floorCoinsSpawned = 0;
  floorCoinCeiling = SOFT_FLOOR_COINS;
  floorOverflowRolled = false;
}

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
  const count = currentRoom?.shopStock?.length || 3;
  return { x: ROOM_W / 2 + (index - (count - 1) / 2) * 220, y: 372 };
}

function bankPadPosition(withdraw) {
  return { x: ROOM_W / 2 + (withdraw ? 200 : -200), y: 160 };
}

function hasVault(room) {
  return room.type === 'shop' || room.type === 'bank';
}

function nearestShopSlot() {
  if (currentRoom.type !== 'shop' || !currentRoom.shopStock) return -1;
  let best = -1;
  let bestDistance = player.radius + 70;
  currentRoom.shopStock.forEach((item, slot) => {
    const dist = distanceBetween(player, shopPedestalPosition(slot));
    if (!item.purchased && dist < bestDistance) {
      best = slot;
      bestDistance = dist;
    }
  });
  return best;
}

function canInteract() {
  if (mode !== 'playing' || !currentRoom) return false;
  if (currentRoom.type === 'trial' && !currentRoom.trialCompleted &&
      (nearestRewardTrialMirror() || nearestRewardTrialNode())) return true;
  if (currentRoom.type === 'elemental-shrine' && !currentRoom.shrineUsed &&
      distanceBetween(player, elementalShrinePosition()) < 92) return true;
  if (nearestManaRelic()) return true;
  if (currentRoom.type === 'elemental-shrine' && !currentRoom.shrineUsed &&
      distanceBetween(player, elementalShrinePosition()) < 92) return true;
  if (currentRoom.type === 'start' && distanceBetween(player, soulMenhirPosition()) < 86) return true;
  if (nearestShopSlot() >= 0) return true;
  if (hasVault(currentRoom) && distanceBetween(player, { x: ROOM_W / 2, y: ROOM_H / 2 }) < 240 &&
      (distanceBetween(player, bankPadPosition(false)) < 160 ||
        distanceBetween(player, bankPadPosition(true)) < 160)) return true;
  if (currentRoom.type === 'boss' && currentRoom.cleared &&
      distanceBetween(player, { x: ROOM_W * 0.72, y: ROOM_H / 2 }) < 76) return true;
  if (currentRoom.type === 'shop' && distanceBetween(player, { x: ROOM_W / 2, y: ROOM_H / 2 }) < 150) return true;
  return currentRoom.cleared && directions.some((direction) =>
    isPlayerNearDoor(direction.name) && (currentRoom.links[direction.name] ||
      (currentRoom.secretExit?.direction === direction.name && !currentRoom.secretExit.room.hidden)));
}

function nearestManaRelic() {
  let nearest = null;
  let nearestDistance = player.radius + 48;
  for (const pickup of pickups) {
    if (pickup.kind !== 'lore-relic') continue;
    const distance = distanceBetween(player, pickup);
    if (distance < nearestDistance) {
      nearest = pickup;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function updateWalkInInteractions(dt) {
  walkInCooldown = Math.max(0, walkInCooldown - dt);
  if (currentRoom.type === 'boss' && currentRoom.cleared &&
      distanceBetween(player, { x: ROOM_W * 0.72, y: ROOM_H / 2 }) > 70) {
    currentRoom.descendArmed = true;
  }
  if (walkInCooldown > 0) return;
  if (hasVault(currentRoom)) {
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
  if (currentRoom.type === 'trial' && !currentRoom.trialCompleted) {
    if (currentRoom.trialMode === 'mirror') {
      if (rewardTrialMirrorsSolved()) return;
      const mirror = nearestRewardTrialMirror();
      if (!mirror) {
        showMessage('Approach a lens and interact to rotate it.', 1.5);
        return;
      }
      currentRoom.trialMirrors[mirror.index] = mirror.orientation === '/' ? '\\' : '/';
      showMessage(rewardTrialMirrorsSolved()
        ? 'The receiver lights.'
        : 'Facet turned. Follow the reflected light to the receiver.', 1.4);
      updateHud();
      saveRunState();
      return;
    }
    if (currentRoom.trialMode === 'memory') {
      const node = nearestRewardTrialNode();
      if (!node) {
        showMessage('Approach the next rune and interact.', 1.5);
        return;
      }
      if (node.index !== currentRoom.trialSequence[currentRoom.trialProgress]) {
        currentRoom.trialProgress = 0;
        showMessage('The sequence breaks. Watch the runes and try again.', 2);
      } else {
        currentRoom.trialProgress += 1;
        addParticles(node.x, node.y, '#9de5d8', 8, 60);
        if (currentRoom.trialProgress >= currentRoom.trialSequence.length) {
          completeRewardTrial(node);
        } else showMessage(`Rune sequence ${currentRoom.trialProgress}/${currentRoom.trialSequence.length}.`, 1.2);
      }
      updateHud();
      saveRunState();
      return;
    }
    showMessage('Follow the moving sparks in order by walking through them.', 2);
    return;
  }
  if (currentRoom.type === 'elemental-shrine' && !currentRoom.shrineUsed &&
      distanceBetween(player, elementalShrinePosition()) < 92) {
    const palette = Object.keys(magicElementPalette);
    if (currentRoom.shrineElement === activeMagicElement) {
      const currentIndex = palette.indexOf(activeMagicElement);
      currentRoom.shrineElement = palette[(currentIndex + 1) % palette.length];
    }
    activeMagicElement = currentRoom.shrineElement;
    magicElements.add(activeMagicElement);
    currentRoom.shrineUsed = true;
    frostActive = false;
    const color = magicElementPalette[activeMagicElement];
    addParticles(ROOM_W / 2, ROOM_H / 2 - 52, color, 28, 100);
    showPickupBanner(`${activeMagicElement.toUpperCase()} ATTUNEMENT`, ['ELEMENT CHANGED']);
    showMessage(`The elemental menhir attunes you to ${activeMagicElement}.`, 3);
    updateHud();
    saveRunState();
    return;
  }
  const relicPickup = nearestManaRelic();
  if (relicPickup) {
    const relicIndex = pickups.indexOf(relicPickup);
    if (relicIndex >= 0) pickups.splice(relicIndex, 1);
    recordLoreRelic(relicPickup.item.id);
    addParticles(relicPickup.x, relicPickup.y, '#b8f1d8', 22, 105);
    saveRunState();
    return;
  }
  if (currentRoom.type === 'start' && distanceBetween(player, soulMenhirPosition()) < 86) {
    const pun = menhirPuns[menhirPunIndex % menhirPuns.length];
    menhirPunIndex = (menhirPunIndex + 1 + Math.floor(Math.random() * 3)) % menhirPuns.length;
    showMessage(`Soul Menhir: "${pun}"`, 4);
    const position = soulMenhirPosition();
    addParticles(position.x, position.y - 40, '#b9a6ff', 16, 90);
    return;
  }
  if (currentRoom.type === 'boss' && currentRoom.cleared) {
    if (distanceBetween(player, { x: ROOM_W * 0.72, y: ROOM_H / 2 }) > 76) {
      showMessage('The seal is open. Approach the descent at the back of the chamber.', 2.5);
      return;
    }
    if (currentFloor === finalFloor) {
      mode = 'won';
      endScreenDelay = 0.6;
      save.completedRuns += 1;
      unlockCharacter('vault-delver');
      persistSave();
      clearSavedRun();
      showMessage('With the last guardian gone, the Kaore drains from the land. The Mana Seed takes root in clean soil, and its roots reach out to join Mana’s flow.', 10);
      return;
    }
    currentFloor += 1;
    playSound('system/warp.ogg', 0.3);
    blanksHeld += 1;
    if (currentRegionId() === 'hurnscald' && unlockCharacter('hurnscald-herbalist')) {
      showMessage('Unlocked: Hurnscald Herbalist.', 3);
    }
    if (currentRegionId() === 'artis' && unlockCharacter('artis-archivist')) {
      showMessage('Unlocked: Artis Archivist.', 3);
    }
    resetFloorCoins();
    // Unclaimed rewards on the floor being left must not keep blocking offers on the next one.
    reservedUpgradeIds.clear();
    const generated = generateDungeon();
    rooms = generated.rooms;
    currentRoom = generated.startRoom;
    player.x = ROOM_W / 2;
    player.y = ROOM_H / 2;
    spawnRoom(currentRoom);
    saveRunState();
    discoverRegion();
    showMessage(`Chapter ${currentFloor}: the seed pulls you deeper into the sanctum, following Mana’s flow.`, 5);
    return;
  }
  const shopSlot = withdrawFromBank ? -1 : nearestShopSlot();
  if (shopSlot >= 0) {
    buyShopItem(shopSlot);
    return;
  }
  if (hasVault(currentRoom) && distanceBetween(player, { x: ROOM_W / 2, y: ROOM_H / 2 }) < 240 &&
      (withdrawFromBank || distanceBetween(player, bankPadPosition(false)) < 160 ||
        distanceBetween(player, bankPadPosition(true)) < 160)) {
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
    showMessage('Stand next to an item and press E to buy it.', 2);
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
  if (item.kind === 'ability' && (ownedItems.has(item.id) ||
      (item.id !== 'orbiting-projectiles' && ownedAbilityCount() >= 2))) {
    showMessage('Your two ability slots are already filled.', 2);
    return;
  }
  if (item.kind === 'shop-heart' && player.hp >= player.maxHp) {
    showMessage('Your health is already full.', 2);
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
  const grantsUpgrade = ['passive', 'skill', 'weapon', 'mod', 'curio', 'clothing', 'ability', 'element'].includes(item.kind);
  // Upgrades already play their own cue in grantUpgrade.
  if (!grantsUpgrade) playSound('system/item.ogg', 0.3);
  if (grantsUpgrade) {
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
    collectConsumable(item);
  } else if (item.kind === 'shop-bomb') {
    bombsHeld += 1;
    popOverPlayer({ icon: 'bomb', color: '#f2c774' });
  } else if (item.kind === 'shop-heart') {
    player.hp = Math.min(player.maxHp, player.hp + 1);
    popOverPlayer({ icon: 'heart', color: '#ff7b8e' });
  }
  if (powerHatByItem[item.id]) player.powerHat = { item: item.id, hat: powerHatByItem[item.id] };
  updateHud();
  if (!['passive', 'skill', 'weapon', 'mod', 'curio', 'clothing', 'ability', 'element'].includes(item.kind)) {
    showMessage(`${item.name} acquired: ${item.description}.${item.kind === 'consumable' ? ' Press Q to use it.' : ''}`, 3);
  }
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

function soulMenhirPosition() {
  return { x: ROOM_W / 2, y: ROOM_H / 2 - 104 };
}

function elementalShrinePosition() {
  return { x: ROOM_W / 2, y: ROOM_H / 2 };
}

function rewardTrialSolution(branch) {
  return [
    branch > 0 ? '\\' : '/',
    branch > 0 ? '\\' : '/',
    branch > 0 ? '/' : '\\',
  ];
}

function initializeRewardTrial(room) {
  if (room.trialBranch !== -1 && room.trialBranch !== 1) {
    room.trialBranch = Math.random() < 0.5 ? -1 : 1;
  }
  if (!['mirror', 'memory', 'relay'].includes(room.trialMode)) {
    room.trialMode = Array.isArray(room.trialMirrors) && room.trialMirrors.length === 3
      ? 'mirror' : ['mirror', 'memory', 'relay'][Math.floor(Math.random() * 3)];
  }
  if (!Array.isArray(room.trialMirrors) || room.trialMirrors.length !== 3 ||
      room.trialMirrors.some((orientation) => orientation !== '/' && orientation !== '\\')) {
    const solution = rewardTrialSolution(room.trialBranch);
    room.trialMirrors = solution.map(() => Math.random() < 0.5 ? '/' : '\\');
    // Start at least two lenses from solved so one turn can never finish the trial.
    for (;;) {
      const correct = room.trialMirrors
        .map((orientation, index) => orientation === solution[index] ? index : -1)
        .filter((index) => index >= 0);
      if (correct.length <= solution.length - 2) break;
      const index = correct[Math.floor(Math.random() * correct.length)];
      room.trialMirrors[index] = room.trialMirrors[index] === '/' ? '\\' : '/';
    }
  }
  const nodeCount = room.trialMode === 'memory' ? 5 : room.trialMode === 'relay' ? 3 : 0;
  if (nodeCount && (!Array.isArray(room.trialNodes) || room.trialNodes.length !== nodeCount)) {
    if (room.trialMode === 'memory') {
      const rotation = Math.random() * Math.PI * 2;
      room.trialNodes = Array.from({ length: 5 }, (_, index) => {
        const angle = rotation + index * Math.PI * 2 / 5;
        return { x: 0.5 + Math.cos(angle) * 0.21, y: 0.5 + Math.sin(angle) * 0.21 };
      });
    } else {
      room.trialNodes = Array.from({ length: 3 }, () => ({
        phase: Math.random() * Math.PI * 2,
        speed: 0.75 + Math.random() * 0.5,
      }));
    }
  }
  if (room.trialMode === 'memory' &&
      (!Array.isArray(room.trialSequence) || room.trialSequence.length !== 4 ||
        room.trialSequence.some((index) => !Number.isInteger(index) || index < 0 || index >= 5))) {
    room.trialSequence = [Math.floor(Math.random() * 5)];
    while (room.trialSequence.length < 4) {
      const previous = room.trialSequence[room.trialSequence.length - 1];
      room.trialSequence.push((previous + 1 + Math.floor(Math.random() * 4)) % 5);
    }
  }
  if (!Number.isInteger(room.trialProgress) || room.trialProgress < 0) room.trialProgress = 0;
  if (!Number.isFinite(room.trialTime) || room.trialTime < 0) room.trialTime = 0;
}

function rewardTrialMirrors(room = currentRoom) {
  if (!room) return [];
  initializeRewardTrial(room);
  const branch = room.trialBranch === 1 ? 1 : -1;
  const y = ROOM_H / 2 + branch * ROOM_H * 0.23;
  const solution = rewardTrialSolution(branch);
  return [
    { x: ROOM_W * 0.28, y: ROOM_H / 2 },
    { x: ROOM_W * 0.28, y },
    { x: ROOM_W * 0.68, y },
  ].map((position, index) => ({
    ...position,
    index,
    orientation: room.trialMirrors[index],
    solution: solution[index],
  }));
}

function rewardTrialSource() {
  return { x: ROOM_W * 0.12, y: ROOM_H / 2 };
}

function rewardTrialReceiver() {
  return { x: ROOM_W * 0.68, y: ROOM_H / 2 };
}

function rewardTrialMirrorsSolved() {
  return rewardTrialMirrors().every((facet) => facet.orientation === facet.solution);
}

function nearestRewardTrialMirror() {
  if (currentRoom?.type !== 'trial' || currentRoom.trialCompleted) return null;
  let nearest = null;
  let nearestDistance = 70;
  for (const mirror of rewardTrialMirrors()) {
    const distance = distanceBetween(player, mirror);
    if (distance < nearestDistance) {
      nearest = mirror;
      nearestDistance = distance;
    }
  }
  if (!nearest) return null;
  return { ...nearest, room: currentRoom };
}

function rewardTrialNodes(room = currentRoom) {
  if (!room) return [];
  initializeRewardTrial(room);
  if (room.trialMode === 'memory') {
    return room.trialNodes.map((position, index) => ({
      x: position.x * ROOM_W,
      y: position.y * ROOM_H,
      index,
    }));
  }
  if (room.trialMode === 'relay') {
    return room.trialNodes.map((node, index) => ({
      x: ROOM_W * (0.5 + Math.cos(room.trialTime * node.speed + node.phase) * 0.18),
      y: ROOM_H * (0.5 + Math.sin(room.trialTime * node.speed + node.phase) * 0.14),
      index,
    }));
  }
  return [];
}

function nearestRewardTrialNode() {
  if (currentRoom?.type !== 'trial' || currentRoom.trialMode !== 'memory' ||
      currentRoom.trialCompleted) return null;
  const expectedIndex = currentRoom.trialSequence[currentRoom.trialProgress];
  const node = rewardTrialNodes().find((candidate) => candidate.index === expectedIndex);
  if (!node || distanceBetween(player, node) >= 70) return null;
  return node;
}

const REWARD_TRIAL_SOLVE_HOLD = 1;

function updateRewardTrial(dt) {
  if (currentRoom?.type === 'trial' && currentRoom.trialMode === 'mirror' &&
      !currentRoom.trialCompleted) {
    // Hold the lit beam briefly so the player sees the solution land before the room clears.
    if (!rewardTrialMirrorsSolved()) currentRoom.trialSolveHold = 0;
    else {
      currentRoom.trialSolveHold = (currentRoom.trialSolveHold || 0) + dt;
      if (currentRoom.trialSolveHold >= REWARD_TRIAL_SOLVE_HOLD) {
        completeRewardTrial(rewardTrialReceiver());
        if (!currentRoom.trialCompleted) {
          // Earlier chamber unfinished: knock a lens out of line so the player can retry later.
          currentRoom.trialMirrors[0] = currentRoom.trialMirrors[0] === '/' ? '\\' : '/';
          currentRoom.trialSolveHold = 0;
        }
      }
    }
    return;
  }
  if (currentRoom?.type !== 'trial' || currentRoom.trialMode !== 'relay' ||
      currentRoom.trialCompleted) return;
  currentRoom.trialTime += dt;
  const target = rewardTrialNodes()[currentRoom.trialProgress];
  if (!target || distanceBetween(player, target) >= player.radius + 22) return;
  currentRoom.trialProgress += 1;
  addParticles(target.x, target.y, '#f0d98a', 10, 70);
  if (currentRoom.trialProgress >= 3) completeRewardTrial(target);
  else {
    showMessage(`Spark caught ${currentRoom.trialProgress}/3. Chase the next one!`, 1.2);
    saveRunState();
  }
}

function completeRewardTrial(position) {
  const room = currentRoom;
  if (room.trialGroupId && room.trialStep > 1) {
    const previousStep = rooms.find((candidate) =>
      candidate.trialGroupId === room.trialGroupId && candidate.trialStep === room.trialStep - 1);
    if (!previousStep?.trialCompleted) {
      room.trialProgress = 0;
      showMessage('Complete the earlier chamber before claiming this trial.', 2.5);
      saveRunState();
      return;
    }
  }
  room.trialCompleted = true;
  room.cleared = true;
  grantOrbitGuardChargeUp(room);
  if (room.trialGroupId && room.trialStep < room.trialSteps) {
    const nextTrial = rooms.find((candidate) =>
      candidate.trialGroupId === room.trialGroupId && candidate.trialStep === room.trialStep + 1);
    if (!nextTrial) throw new Error(`Missing next chamber for trial ${room.trialGroupId}.`);
    showMessage('First chamber cleared. Continue deeper for the trial reward!', 3);
  } else {
    grantRewardTrialLoot(room);
  }
  addParticles(position.x, position.y, '#f4d58c', 24, 110);
  if (!room.trialGroupId || room.trialStep >= room.trialSteps) {
    showMessage('Trial complete! Your reward is waiting in the chamber.', 3);
  }
  updateHud();
  saveRunState();
}

function removeLooseLoreRelic(id) {
  for (const room of rooms) {
    const roomPickups = room === currentRoom ? pickups : room.runtime?.pickups;
    if (!Array.isArray(roomPickups)) continue;
    for (let index = roomPickups.length - 1; index >= 0; index -= 1) {
      if (roomPickups[index].kind === 'lore-relic' && roomPickups[index].item?.id === id) {
        roomPickups.splice(index, 1);
      }
    }
  }
}

function hasLooseLoreRelic(id) {
  if (pickups.some((pickup) => pickup.kind === 'lore-relic' && pickup.item?.id === id)) return true;
  return rooms.some((room) => room !== currentRoom &&
    room.runtime?.pickups?.some((pickup) => pickup.kind === 'lore-relic' && pickup.item?.id === id));
}

function grantRewardTrialLoot(room) {
  if (room.trialRewardSpawned) return;
  room.trialRewardSpawned = true;
  const relic = typeof manaLoreRelics === 'undefined'
    ? null : manaLoreRelics.find((entry) => entry.region === currentRegionId());
  const foundRelics = Array.isArray(save.loreRelics) ? save.loreRelics : [];
  if (relic && !foundRelics.includes(relic.id) && Math.random() < 0.9) {
    removeLooseLoreRelic(relic.id);
    pickups.push({ x: ROOM_W / 2 + 54, y: ROOM_H / 2 + 52, kind: 'lore-relic', item: relic, room });
  }

  const abilityCount = ownedAbilityCount() + reservedAbilityCount();
  const abilities = shopItemCatalog.filter((item) => item.kind === 'ability' &&
    !ownedItems.has(item.id) && !reservedUpgradeIds.has(item.id) &&
    !abilityAlreadyOffered(item.id) &&
    (item.id === 'orbiting-projectiles' || abilityCount < 2) &&
    isUpgradeAvailable(item));
  const rewards = ['bomb', 'zenny'];
  if (player.hp < player.maxHp) rewards.push('heart');
  if (abilities.length > 0) rewards.push('ability');
  const reward = rewards[Math.floor(Math.random() * rewards.length)];
  const x = ROOM_W / 2 - 54;
  const y = ROOM_H / 2 + 52;
  if (reward === 'ability') {
    const item = abilities[Math.floor(Math.random() * abilities.length)];
    markAbilityOffered(item);
    reservedUpgradeIds.add(item.id);
    pickups.push({ x, y, kind: 'upgrade', item, room, trialReward: true });
  } else if (reward === 'heart' || reward === 'bomb') {
    pickups.push({ x, y, kind: reward, room, trialReward: true });
  } else {
    for (let index = 0; index < 3; index += 1) {
      pickups.push({ x: x + (index - 1) * 22, y, kind: 'coin', room, trialReward: true });
    }
  }
}

function grantOrbitGuardChargeUp(room) {
  if (!room || room.guardChargeGranted) return false;
  room.guardChargeGranted = true;
  const previousCharge = orbitGuardChargeUps;
  orbitGuardChargeUps = Math.min(ORBIT_GUARD_CHARGE_CAP, orbitGuardChargeUps + 1);
  if (previousCharge < ORBIT_GUARD_CHARGE_REQUIREMENT &&
      orbitGuardChargeUps >= ORBIT_GUARD_CHARGE_REQUIREMENT) {
    showMessage('Mana Familiar fully charged. Press the defense action to summon three spirits.', 2.5);
  }
  updateHud();
  saveRunState();
  return true;
}

function useOrbitGuard() {
  if (mode !== 'playing' || !currentRoom) return;
  if (!ownedItems.has('orbiting-projectiles')) {
    useShockwave();
    return;
  }
  if (orbitGuardChargeUps < ORBIT_GUARD_CHARGE_REQUIREMENT) {
    showMessage(`Mana Guard needs ${ORBIT_GUARD_CHARGE_REQUIREMENT - orbitGuardChargeUps} more room clear charge-up${ORBIT_GUARD_CHARGE_REQUIREMENT - orbitGuardChargeUps === 1 ? '' : 's'}.`, 2);
    return;
  }
  if (orbitGuards.length >= ORBIT_GUARD_MAX) {
    showMessage('Your orbit is full. Use a familiar before summoning more.', 2);
    return;
  }
  const { kind, color } = orbitGuardStyle();
  const summonCount = Math.min(ORBIT_GUARD_SUMMON_COUNT, ORBIT_GUARD_MAX - orbitGuards.length);
  orbitGuardChargeUps -= ORBIT_GUARD_CHARGE_REQUIREMENT;
  for (let index = 0; index < summonCount; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / summonCount;
    orbitGuards.push({
      id: nextOrbitGuardId++,
      kind,
      angle,
      x: player.x + Math.cos(angle) * 32,
      y: player.y - 20 + Math.sin(angle) * 32,
      radius: 11,
      color,
    });
  }
  addParticles(player.x, player.y - 20, color, 16, 85);
  showMessage(`${summonCount} ${kind === 'mana' ? 'mana' : kind} guard${summonCount === 1 ? '' : 's'} orbit you. Each blocks one shot or strikes one enemy.`, 2.5);
  updateHud();
  saveRunState();
}

function roomLeftoverKinds(room) {
  const list = room === currentRoom ? pickups : room.runtime?.pickups || [];
  return new Set(list.map((pickup) => pickup.kind));
}

function roomIsRevealed(room) {
  if (room.visited || room === currentRoom) return true;
  if (room.hidden || room.type === 'secret') return false;
  return rooms.some((visitedRoom) =>
    visitedRoom.visited && Object.keys(visitedRoom.links).some((direction) => {
      const vector = directions.find((item) => item.name === direction);
      return visitedRoom.x + vector.dx === room.x && visitedRoom.y + vector.dy === room.y;
    }),
  );
}
