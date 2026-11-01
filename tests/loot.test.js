const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, peek } = require('./helpers/combat');
const { loadBetween } = require('./helpers/load');

function lootContext() {
  const c = combat();
  c.spawnCoin = () => false;
  c.shopItemIconImages = {};
  c.recordItemDiscovery = c.updateHud = c.showMessage = c.showPickupBanner = c.popOverPlayer = c.playPickupSound = () => {};
  return c;
}

const materialPickups = (c) => c.pickups.filter((pickup) => pickup.kind === 'material').map((pickup) => pickup.material);

function roll(c, enemy, value) {
  c.pickups.length = 0;
  c.Math.random = () => value;
  c.rollMaterialDrops(300, 300, enemy);
  return materialPickups(c);
}

test('Iron Ore is the common drop and Dark Crystal the rarer one', () => {
  const c = lootContext();
  const rates = peek(c, 'MATERIAL_DROP_TUNING.rates');
  assert.equal(rates.ironOre, 0.06);
  assert.equal(rates.darkCrystal, 0.02);
  assert.ok(rates.ironOre > rates.darkCrystal);
  assert.deepEqual(roll(c, {}, 0.05), ['ironOre']);
  assert.deepEqual(roll(c, {}, 0.01), ['ironOre', 'darkCrystal']);
  assert.deepEqual(roll(c, {}, 0.5), []);
});

test('elites and minibosses roll twice as often, and Luck adds to both rates', () => {
  const c = lootContext();
  assert.deepEqual(roll(c, {}, 0.1), []);
  assert.deepEqual(roll(c, { elite: true }, 0.1), ['ironOre']);
  assert.deepEqual(roll(c, { miniBoss: true }, 0.039), ['ironOre', 'darkCrystal', 'lifeStone']);
  assert.equal(c.materialDropChance('lifeStone', {}), 0, 'ordinary foes never drop Life Stones');
  assert.ok(Math.abs(c.materialDropChance('lifeStone', { elite: true }) - 0.08) < 1e-9, 'elites have an 8% Life Stone');
  c.player.luck = 2;
  // 6% + 2 x 1% = 8% ore and 2% + 2 x 0.5% = 3% crystal.
  assert.deepEqual(roll(c, {}, 0.07), ['ironOre']);
  assert.deepEqual(roll(c, {}, 0.025), ['ironOre', 'darkCrystal']);
  assert.equal(c.materialDropChance('ironOre', {}), 0.08);
  assert.ok(Math.abs(c.materialDropChance('darkCrystal', { elite: true }) - 0.06) < 1e-9);
});

test('summoned, split-off, ambush and boss foes never drop materials', () => {
  const c = lootContext();
  for (const flag of ['boss', 'bossSummoned', 'isOffspring', 'surpriseSpawn', 'noMaterialDrops']) {
    assert.deepEqual(roll(c, { [flag]: true }, 0), [], flag);
  }
  assert.deepEqual(roll(c, {}, 0), ['ironOre', 'darkCrystal']);
});

test('dropLoot only rolls materials when it is told which foe died, and never for a boss', () => {
  const c = lootContext();
  c.Math.random = () => 0;
  c.dropLoot(300, 300, false, false);
  assert.deepEqual(materialPickups(c), []);
  c.pickups.length = 0;
  c.dropLoot(300, 300, false, false, { kind: 'bee' });
  assert.deepEqual(materialPickups(c), ['ironOre', 'darkCrystal']);
  c.pickups.length = 0;
  c.dropLoot(300, 300, true, false, { boss: true });
  assert.deepEqual(materialPickups(c), []);
});

test('all boss rewards leave clearance around the descent pad and room walls', () => {
  const c = lootContext();
  c.shopItemCatalog.push({ id: 'lifestone', kind: 'boss-relic' });
  c.weaponDropPool = () => [{ id: 'sword', name: 'Sword' }];
  c.spawnCoin = (x, y) => c.pickups.push({ x, y, kind: 'coin' });
  c.Math.random = () => 0;
  const pad = { x: c.ROOM_W * 0.72, y: c.ROOM_H / 2 };
  for (const death of [pad, { x: pad.x + 130, y: pad.y }, { x: pad.x, y: pad.y - 100 },
    { x: 0, y: 0 }, { x: c.ROOM_W, y: c.ROOM_H }]) {
    c.pickups.length = 0;
    c.dropLoot(death.x, death.y, true);
    assert.deepEqual(new Set(c.pickups.map((pickup) => pickup.kind)),
      new Set(['xp', 'heart', 'coin', 'upgrade', 'weapon', 'rune']));
    for (const pickup of c.pickups) {
      assert.ok(c.distanceBetween(pickup, pad) >= 120, `${pickup.kind} crowds the descent pad`);
      assert.ok(pickup.x >= 50 && pickup.x <= c.ROOM_W - 50, `${pickup.kind} outside horizontal bounds`);
      assert.ok(pickup.y >= 50 && pickup.y <= c.ROOM_H - 50, `${pickup.kind} outside vertical bounds`);
    }
  }
});

test('boss rewards keep their death location when it is already safely away from descent', () => {
  const c = lootContext();
  c.dropLoot(300, 300, true);
  const heart = c.pickups.find((pickup) => pickup.kind === 'heart');
  assert.deepEqual({ x: heart.x, y: heart.y }, { x: 300, y: 300 });
});

test('the sell prices and the expected extra zeny per run match the economy notes', () => {
  const c = lootContext();
  const catalog = peek(c, 'materialCatalog');
  const rates = peek(c, 'MATERIAL_DROP_TUNING.rates');
  assert.equal(catalog.ironOre.price, 1);
  assert.equal(catalog.darkCrystal.price, 3);
  // About 205 eligible kills a run (docs/ITEMS.md); the lean package should add roughly 27 zeny.
  const kills = 205;
  const expected = kills * (rates.ironOre * catalog.ironOre.price + rates.darkCrystal * catalog.darkCrystal.price);
  assert.ok(expected > 20 && expected < 30, `expected about 25 zeny, got ${expected}`);
});

test('a Lifestone gives a heart container below five extra hearts, then only regeneration', () => {
  const c = lootContext();
  const lifestone = { id: 'lifestone', name: 'Lifestone', kind: 'boss-relic' };
  // The Mage starts with four hearts, so maxHp 8 means four extra hearts.
  Object.assign(c.player, { maxHp: 8, hp: 3 });
  assert.equal(c.grantUpgrade(lifestone), true);
  assert.equal(c.player.maxHp, 9);
  assert.equal(c.player.hp, 3, 'the new container starts empty; regeneration fills it');
  assert.deepEqual({ ...c.player.lifestoneRegen }, { ticks: 3, timer: 6 });
  Object.assign(c.player, { maxHp: 9, hp: 4, lifestoneRegen: null });
  assert.equal(c.grantUpgrade(lifestone), true);
  assert.equal(c.player.maxHp, 9);
  assert.equal(c.player.lifestoneRegen.ticks, 3);
  assert.equal(c.ownedItems.has('lifestone'), false, 'every boss can drop another');
});

test('a Lifestone recovers one heart at 6, 12 and 18 seconds, even from full health', () => {
  const c = lootContext();
  Object.assign(c.player, { maxHp: 8, hp: 2 });
  c.startLifestoneRegen();
  c.updateLifestoneRegen(5.9);
  assert.equal(c.player.hp, 2);
  c.updateLifestoneRegen(0.2);
  assert.equal(c.player.hp, 3);
  c.updateLifestoneRegen(6);
  assert.equal(c.player.hp, 4);
  c.updateLifestoneRegen(6);
  assert.equal(c.player.hp, 5);
  assert.equal(c.player.lifestoneRegen, null);
  c.updateLifestoneRegen(60);
  assert.equal(c.player.hp, 5, 'three hearts in total');

  Object.assign(c.player, { maxHp: 4, hp: 4 });
  c.startLifestoneRegen();
  c.updateLifestoneRegen(6.1);
  assert.equal(c.player.hp, 4, 'never above the maximum');
  assert.equal(c.player.lifestoneRegen.ticks, 2);
});

test('a second Lifestone adds ticks without resetting the timer, and a dying run stops regeneration', () => {
  const c = lootContext();
  Object.assign(c.player, { maxHp: 8, hp: 2 });
  c.startLifestoneRegen();
  c.updateLifestoneRegen(4);
  c.startLifestoneRegen();
  assert.equal(c.player.lifestoneRegen.ticks, 6);
  assert.ok(Math.abs(c.player.lifestoneRegen.timer - 2) < 1e-9);
  vm.runInContext('deathTimer = 1', c);
  assert.equal(c.grantUpgrade({ id: 'lifestone', name: 'Lifestone', kind: 'boss-relic' }), false);
  c.updateLifestoneRegen(10);
  assert.equal(c.player.lifestoneRegen, null);
  assert.equal(c.player.hp, 2);
});

test('total curio damage is capped at x2.5', () => {
  const c = vm.createContext({
    chaosStatus: null,
    ownedItems: new Set(['a', 'b', 'c']),
    shopItemCatalog: [
      { id: 'a', kind: 'curio', effects: { damage: 1.5, speed: 1.1 } },
      { id: 'b', kind: 'curio', effects: { damage: 1.6 } },
      { id: 'c', kind: 'curio', effects: { damage: 1.25, speed: 1.35 } },
    ],
  });
  loadBetween(c, 'worldmanager.js', '// Damage curios and the chaos status', 'function rollChaosStatus');
  assert.equal(c.curioMultiplier('damage'), 2.5);
  assert.ok(Math.abs(c.curioMultiplier('speed') - 1.485) < 1e-9, 'other multipliers are not capped');
  c.ownedItems.delete('b');
  assert.equal(c.curioMultiplier('damage'), 1.875);
  c.chaosStatus = { damage: 1.6 };
  assert.equal(c.curioMultiplier('damage'), 2.5, 'the chaos status counts toward the cap');
});

test('a saved Guardian Heart pickup becomes a Lifestone, and merged items map to the new id', () => {
  const c = vm.createContext({ shopItemCatalog: [{ id: 'lifestone', name: 'Lifestone', kind: 'boss-relic' }] });
  loadBetween(c, 'dbmanager.js', 'const retiredItemIds =', 'function restoreRoomRuntime');
  const migrated = c.migrateSavedPickup({ kind: 'upgrade', x: 5, item: { id: 'guardian-heart' } });
  assert.equal(migrated.item.id, 'lifestone');
  assert.equal(migrated.x, 5);
  const other = { kind: 'upgrade', item: { id: 'pearl' } };
  assert.equal(c.migrateSavedPickup(other), other);
  for (const id of ['storm-spool', 'ember-seed', 'nova-pearl']) {
    assert.equal(peek(c, `retiredItemIds['${id}']`), 'wild-magic-core');
  }
});
