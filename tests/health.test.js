const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceText, loadFunctions } = require('./helpers/load');

function combat() {
  const c = vm.createContext({
    player: { x: 100, y: 100, radius: 12, hp: 4, maxHp: 4, armor: 0, invuln: 0 },
    mode: 'playing', ownedItems: new Set(), enemies: [], enemyProjectiles: [], pickups: [],
    groundHazards: [], bossStrikes: [], breakables: [], currentFloor: 12,
    save: { loreRelics: [] }, rooms: [], manaLoreRelics: [], shopItemCatalog: [],
    runOfferedAbilityIds: new Set(),
    reservedUpgradeIds: new Set(),
    combatStyles: new Set(['melee', 'bow', 'magic']), activeCombatStyle: 'magic',
    orbitGuardChargeUps: 0, ORBIT_GUARD_CHARGE_REQUIREMENT: 5,
    ORBIT_GUARD_CHARGE_CAP: 8, ORBIT_GUARD_SUMMON_COUNT: 3, ORBIT_GUARD_MAX: 13,
    blanksHeld: 1, bombsHeld: 0, coins: 100,
    powerHatByItem: {},
    orbitGuards: [], nextOrbitGuardId: 1,
    magicElementPalette: { water: '#62d9ee' }, activeMagicElement: 'water',
    hurtVignetteTimer: 0, hurtVignetteStrength: 0, HURT_VIGNETTE_DURATION: 0.4,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    distanceBetween: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    hasLineOfSight: () => true,
    monsterSprites: {},
  });
  for (const file of ['playermanager.js', 'mobmanager.js', 'worldmanager.js', 'gameui.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c);
  }
  vm.runInContext(`
    knockPlayerBack = vibrateController = triggerCameraShake = updateHud =
      clearSavedRun = showMessage = addParticles = playSound = saveRunState = () => {};
  `, c);
  return c;
}

test('four hearts withstand eight unprotected half-heart hits', () => {
  const c = combat();
  for (let hit = 1; hit <= 8; hit += 1) {
    c.player.invuln = 0;
    c.damagePlayer(0.5, null);
    assert.equal(c.player.hp, 4 - hit * 0.5);
    // The fatal hit starts a short death slow-motion; the game-over screen follows once it elapses.
    assert.equal(vm.runInContext('deathTimer', c) > 0, hit === 8);
    assert.equal(c.mode, 'playing');
  }
});

test('enemy body contact costs a full heart, including late-floor minibosses', () => {
  const c = combat();
  for (const enemy of [{}, { miniBoss: true }, { boss: true }]) {
    c.player.hp = 4;
    c.player.invuln = 0;
    c.damagePlayer(c.contactDamage(enemy), enemy);
    assert.equal(c.player.hp, 3);
  }
});

test('armor absorbs a half-heart hit without healing the player', () => {
  const c = combat();
  c.player.hp = 3.5;
  c.player.armor = 1;
  c.damagePlayer(0.5, null);
  assert.equal(c.player.hp, 3.5);
  assert.equal(c.player.armor, 0);
});

test('invulnerability and Aegis still block half-heart damage', () => {
  const c = combat();
  c.player.invuln = 1;
  c.damagePlayer(0.5, null);
  assert.equal(c.player.hp, 4);
  c.player.invuln = 0;
  c.ownedItems.add('bonded-aegis');
  c.player.aegisCharges = 1;
  c.damagePlayer(0.5, null);
  assert.equal(c.player.hp, 4);
  assert.equal(c.player.aegisCharges, 0);
});

test('five room clears summon three individual weapon familiars after unlock', () => {
  const c = combat();
  Object.assign(c, {
    currentRoom: {},
    orbitGuardChargeUps: 4,
    ORBIT_GUARD_CHARGE_REQUIREMENT: 5,
    orbitGuards: [],
    nextOrbitGuardId: 1,
    companions: [],
  });
  c.magicElementPalette = { water: '#62d9ee' };
  c.activeMagicElement = 'water';
  c.currentAttackStyle = () => 'magic';
  c.useOrbitGuard();
  assert.equal(c.orbitGuards.length, 0);
  assert.equal(c.orbitGuardChargeUps, 4);

  c.ownedItems.add('orbiting-projectiles');
  c.orbitGuardChargeUps = 5;
  c.useOrbitGuard();
  assert.equal(c.orbitGuardChargeUps, 0);
  assert.equal(c.orbitGuards.length, 3);
  assert.ok(c.orbitGuards.every((guard) => guard.kind === 'mana'));
  assert.ok(c.orbitGuards.every((guard) =>
    Math.abs(Math.hypot(guard.x - c.player.x, guard.y - (c.player.y - 20)) - 32) < 0.001));
});

test('each orbiting guard blocks one projectile or hits one enemy, not both', () => {
  const c = combat();
  Object.assign(c, {
    orbitGuards: [{ id: 1, kind: 'mana', x: 120, y: 80, radius: 11, color: '#62d9ee', angle: 0 }],
    enemies: [{ x: 120, y: 80, radius: 12, hp: 5 }],
    companions: [],
    damageEnemy: (enemy, amount) => { enemy.hp -= amount; },
  });
  c.shieldWithCompanion({ x: 120, y: 80, radius: 5 });
  assert.equal(c.orbitGuards.length, 0);
  assert.equal(c.enemies[0].hp, 5);

  c.orbitGuards.push({ id: 2, kind: 'sword', x: 120, y: 80, radius: 11, color: '#c4e8ff', angle: 0 });
  c.updateOrbitGuards(0);
  assert.equal(c.orbitGuards.length, 0);
  assert.equal(c.enemies[0].hp, 3);

  c.orbitGuards.push({ id: 3, kind: 'arrow', x: 120, y: 80, radius: 11, color: '#d8b577', angle: 0 });
  c.damagePlayer(1, c.enemies[0]);
  assert.equal(c.orbitGuards.length, 0);
  assert.equal(c.player.hp, 4);
});

test('Shockwave is the default defense action before the familiar unlock', () => {
  const c = combat();
  c.currentRoom = {};
  let uses = 0;
  c.useShockwave = () => { uses += 1; };
  c.useOrbitGuard();
  assert.equal(uses, 1);
});

test('familiar summoning respects the 13-orbit cap and preserves charge when full', () => {
  const c = combat();
  Object.assign(c, {
    currentRoom: {}, ORBIT_GUARD_CHARGE_REQUIREMENT: 5,
    ORBIT_GUARD_SUMMON_COUNT: 3, ORBIT_GUARD_MAX: 13,
    orbitGuardChargeUps: 5, orbitGuards: Array.from({ length: 12 }, (_, id) => ({ id })),
    nextOrbitGuardId: 20,
  });
  c.ownedItems.add('orbiting-projectiles');
  c.useOrbitGuard();
  assert.equal(c.orbitGuards.length, 13);
  assert.equal(c.orbitGuardChargeUps, 0);

  c.orbitGuardChargeUps = 5;
  c.useOrbitGuard();
  assert.equal(c.orbitGuards.length, 13);
  assert.equal(c.orbitGuardChargeUps, 5);
});

test('shops retain bomb and heart stock with at most two ability offers', () => {
  const c = combat();
  c.currentFloor = 1;
  c.MIN_ABILITY_COST = 3;
  c.heartVesselAllowed = () => true;
  c.isUpgradeAvailable = () => true;
  c.shopItemCatalog = [
    { id: 'ability-a', name: 'A', description: 'A', cost: 5, kind: 'ability' },
    { id: 'ability-b', name: 'B', description: 'B', cost: 5, kind: 'ability' },
    { id: 'ability-c', name: 'C', description: 'C', cost: 5, kind: 'ability' },
  ];
  const stock = c.createShopStock();
  assert.equal(stock.filter((item) => item.kind === 'shop-bomb').length, 1);
  assert.equal(stock.filter((item) => item.kind === 'shop-heart').length, 1);
  assert.ok(stock.filter((item) => item.kind === 'ability').length >= 1);
  assert.ok(stock.filter((item) => item.kind === 'ability').length <= 2);
  const firstAbility = stock.find((item) => item.kind === 'ability');
  assert.ok(c.runOfferedAbilityIds.has(firstAbility.id));
  assert.ok(!c.createShopStock().some((item) => item.id === firstAbility.id));

  c.shopItemCatalog.push({
    id: 'orbiting-projectiles', name: 'Familiar Sigil', description: 'Unlock familiars',
    cost: 10, kind: 'ability',
  });
  c.ownedItems.add('ability-a');
  c.ownedItems.add('ability-b');
  const fullSlotsStock = c.createShopStock();
  assert.ok(fullSlotsStock.some((item) => item.id === 'orbiting-projectiles'));
});

test('a linked two-room trial reserves its reward for the final chamber', () => {
  const c = combat();
  const first = {
    type: 'trial', trialGroupId: 'trial-a', trialStep: 1, trialSteps: 2,
    trialCompleted: false, trialProgress: 0, guardChargeGranted: false,
  };
  const second = {
    type: 'trial', trialGroupId: 'trial-a', trialStep: 2, trialSteps: 2,
    trialCompleted: false, trialProgress: 3, guardChargeGranted: false,
  };
  c.rooms = [first, second];
  c.currentRoom = second;
  let rewards = 0;
  c.grantOrbitGuardChargeUp = () => {};
  c.grantRewardTrialLoot = () => { rewards += 1; };
  c.completeRewardTrial({ x: 10, y: 10 });
  assert.equal(second.trialCompleted, false);
  assert.equal(second.trialProgress, 0);
  assert.equal(rewards, 0);
  first.trialCompleted = true;
  second.trialProgress = 3;
  c.completeRewardTrial({ x: 10, y: 10 });
  assert.equal(second.trialCompleted, true);
  assert.equal(rewards, 1);
});

test('shop bomb and heart purchases apply their inventory and healing', () => {
  const c = combat();
  c.player.hp = 2;
  c.currentRoom = { shopStock: [
    { id: 'shop-bomb', name: 'Bomb', description: 'Gain bomb', cost: 5, kind: 'shop-bomb' },
    { id: 'shop-heart', name: 'Heart', description: 'Restore health', cost: 5, kind: 'shop-heart' },
  ] };
  c.bombsHeld = 0;
  c.coins = 20;
  c.popOverPlayer = () => {};
  c.buyShopItem(0);
  c.buyShopItem(1);
  assert.equal(c.bombsHeld, 1);
  assert.equal(c.player.hp, 3);
  assert.equal(c.coins, 10);
});

test('firing direction is independent of player movement velocity', () => {
  const c = combat();
  Object.assign(c, {
    lastInputMode: 'controller',
    gamepadInput: { aimX: 1, aimY: 0, aimActive: false },
    pointer: { x: 0, y: 0, down: true },
    camera: { x: 0, y: 0 },
    player: { ...c.player, x: 100, y: 100, lookX: 0, lookY: 1 },
    attackOriginY: () => 66,
    playerVelocity: { x: 0, y: 300 },
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'playermanager.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function attackOriginY()', 'function updateTouchAimFacing()', 'source'), c);
  assert.equal(c.currentAimAngle(), 0);
  c.playerVelocity = { x: -300, y: 0 };
  assert.equal(c.currentAimAngle(), 0);
});

test('trial light puzzle mirrors remain inside the room, away from doorways', () => {
  const c = combat();
  c.ROOM_W = 960;
  c.ROOM_H = 540;
  c.currentRoom = { type: 'trial', trialBranch: 1, trialMirrors: ['/', '/', '/'] };
  for (const mirror of c.rewardTrialMirrors()) {
    assert.ok(mirror.x > 90 && mirror.x < c.ROOM_W - 90);
    assert.ok(mirror.y > 90 && mirror.y < c.ROOM_H - 90);
  }
  assert.ok(c.rewardTrialSource().x > 90);
  assert.ok(c.rewardTrialReceiver().x < c.ROOM_W - 90);
});

test('aligning trial mirrors clears the room and guarantees a collectible reward', () => {
  const c = combat();
  c.ROOM_W = 960;
  c.ROOM_H = 540;
  c.currentRoom = {
    type: 'trial', trialBranch: 1, trialMirrors: ['/', '/', '\\'],
    trialCompleted: false, trialMode: 'mirror', guardChargeGranted: false,
    trialRewardSpawned: false, rewardRoom: false,
  };

  for (const mirror of c.rewardTrialMirrors()) {
    c.player.x = mirror.x;
    c.player.y = mirror.y;
    c.interact();
  }
  assert.equal(c.currentRoom.trialCompleted, false);
  c.updateRewardTrial(0.5);
  assert.equal(c.currentRoom.trialCompleted, false);
  c.updateRewardTrial(0.6);
  assert.equal(c.currentRoom.trialCompleted, true);
  assert.equal(c.currentRoom.cleared, true);
  assert.equal(c.currentRoom.trialRewardSpawned, true);
  assert.ok(c.pickups.length > 0);
  assert.ok(c.orbitGuardChargeUps > 0);
});

test('mirror trials always start at least two lenses from solved', () => {
  const c = combat();
  c.ROOM_W = 960;
  c.ROOM_H = 540;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const room = { type: 'trial', trialMode: 'mirror', trialBranch: attempt % 2 ? 1 : -1 };
    c.initializeRewardTrial(room);
    const wrong = c.rewardTrialMirrors(room)
      .filter((mirror) => mirror.orientation !== mirror.solution).length;
    assert.ok(wrong >= 2, `only ${wrong} lens(es) wrong`);
  }
});

test('turning a single lens never clears a freshly generated mirror trial', () => {
  const c = combat();
  c.ROOM_W = 960;
  c.ROOM_H = 540;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    c.currentRoom = { type: 'trial', trialMode: 'mirror', trialBranch: attempt % 2 ? 1 : -1 };
    c.initializeRewardTrial(c.currentRoom);
    const mirror = c.rewardTrialMirrors()[attempt % 3];
    c.player.x = mirror.x;
    c.player.y = mirror.y;
    c.interact();
    c.updateRewardTrial(5);
    assert.notEqual(c.currentRoom.trialCompleted, true);
  }
});

test('memory and moving-spark trials initialize randomized, persistent layouts', () => {
  const c = combat();
  for (const mode of ['memory', 'relay']) {
    const room = c.createRoom(0, 0, 'trial');
    room.trialMode = mode;
    c.initializeRewardTrial(room);
    const nodes = JSON.stringify(room.trialNodes);
    const sequence = JSON.stringify(room.trialSequence);
    c.initializeRewardTrial(room);
    assert.equal(JSON.stringify(room.trialNodes), nodes);
    assert.equal(JSON.stringify(room.trialSequence), sequence);
    assert.equal(room.trialNodes.length, mode === 'memory' ? 5 : 3);
    if (mode === 'memory') {
      assert.equal(room.trialSequence.length, 4);
      assert.notDeepEqual(room.trialSequence.slice(0, 3), [0, 0, 0]);
    }
  }
});

test('repeating the rune sequence completes a memory trial', () => {
  const c = combat();
  c.ROOM_W = 960;
  c.ROOM_H = 540;
  c.currentRoom = {
    type: 'trial', trialMode: 'memory', trialBranch: 1,
    trialNodes: [
      { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.7, y: 0.7 },
      { x: 0.3, y: 0.7 }, { x: 0.5, y: 0.5 },
    ],
    trialSequence: [2, 0, 3, 1], trialProgress: 0,
    trialCompleted: false, guardChargeGranted: false, trialRewardSpawned: false,
  };
  for (const index of c.currentRoom.trialSequence) {
    const node = c.rewardTrialNodes()[index];
    c.player.x = node.x;
    c.player.y = node.y;
    assert.equal(c.canInteract(), true);
    c.interact();
  }
  assert.equal(c.currentRoom.trialCompleted, true);
  assert.equal(c.currentRoom.trialProgress, 4);
  assert.equal(c.currentRoom.trialRewardSpawned, true);
  assert.ok(c.pickups.length > 0);
});

test('moving-spark trial tracks three moving targets and rewards completion', () => {
  const c = combat();
  c.ROOM_W = 960;
  c.ROOM_H = 540;
  c.currentRoom = {
    type: 'trial', trialMode: 'relay', trialBranch: 1,
    trialNodes: [
      { phase: 0, speed: 0.8 },
      { phase: 2, speed: 1 },
      { phase: 4, speed: 1.2 },
    ],
    trialProgress: 0, trialTime: 0,
    trialCompleted: false, guardChargeGranted: false, trialRewardSpawned: false,
  };
  const firstPosition = c.rewardTrialNodes()[0];
  c.player.x = 0;
  c.player.y = 0;
  c.updateRewardTrial(0.5);
  const movedPosition = c.rewardTrialNodes()[0];
  assert.notDeepEqual(movedPosition, firstPosition);
  for (let index = 0; index < 3; index += 1) {
    const target = c.rewardTrialNodes()[c.currentRoom.trialProgress];
    c.player.x = target.x;
    c.player.y = target.y;
    c.updateRewardTrial(0);
  }
  assert.equal(c.currentRoom.trialCompleted, true);
  assert.equal(c.currentRoom.trialProgress, 3);
  assert.equal(c.currentRoom.trialRewardSpawned, true);
  assert.ok(c.pickups.length > 0);
});

test('trial Codex rewards relocate an uncollected regional relic without duplicates', () => {
  const c = combat();
  c.ROOM_W = 960;
  c.ROOM_H = 540;
  vm.runInContext('Math.random = () => 0.05;', c);
  c.currentFloor = 1;
  c.mapOrder = ['tulimshar'];
  c.manaLoreRelics = [{ id: 'tulimshar-echo', region: 'tulimshar' }];
  const secretRoom = {
    runtime: { pickups: [{ kind: 'lore-relic', item: { id: 'tulimshar-echo' } }] },
  };
  c.rooms = [secretRoom];
  c.currentRoom = { type: 'trial', trialRewardSpawned: false };
  c.grantRewardTrialLoot(c.currentRoom);
  c.grantRewardTrialLoot(c.currentRoom);
  assert.equal(c.currentRoom.trialRewardSpawned, true);
  assert.equal(c.pickups.filter((pickup) => pickup.kind === 'lore-relic').length, 1);
  assert.equal(secretRoom.runtime.pickups.some((pickup) => pickup.kind === 'lore-relic'), false);
  assert.equal(c.hasLooseLoreRelic('tulimshar-echo'), true);
});

test('moving orbit familiars sweep across enemies instead of missing fast crossings', () => {
  const c = combat();
  Object.assign(c, {
    orbitGuards: [{ id: 1, kind: 'mana', x: 132, y: 80, radius: 11, color: '#62d9ee', angle: 0 }],
    enemies: [{ x: 100, y: 80, radius: 1, hp: 5 }],
    damageEnemy: (enemy, amount) => { enemy.hp -= amount; },
  });
  c.updateOrbitGuards(Math.PI / 2.8);
  assert.equal(c.orbitGuards.length, 0);
  assert.equal(c.enemies[0].hp, 3);
});

test('active familiar icons follow the selected weapon style', () => {
  const c = combat();
  c.orbitGuards.push(
    { id: 1, kind: 'mana', x: 132, y: 80, radius: 11, color: '#62d9ee', angle: 0 },
  );
  c.updateOrbitGuards(0);
  assert.equal(c.orbitGuards[0].kind, 'mana');
  c.activeCombatStyle = 'bow';
  c.updateOrbitGuards(0);
  assert.equal(c.orbitGuards[0].kind, 'arrow');
  c.activeCombatStyle = 'melee';
  c.updateOrbitGuards(0);
  assert.equal(c.orbitGuards[0].kind, 'sword');
});

test('ordinary splash costs half a heart but marked boss heavy strikes cost two', () => {
  const c = combat();
  c.groundHazards.push({ x: 100, y: 100, radius: 40, kind: 'fire', owner: 'enemy', damage: 3, damageCooldown: 0, ttl: 3 });
  c.updateGroundHazards(0.016);
  assert.equal(c.player.hp, 3.5);
  c.player.invuln = 0;
  c.explodeBomb({ x: 100, y: 100, radius: 110, owner: 'enemy' });
  assert.equal(c.player.hp, 3);
  c.player.invuln = 0;
  c.bossStrikes.push({ x: 100, y: 100, radius: 50, damage: 2, timer: 0 });
  c.updateBossStrikes(0.016);
  assert.equal(c.player.hp, 1);
});

test('wide pulse punishes normal walking but a late real dash evades it through invulnerability', () => {
  for (const warning of [0.95, 1.05, 1.1]) {
    for (const [action, expectedHp] of [['walk', 3], ['late-dash', 4], ['early-dash', 3]]) {
      const c = combat();
      Object.assign(c, {
        ROOM_W: 960, ROOM_H: 540, currentRoom: { type: 'normal' }, character: {},
        dashTimer: 0, dashCooldown: 0, dashVector: { x: 1, y: 0 },
        keys: {}, gamepadInput: { moveX: 0, moveY: 0 }, touchInput: { moveX: 0, moveY: 0 },
      });
      c.player.x = 480;
      c.player.y = 270;
      c.player.lookX = 1;
      c.player.lookY = 0;
      c.spawnBossStrike(480, 270, 300, warning, 1);
      c.bossStrikes[0].dashCheck = true;
      for (let frame = 0; frame < Math.ceil(warning * 120) + 2; frame++) {
        if ((action === 'late-dash' && frame === Math.floor((warning - 0.15) * 120)) ||
            (action === 'early-dash' && frame === 12)) c.startDash();
        c.player.x += (c.dashTimer > 0 ? 620 : action === 'walk' ? 235 : 0) / 120;
        c.dashTimer = Math.max(0, c.dashTimer - 1 / 120);
        c.updateBossStrikes(1 / 120);
        c.player.invuln = Math.max(0, c.player.invuln - 1 / 120);
      }
      assert.equal(c.player.hp, expectedHp, `${action}, ${warning}s warning`);
      assert.equal(c.bossStrikes.length, 0);
    }
  }
});

test('heart renderer clips a half-heart to exactly half the icon with or without the image', () => {
  for (const imageLoaded of [true, false]) {
    const c = combat();
    const clips = [];
    let images = 0;
    c.heartImage = { complete: imageLoaded, naturalWidth: imageLoaded ? 17 : 0 };
    c.ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      bezierCurveTo() {}, fill() {}, stroke() {}, clip() {},
      rect: (x, y, width, height) => clips.push({ width, height }),
      drawImage: () => { images += 1; },
    };
    c.drawHealthHeart(0, 0, 0.5);
    assert.deepEqual(clips, [{ width: 8.5, height: 17 }]);
    assert.equal(images, imageLoaded ? 1 : 0);
    clips.length = 0;
    c.drawHealthHeart(0, 0, 0);
    assert.equal(clips.length, 0);
    c.drawHealthHeart(0, 0, 1);
    assert.deepEqual(clips, [{ width: 17, height: 17 }]);
  }
});

test('weapon slots show the swap cooldown on the unselected styles only', () => {
  const c = combat();
  const texts = [];
  c.ctx = new Proxy({}, {
    get: (_, key) => (...args) => { if (key === 'fillText') texts.push(args[0]); },
    set: () => true,
  });
  c.activeCombatStyle = 'magic';
  c.currentAttackStyle = () => 'magic';
  c.classSignature = () => null;
  vm.runInContext('weaponSwapCooldown = 4.2;', c);
  c.drawStyleSlots();
  assert.equal(texts.filter((text) => text === '5').length, 2);
  texts.length = 0;
  vm.runInContext('weaponSwapCooldown = 0;', c);
  c.drawStyleSlots();
  assert.equal(texts.includes('5'), false);
});

test('restoring a room whose saved state lacks lists treats it as fresh instead of throwing', () => {
  const c = vm.createContext({ enemies: [], breakables: [], pickups: [], rooms: [], obstacleSprites: [] });
  loadFunctions(c, 'dbmanager.js', ['restoreRoomRuntime']);
  assert.equal(c.restoreRoomRuntime({ runtime: null }), false);
  assert.equal(c.restoreRoomRuntime({ runtime: {} }), false);
  assert.equal(c.enemies.length, 0);
  assert.equal(c.restoreRoomRuntime({ type: 'normal', runtime: { enemies: [{ hp: 1 }] } }), true);
  assert.equal(c.enemies.length, 1);
});
