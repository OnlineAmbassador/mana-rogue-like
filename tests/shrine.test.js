const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, source } = require('./helpers/combat');

// worldmanager.js is already loaded by combat(); only the collaborators the altar room touches are stubbed.
function shrineContext({ maxHp = 4, hp = 4, floor = 1 } = {}) {
  const c = combat();
  Object.assign(c.player, { x: 480, y: 270, maxHp, hp });
  c.currentFloor = floor;
  c.directions = [];
  vm.runInContext(`
    mode = 'playing';
    rooms = [];
    reservedUpgradeIds = new Set();
    currentRoom = createRoom(3, 3, 'riskShrine');
    currentRoom.cleared = true;
    log = { granted: [], banners: [], saves: 0, coins: 0 };
    isPlayerNearDoor = () => false;
    saveRunState = () => { log.saves += 1; };
    createUpgradeReward = (suffix) => ({ id: 'reward-' + suffix, name: 'Test Upgrade', kind: 'passive' });
    grantUpgrade = (item) => { log.granted.push(item.id); return grantResult; };
    grantResult = true;
    gainMaxHeart = () => { player.maxHp += 1; player.hp = Math.min(player.maxHp, player.hp + 1); return true; };
    heartVesselAllowed = () => vesselAllowed;
    vesselAllowed = true;
    showPickupBanner = (name, tags) => { log.banners.push(name); };
    popOverPlayer = () => {};
    spawnCoin = () => { log.coins += 1; return true; };
    enemyKindsForCurrentMap = () => ['maggot'];
    createEnemy = (kind, x, y) => ({ kind, x, y, hp: 1, radius: 10 });
    applyEliteMutation = (enemy) => enemy;
    applyBossAIPromotion = (enemy) => { enemies.push(enemy); return enemy; };
    findEnemySpawnPosition = () => ({ x: 200 + enemies.length * 40, y: 200 });
  `, c);
  return c;
}

const stand = (c, which) => {
  const altar = vm.runInContext('riskShrineAltars()', c).find((entry) => entry.id === which);
  c.player.x = altar.x;
  c.player.y = altar.y;
};
const log = (c) => vm.runInContext('log', c);

test('altars are interactable only while standing at one and the room is unspent', () => {
  const c = shrineContext();
  assert.equal(c.canInteract(), false);
  stand(c, 'offering');
  assert.equal(c.canInteract(), true);
  stand(c, 'ambush');
  assert.equal(c.canInteract(), true);
  c.currentRoom.riskShrineChoice = 'offering';
  assert.equal(c.canInteract(), false);
});

test('the heart offering trades one heart container for one upgrade, once', () => {
  const c = shrineContext({ maxHp: 4, hp: 4 });
  stand(c, 'offering');
  c.interact();
  assert.deepEqual([...log(c).granted], ['reward-floor-1-risk-3-3']);
  assert.equal(c.player.maxHp, 3);
  assert.equal(c.player.hp, 3);
  assert.equal(c.currentRoom.riskShrineChoice, 'offering');
  assert.equal(c.currentRoom.riskShrineDone, true);
  c.interact();
  assert.equal(log(c).granted.length, 1);
  assert.equal(c.player.maxHp, 3);
});

test('the heart offering never takes the last spare hearts', () => {
  const c = shrineContext({ maxHp: 2, hp: 2 });
  stand(c, 'offering');
  c.interact();
  assert.equal(c.player.maxHp, 2);
  assert.equal(log(c).granted.length, 0);
  assert.equal(c.currentRoom.riskShrineChoice, null);
});

test('a refused upgrade costs nothing and leaves the altar available', () => {
  const c = shrineContext();
  c.grantResult = false;
  stand(c, 'offering');
  c.interact();
  assert.equal(c.player.maxHp, 4);
  assert.equal(c.currentRoom.riskShrineChoice, null);
  assert.equal(c.reservedUpgradeIds.size, 0);
  assert.equal(c.canInteract(), true);
});

test('the ambush altar seals the room and spawns a capped wave', () => {
  const c = shrineContext({ floor: 3 });
  stand(c, 'ambush');
  c.interact();
  assert.equal(c.currentRoom.riskShrineChoice, 'ambush');
  assert.equal(c.currentRoom.cleared, false);
  assert.equal(c.enemies.length, 4);
  assert.equal(c.canInteract(), false);

  const deep = shrineContext({ floor: 9 });
  stand(deep, 'ambush');
  deep.interact();
  assert.equal(deep.enemies.length, 6);
});

test('clearing the ambush pays one heart vessel and cannot pay twice', () => {
  const c = shrineContext({ maxHp: 3, hp: 1 });
  stand(c, 'ambush');
  c.interact();
  c.enemies.length = 0;
  c.completeRiskShrineAmbush(c.currentRoom);
  assert.equal(c.player.maxHp, 4);
  assert.equal(c.player.hp, 2);
  assert.deepEqual([...log(c).banners], ['Heart Vessel']);
  assert.equal(c.currentRoom.riskShrineDone, true);
  c.completeRiskShrineAmbush(c.currentRoom);
  assert.equal(c.player.maxHp, 4);
  assert.equal(log(c).banners.length, 1);
});

test('when no heart vessel is allowed the ambush heals fully and drops zeny', () => {
  const c = shrineContext({ maxHp: 5, hp: 1 });
  c.vesselAllowed = false;
  stand(c, 'ambush');
  c.interact();
  c.completeRiskShrineAmbush(c.currentRoom);
  assert.equal(c.player.maxHp, 5);
  assert.equal(c.player.hp, 5);
  assert.equal(log(c).coins, 3);
});

test('an offering room never runs the ambush reward', () => {
  const c = shrineContext();
  stand(c, 'offering');
  c.interact();
  const before = c.player.maxHp;
  c.completeRiskShrineAmbush(c.currentRoom);
  assert.equal(c.player.maxHp, before);
});

test('altar rooms are placed as unlocked dead ends on some floors but not all', () => {
  const c = combat();
  c.Math.random = Math.random;
  c.currentFloor = 1;
  c.keysHeld = 0;
  c.ownedItems = new Set();
  c.combatStyles = new Set();
  c.directions = [
    { name: 'up', dx: 0, dy: -1 },
    { name: 'right', dx: 1, dy: 0 },
    { name: 'down', dx: 0, dy: 1 },
    { name: 'left', dx: -1, dy: 0 },
  ];
  c.oppositeDirection = { up: 'down', right: 'left', down: 'up', left: 'right' };
  c.shopItemCatalog = [{ id: 'map-upgrade', name: 'Map Upgrade', kind: 'passive' }];
  c.reservedUpgradeIds = new Set();
  vm.runInContext(`
    createShopStock = () => [];
    ownedAbilityCount = reservedAbilityCount = () => 0;
    isUpgradeAvailable = heartVesselAllowed = () => true;
  `, c);
  let withShrine = 0;
  let without = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    c.reservedUpgradeIds.clear();
    const dungeon = c.generateDungeon();
    const altars = dungeon.rooms.filter((room) => room.type === 'riskShrine');
    assert.ok(altars.length <= 1);
    if (altars.length === 0) {
      without += 1;
      continue;
    }
    withShrine += 1;
    const [room] = altars;
    assert.equal(Object.keys(room.links).length, 1);
    assert.deepEqual(Object.keys(room.lockedDoors), []);
    assert.equal(room.riskShrineChoice, null);
    assert.equal(room.riskShrineDone, false);
    const direction = c.directions.find((entry) => room.links[entry.name]);
    const host = dungeon.rooms.find((other) => other.x === room.x + direction.dx && other.y === room.y + direction.dy);
    assert.deepEqual(Object.keys(host.lockedDoors), []);
    assert.ok(!['boss', 'secret', 'trial'].includes(host.type));
    assert.equal(host.optionalBranch, false);
  }
  assert.ok(withShrine > 0 && without > 0, `expected both outcomes, got ${withShrine}/${without}`);
});

test('altar choices are saved with the run', () => {
  const db = source('dbmanager.js');
  assert.match(db, /riskShrineChoice: room\.riskShrineChoice/);
  assert.match(db, /riskShrineDone: room\.riskShrineDone/);
});
