/* Local storage, profiles, progression, and save/load persistence. */

const MANA_LORE_RELIC_COUNT = 9;
// Saves from before Fortress Island became Candor Island still hold the old ids.
const legacySaveIds = {
  fortress: 'candor', 'fortress-keeper': 'candor-keeper', 'mana-echo-fortress': 'mana-echo-candor',
  'region:fortress': 'region:candor', 'character:fortress-keeper': 'character:candor-keeper',
};

function currentSaveId(id) {
  return legacySaveIds[id] || id;
}

function getSave() {
  let storedSave;
  try {
    storedSave = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
  } catch (error) {
    messageEl.textContent = 'Progress could not be read from browser storage; unlocks last for this visit.';
    return {
      arcanist: false, warden: false, highestFloorCleared: 0, unlockedCharacters: [], completedRuns: 0, bankedZeny: 0,
      playtimeSeconds: 0, unlockedItemIds: [], discoveredItemIds: [], discoveredEnemyIds: [], discoveredEnemyAbilityIds: [],
      purchasedAbilityIds: [], introducedChapters: [], loreRelics: [],
    };
  }
  if (!storedSave || typeof storedSave !== 'object' || Array.isArray(storedSave)) storedSave = {};

  let storedBank;
  try {
    storedBank = localStorage.getItem(BANK_STORAGE_KEY);
  } catch (error) {
    messageEl.textContent = 'Bank storage could not be read; your saved profile balance is shown for this visit.';
  }
  // Profiles saved before the Zeny rename store the balance as bankedZenny.
  const storedBalance = storedSave.bankedZeny ?? storedSave.bankedZenny;
  const profileBalance = Number.isFinite(storedBalance)
    ? Math.max(0, Math.floor(storedBalance)) : 0;
  const bankedZeny = storedBank === null || storedBank === undefined
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
    highestFloorCleared: Number.isFinite(storedSave.highestFloorCleared)
      ? Math.max(0, Math.floor(storedSave.highestFloorCleared)) : 0,
    unlockedCharacters: Array.isArray(storedSave.unlockedCharacters)
      ? storedSave.unlockedCharacters.filter((id) => typeof id === 'string').map(currentSaveId) : [],
    completedRuns: Number.isFinite(storedSave.completedRuns) ? Math.max(0, Math.floor(storedSave.completedRuns)) : 0,
    bankedZeny,
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
      ? storedSave.introducedChapters.filter((id) => typeof id === 'string').map(currentSaveId) : [],
    loreRelics: Array.isArray(storedSave.loreRelics)
      ? storedSave.loreRelics.filter((id) => typeof id === 'string').map(currentSaveId) : [],
  };
}

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

function recordLoreRelic(id) {
  const relics = typeof manaLoreRelics === 'undefined' ? [] : manaLoreRelics;
  if (!relics.some((relic) => relic.id === id) || save.loreRelics.includes(id)) return false;
  save.loreRelics.push(id);
  persistSave();
  const found = save.loreRelics.length;
  if (found === MANA_LORE_RELIC_COUNT) {
    showMessage('All nine echoes are joined. The Echo-Bound Delver is now available.', 5);
    queueChapter('character:echo-bound-delver', {
      heading: 'ECHO-BOUND DELVER',
      title: 'A shared memory',
      text: 'The records do not reveal what first stirred Mana’s currents. They do reveal that it once connected the Mana Trees to one another. You carry their shared memory into the next descent.',
    });
  } else {
    showMessage(`Mana echo recovered (${found}/${MANA_LORE_RELIC_COUNT}). Its story is recorded in the Codex.`, 3);
  }
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

function queueChapter(key, card) {
  if (!card || save.introducedChapters.includes(key)) return;
  save.introducedChapters.push(key);
  persistSave();
  chapterQueue.push({ key, kind: key.split(':')[0], ...card });
}

function discoverRegion() {
  queueChapter(`region:${currentRegionId()}`, regionChapters[currentRegionId()]);
}

function unlockCharacter(id) {
  if (save.unlockedCharacters.includes(id)) return false;
  const activeRun = character && ['playing', 'paused', 'won'].includes(mode);
  const unlocksThisRun = Number.isInteger(player.characterUnlocksThisRun)
    ? player.characterUnlocksThisRun : 0;
  if (activeRun && unlocksThisRun >= 1) {
    showMessage('One delver can be unlocked per descent. Other discoveries will be waiting next run.', 3);
    return false;
  }
  if (!runStats.unlocked.includes(id)) runStats.unlocked.push(id);
  save.unlockedCharacters.push(id);
  if (id === 'warden') save.warden = true;
  if (id === 'arcanist') save.arcanist = true;
  if (activeRun) player.characterUnlocksThisRun = unlocksThisRun + 1;
  persistSave();
  queueChapter(`character:${id}`, characterChapters[id]);
  if (activeRun) saveRunState();
  return true;
}

function recordFloorClear(floor) {
  save.highestFloorCleared = Math.max(save.highestFloorCleared, floor);
  if (save.highestFloorCleared >= 1) unlockCharacter('warden');
  if (save.highestFloorCleared >= 2) unlockCharacter('arcanist');
  persistSave();
}

function persistBankedZeny(amount) {
  const balance = Math.max(0, Math.floor(amount));
  try {
    localStorage.setItem(BANK_STORAGE_KEY, String(balance));
    save.bankedZeny = balance;
    return true;
  } catch (error) {
    showMessage('The bank could not save your zeny. The transaction was cancelled.', 4);
    return false;
  }
}

function persistRunAfterBankTransaction() {
  persistSave();
  saveRunState();
}

function resetBindings(device) {
  for (const action of bindingActions) {
    if (device !== 'pad') bindings.key[action.id] = action.key;
    if (device !== 'key') bindings.pad[action.id] = action.pad ?? null;
  }
}

function loadBindings() {
  resetBindings();
  try {
    const stored = JSON.parse(localStorage.getItem(CONTROLS_STORAGE_KEY) || '{}');
    for (const action of bindingActions) {
      if (typeof stored.key?.[action.id] === 'string') bindings.key[action.id] = stored.key[action.id];
      const padValue = stored.pad?.[action.id];
      if (padValue === null || Number.isInteger(padValue)) bindings.pad[action.id] = padValue;
    }
    // Saves made before L1 became the default weapon swap still hold R3 and an unbound L1.
    if (bindings.pad.nextWeapon === 11 && !Object.values(bindings.pad).includes(4)) bindings.pad.nextWeapon = 4;
  } catch (error) {
    resetBindings();
  }
}

function saveBindings() {
  try {
    localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(bindings));
  } catch (error) {
    // Bindings still work for this session if storage is blocked.
  }
}

function captureRoomRuntime(room) {
  if (!room) return null;
  const plain = (value) => JSON.parse(JSON.stringify(value));
  room.runtime = {
    enemies: plain(enemies),
    // Shots and their trails should never resume mid-flight after returning to a room.
    projectiles: [],
    enemyProjectiles: [],
    particles: [],
    bombs: [],
    groundHazards: [],
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

// Items merged into a newer one: a saved run that owned the old id now owns the new item.
const retiredItemIds = { 'storm-spool': 'wild-magic-core', 'ember-seed': 'wild-magic-core', 'nova-pearl': 'wild-magic-core' };

// A boss-room pickup saved before the Lifestone replaced the Guardian Heart becomes a Lifestone.
function migrateSavedPickup(state) {
  if (state.kind !== 'upgrade' || state.item?.id !== 'guardian-heart') return state;
  const lifestone = shopItemCatalog.find((item) => item.id === 'lifestone');
  return lifestone ? { ...state, item: lifestone } : state;
}

function restoreRoomRuntime(room) {
  const runtime = room.runtime;
  // A save from an older build may lack the enemy list; treat that room as fresh instead of crashing.
  if (!runtime || !Array.isArray(runtime.enemies)) return false;
  enemies.push(...runtime.enemies);
  // Runtime attacks are room-local and disposable; never resurrect a projectile or hazard from an old save.
  for (const obstacle of runtime.breakables || []) {
    if (room.type === 'shop' || room.type === 'bank') continue;
    const { spriteIndex, roomKey: obstacleRoomKey, ...state } = obstacle;
    breakables.push({
      ...state,
      sprite: obstacleSprites[spriteIndex] || obstacleSprites[0],
      room: rooms.find((candidate) => roomKey(candidate) === obstacleRoomKey) || room,
    });
  }
  for (const pickup of runtime.pickups || []) {
    const { roomKey: pickupRoomKey, ...savedState } = pickup;
    const state = migrateSavedPickup(savedState);
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
    optionalBranch: room.optionalBranch,
    bombCache: room.bombCache,
    keyCache: room.keyCache,
    shrineElement: room.shrineElement,
    shrineUsed: room.shrineUsed,
    extraKeyChance: room.extraKeyChance,
    guardChargeGranted: room.guardChargeGranted,
    trialCompleted: room.trialCompleted,
    trialGroupId: room.trialGroupId,
    trialStep: room.trialStep,
    trialSteps: room.trialSteps,
    trialBranch: room.trialBranch,
    trialMirrors: room.trialMirrors,
    trialMode: room.trialMode,
    trialNodes: room.trialNodes,
    trialSequence: room.trialSequence,
    trialProgress: room.trialProgress,
    trialTime: room.trialTime,
    trialRewardSpawned: room.trialRewardSpawned,
    lockedDoors: room.lockedDoors,
    rewardRoom: room.rewardRoom,
    treasureClaimed: room.treasureClaimed,
    coinsSpawned: room.coinsSpawned || 0,
    sizeKey: room.sizeKey,
    rewardClaimed: room.rewardClaimed,
    // Whole stalls are saved: the Bomb and Heart stalls are not catalogue items and prices scale with the floor.
    shopStock: room.shopStock?.map((stall) => JSON.parse(JSON.stringify(stall))) || null,
    rewardUpgrade: room.rewardUpgrade,
    riskShrineChoice: room.riskShrineChoice,
    riskShrineDone: room.riskShrineDone,
    secretExit: room.secretExit ? {
      direction: room.secretExit.direction,
      x: room.secretExit.room.x,
      y: room.secretExit.room.y,
      keyDropped: room.secretExit.keyDropped === true,
      extraKeyChance: room.secretExit.room.extraKeyChance || 0,
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
      characterUnlocksThisRun: player.characterUnlocksThisRun,
      aegisCharges: player.aegisCharges,
      luck: player.luck,
      lookX: player.lookX, lookY: player.lookY,
      fireCooldown: player.fireCooldown, invuln: player.invuln,
    },
    score,
    coins,
    materials: { ...materials },
    lifestoneRegen: player.lifestoneRegen ? { ...player.lifestoneRegen } : null,
    floorCoinsSpawned,
    floorCoinCeiling,
    floorOverflowRolled,
    keysHeld,
    bombsHeld,
    blanksHeld,
    orbitGuardChargeUps,
    orbitGuards: orbitGuards.map(({ x, y, ...guard }) => guard),
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
    fireModes: { ...fireModes },
    runOfferedAbilityIds: [...runOfferedAbilityIds],
    frostNovaCooldown,
    frostActive,
    equippedClothing: {
      legs: equippedClothing.legs?.id || null,
      chest: equippedClothing.chest?.id || null,
    },
    consumables,
    companions: companions.map(({ enemyCooldowns, ...companion }) => companion),
    storyLog,
    mouseAimActive: typeof mouseAimActive !== 'undefined' && mouseAimActive,
    runStats: { ...runStats, unlocked: [...runStats.unlocked] },
  };
}

function saveRunState() {
  if (!character || !currentRoom || deathTimer > 0 || !['playing', 'paused'].includes(mode)) return;
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

  character = characterRoster.find((entry) => entry.id === currentSaveId(saved.characterId));
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
  const savedMapOrder = Array.isArray(saved.mapOrder) ? saved.mapOrder.map(currentSaveId) : [];
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
      if (stock.kind && Number.isFinite(stock.cost)) return { ...(item || {}), ...stock };
      // Older saves kept only the id: such a stall has the catalogue's base price, or is gone if it was a staple.
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
    if (room.secretExit?.room) {
      room.secretExit.room.extraKeyChance = Number.isFinite(record.secretExit?.extraKeyChance)
        ? record.secretExit.extraKeyChance : 0.35;
    }
    room.returnTo = record.returnTo
      ? roomByPosition.get(`${record.returnTo.x},${record.returnTo.y}`) : null;
  }
  runOfferedAbilityIds.clear();
  for (const id of saved.runOfferedAbilityIds || []) {
    if (typeof id === 'string') runOfferedAbilityIds.add(id);
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
  if (typeof mouseAimActive !== 'undefined') mouseAimActive = saved.mouseAimActive === true;
  player.characterUnlocksThisRun = clamp(
    Number.isInteger(player.characterUnlocksThisRun) ? player.characterUnlocksThisRun : 0, 0, 1,
  );
  player.maxHp = clamp(player.maxHp, 1, startingHearts(character) + MAX_EXTRA_HEARTS);
  player.hp = Math.min(player.hp, player.maxHp);
  score = saved.score || 0;
  coins = saved.coins || 0;
  resetMaterials();
  for (const key of Object.keys(materialCatalog)) {
    const amount = saved.materials?.[key];
    if (Number.isFinite(amount) && amount > 0) materials[key] = Math.floor(amount);
  }
  const savedRegen = saved.lifestoneRegen;
  player.lifestoneRegen = savedRegen && Number.isFinite(savedRegen.ticks) && savedRegen.ticks > 0
    ? {
      ticks: Math.min(savedRegen.ticks, LIFESTONE_HEARTS * 3),
      timer: clamp(Number.isFinite(savedRegen.timer) ? savedRegen.timer : LIFESTONE_TICK_SECONDS, 0, LIFESTONE_TICK_SECONDS),
    }
    : null;
  floorCoinsSpawned = saved.floorCoinsSpawned || 0;
  floorCoinCeiling = saved.floorCoinCeiling || SOFT_FLOOR_COINS;
  floorOverflowRolled = saved.floorOverflowRolled === true;
  keysHeld = saved.keysHeld || 0;
  bombsHeld = saved.bombsHeld || 0;
  blanksHeld = Number.isInteger(saved.blanksHeld) ? saved.blanksHeld : 1;
  orbitGuardChargeUps = clamp(
    Number.isInteger(saved.orbitGuardChargeUps) ? saved.orbitGuardChargeUps
      : Number.isInteger(saved.orbitGuardCharges) ? Math.min(saved.orbitGuardCharges, ORBIT_GUARD_CHARGE_CAP) : 0,
    0,
    ORBIT_GUARD_CHARGE_CAP,
  );
  Object.assign(weapon, saved.weapon);
  ownedItems.clear();
  for (const id of saved.ownedItems || []) {
    if (typeof id === 'string' && !id.startsWith('mode-')) ownedItems.add(retiredItemIds[id] || id);
  }
  fireModes.melee = 'rapid';
  fireModes.bow = 'rapid';
  fireModes.magic = 'rapid';
  for (const style of ['melee', 'bow', 'magic']) {
    const savedMode = saved.fireModes?.[style];
    if (['rapid', 'charge', ...(style === 'bow' ? ['triple'] : [])].includes(savedMode)) {
      fireModes[style] = savedMode;
    }
  }
  magicElements.clear();
  magicElements.add('bubble');
  for (const element of saved.magicElements || []) {
    if (Object.hasOwn(magicElementPalette, element)) magicElements.add(element);
  }
  for (const item of shopItemCatalog) {
    if (item.kind === 'element' && ownedItems.has(item.id)) magicElements.add(item.element);
  }
  activeMagicElement = magicElements.has(saved.activeMagicElement) ? saved.activeMagicElement : 'bubble';
  combatStyles.clear();
  for (const style of ['melee', 'bow', 'magic']) combatStyles.add(style);
  meleeWeapons.clear();
  for (const item of saved.meleeWeapons || []) meleeWeapons.add(item);
  activeCombatStyle = saved.activeCombatStyle;
  resetStyleHeat();
  resetInputAI();
  frostNovaCooldown = saved.frostNovaCooldown || 0;
  frostActive = Boolean(saved.frostActive);
  equippedClothing.legs = shopItemCatalog.find((item) => item.id === saved.equippedClothing?.legs) || null;
  equippedClothing.chest = shopItemCatalog.find((item) => item.id === saved.equippedClothing?.chest) || null;
  consumables.length = 0;
  consumables.push(...(saved.consumables || []));
  companions.length = 0;
  canvas.style.cursor = 'crosshair';
  deathTimer = 0;
  messageToasts.length = 0;
  player.knockback = null;
  resetRunStats(saved.runStats);
  mode = 'playing';
  showMap = false;
  showStoryJournal = false;
  spawnRoom(currentRoom);
  orbitGuards.length = 0;
  orbitGuards.push(...(Array.isArray(saved.orbitGuards) ? saved.orbitGuards
    .filter((guard) => ['arrow', 'sword', 'mana'].includes(guard.kind) && Number.isFinite(guard.angle))
    .slice(0, ORBIT_GUARD_MAX)
    .map((guard) => ({
      ...guard,
      x: player.x + Math.cos(guard.angle) * 32,
      y: player.y - 20 + Math.sin(guard.angle) * 32,
      radius: 11,
      color: guard.kind === 'arrow' ? '#d8b577'
        : guard.kind === 'sword' ? '#c4e8ff' : magicElementPalette[activeMagicElement] || '#62d9ee',
    })) : []));
  nextOrbitGuardId = orbitGuards.reduce((nextId, guard) => Math.max(nextId, (guard.id || 0) + 1), 1);
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

function isCharacterUnlocked(entry) {
  return entry.id === 'wanderer' || entry.random || save.unlockedCharacters.includes(entry.id) ||
    (entry.id === 'arcanist' && save.arcanist) ||
    (entry.id === 'warden' && save.warden) ||
    (entry.id === 'mycelia-sporeling' && save.discoveredItemIds.includes('spore-bloom')) ||
    (entry.id === 'echo-bound-delver' && (save.loreRelics || []).length === MANA_LORE_RELIC_COUNT);
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

function assignBinding(device, id, value) {
  const store = bindings[device];
  const previous = store[id];
  const cleared = value === null || value === '';
  const other = cleared ? null : bindingActions.find((action) => action.id !== id && store[action.id] === value &&
    (device === 'key' || !action.keyOnly));
  if (other) store[other.id] = previous;
  store[id] = value;
  saveBindings();
  updateControlsHint();
  return other;
}

function bindCaptured(device, value) {
  const action = controlsActionList()[controlsRow];
  controlsCapture = false;
  if (!action) return;
  const swapped = assignBinding(device, action.id, value);
  const label = device === 'key' ? keyLabel(value) : padButtonLabel(value);
  showMessage(swapped ? `${action.label} = ${label}. ${swapped.label} took its old button.` : `${action.label} = ${label}.`, 2);
}
