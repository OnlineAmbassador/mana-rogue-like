const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceText } = require('./helpers/load');

const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function combat(className = 'Mage', style = 'magic') {
  const c = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    mode: 'playing', ownedItems: new Set(), shopItemCatalog: [], attackMorphs: {},
    player: { x: 300, y: 300, lookX: 1, lookY: 0, damage: 1, fireCooldown: 0, meleeSwings: [] },
    weapon: { fireDelay: 2 / 3, shotDamageMultiplier: (2 / 3) / 0.23, damageBonus: 0,
      projectileSpeed: 480, shotCount: 1, tearSize: 1, rangeMultiplier: 1, rangeLevel: 0 },
    fireModes: { bow: 'rapid', magic: 'rapid' }, activeCombatStyle: style,
    magicElements: new Set(['bubble']), activeMagicElement: 'bubble',
    pointer: { down: false }, touchInput: {}, projectiles: [], enemies: [], breakables: [],
    meleeWeapons: new Set(['hands']), combatPalette: { melee: '#fff' },
    elapsed: 0, MAX_PLAYER_PROJECTILES: 100, MAX_PLAYER_VOLLEY: 16,
    FIRE_RATE_SCALE: 0.82, BOW_TAP_WINDOW: 0.15, MAX_CHARGE_SHOTS: 8,
    MELEE_BASE_SCALE: 2.6, ROOM_W: 1000, ROOM_H: 800, ROOM_WALL_THICKNESS: 64, companions: [],
    clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
    distanceBetween: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    save: { highestFloorCleared: 0, unlockedCharacters: [], discoveredItemIds: [], loreRelics: [] },
    characterChapters: {},
  });
  const game = source('game.js');
  vm.runInContext(sliceText(game, 'const magicElementPalette =', 'let hitStopTimer =', 'game'), c);
  vm.runInContext(sliceText(game, 'const characterRoster =', 'const rosterPageSize =', 'game'), c);
  vm.runInContext(sliceText(game, 'const classProfiles =', '// Every weapon style', 'game'), c);
  for (const file of ['playermanager.js', 'mobmanager.js', 'dbmanager.js']) vm.runInContext(source(file), c);
  vm.runInContext(`
    character = characterRoster.find(entry => entry.className === '${className}');
    currentAttackStyle = () => activeCombatStyle;
    currentAimAngle = () => 0;
    addParticles = playSound = updateHud = queueChapter = persistSave = saveRunState = showMessage = () => {};
    meleeChargeTime = () => 0.9;
    performMeleeSwing = (angle, scale) => {
      meleeResult = { damage: Math.round(player.damage * scale * characterProfile().melee) };
    };
  `, c);
  return c;
}

test('only one character unlock is granted per descent; later floor milestones wait for the next run', () => {
  const c = combat();
  assert.equal(vm.runInContext('characterRoster.slice(0, 3).map(e => e.className).join(",")', c), 'Mage,Rogue,Warrior');
  const unlocked = (id) => vm.runInContext(`isCharacterUnlocked(characterRoster.find(e => e.id === '${id}'))`, c);
  assert.equal(unlocked('wanderer'), true);
  assert.equal(unlocked('warden'), false);
  assert.equal(unlocked('arcanist'), false);
  c.recordFloorClear(1);
  assert.equal(unlocked('warden'), true);
  assert.equal(unlocked('arcanist'), false);
  c.recordFloorClear(2);
  assert.equal(unlocked('arcanist'), false);
  assert.equal(c.player.characterUnlocksThisRun, 1);
  c.player.characterUnlocksThisRun = 0;
  c.recordFloorClear(2);
  assert.equal(unlocked('arcanist'), true);
  c.recordFloorClear(1);
  assert.equal(c.save.highestFloorCleared, 2);
});

test('Sporeling requires acquiring spores and legacy class unlocks remain usable', () => {
  const c = combat();
  const unlocked = () => vm.runInContext('isCharacterUnlocked(characterRoster.find(e => e.className === "Sporeling"))', c);
  assert.equal(unlocked(), false);
  c.save.discoveredItemIds.push('spore-bloom');
  assert.equal(unlocked(), true);
  c.save.arcanist = true;
  assert.equal(vm.runInContext('isCharacterUnlocked(characterRoster.find(e => e.className === "Warrior"))', c), true);
});

test('all nine persistent Mana echoes unlock the special delver outside the per-run unlock queue', () => {
  const c = combat();
  const entry = vm.runInContext('characterRoster.find((candidate) => candidate.id === "echo-bound-delver")', c);
  assert.equal(c.isCharacterUnlocked(entry), false);
  const relicIds = vm.runInContext('manaLoreRelics.map((relic) => relic.id)', c);
  for (const id of relicIds.slice(0, -1)) assert.equal(c.recordLoreRelic(id), true);
  assert.equal(c.isCharacterUnlocked(entry), false);
  assert.equal(c.recordLoreRelic(relicIds[relicIds.length - 1]), true);
  assert.equal(c.isCharacterUnlocked(entry), true);
  assert.equal(c.player.characterUnlocksThisRun || 0, 0);
});

test('Rogue bow fires faster with weaker, smaller arrows than Mage bow', () => {
  const rogue = combat('Rogue', 'bow');
  const mage = combat('Mage', 'bow');
  rogue.shoot({ quick: true });
  mage.shoot({ quick: true });
  assert.ok(rogue.player.fireCooldown <= mage.player.fireCooldown * 0.55);
  assert.ok(rogue.projectiles[0].damage < mage.projectiles[0].damage);
  assert.ok(rogue.projectiles[0].size < mage.projectiles[0].size);
});

test('switching Rogue to magic or melee does not retain rapid bow cadence', () => {
  const c = combat('Rogue', 'bow');
  c.shoot({ quick: true });
  const bowDelay = c.player.fireCooldown;
  c.player.fireCooldown = 0;
  c.activeCombatStyle = 'magic';
  c.shoot();
  assert.ok(c.player.fireCooldown > bowDelay * 1.8);
  c.player.fireCooldown = 0;
  c.performMeleeAttack(false);
  assert.ok(c.player.fireCooldown > bowDelay * 1.8);
});

test('Warrior melee hits harder and recovers slower than Mage and Rogue melee', () => {
  const warrior = combat('Warrior', 'melee');
  warrior.performMeleeAttack(false);
  for (const cls of ['Mage', 'Rogue']) {
    const c = combat(cls, 'melee');
    c.performMeleeAttack(false);
    assert.ok(warrior.meleeResult.damage > c.meleeResult.damage);
    assert.ok(warrior.player.fireCooldown > c.player.fireCooldown);
  }
});

test('Spore Bloom changes only magic shots and bursts eight non-recursive elemental shards', () => {
  const c = combat();
  c.ownedItems.add('spore-bloom');
  c.shoot();
  const parent = c.projectiles[0];
  assert.equal(parent.magicCluster, true);
  const target = { hp: 10 };
  const obstacle = { radius: 25 };
  c.triggerMagicCluster(parent, target, obstacle);
  assert.equal(c.projectiles.length, 9);
  for (const shard of c.projectiles.slice(1)) {
    assert.equal(shard.type, 'elemental');
    assert.equal(shard.element, 'bubble');
    assert.equal(shard.slowOnHit, 0.75);
    assert.equal(shard.magicCluster, undefined);
    assert.equal(shard.hitEnemies[0], target);
    assert.equal(shard.ignoreObstacle, obstacle);
    c.triggerMagicCluster(shard);
  }
  c.triggerMagicCluster(parent);
  assert.equal(c.projectiles.length, 9);
  c.player.fireCooldown = 0;
  c.activeCombatStyle = 'bow';
  c.shoot({ quick: true });
  assert.equal(c.projectiles[9].magicCluster, false);
});

test('ordinary magic remains unchanged without spores', () => {
  const c = combat();
  c.shoot();
  c.triggerMagicCluster(c.projectiles[0]);
  assert.equal(c.projectiles.length, 1);
});

test('a charged magic release deals substantially more damage than a normal shot', () => {
  const normal = combat('Mage', 'magic');
  const charged = combat('Mage', 'magic');
  normal.shoot();
  charged.shoot({ magicCharge: 1 });
  assert.ok(charged.projectiles[0].damage >= normal.projectiles[0].damage * 2.5);
});

test('real projectile loops split magic on enemy and object impacts, but not ordinary expiry', () => {
  for (const surface of ['enemy', 'object', 'expiry', 'wall']) {
    const c = combat();
    c.ownedItems.add('spore-bloom');
    c.shoot();
    const parent = c.projectiles[0];
    Object.assign(c, {
      dt: 0, enemyProjectiles: [], particles: [], quality: { low: false },
      MAX_PARTICLES: 400, MAX_PARTICLES_LOW: 120,
    });
    vm.runInContext(`
      damageEnemy = (enemy, damage) => { enemy.hp -= damage; };
      resolveElementalImpact = (projectile, enemy) => { enemy.hp -= projectile.damage; };
      applyMorphLanding = damageObstacle = triggerHitStop = () => {};
      strikeBombWithProjectile = () => false;
    `, c);
    if (surface === 'enemy') c.enemies.push({ x: parent.x, y: parent.y, radius: 16, hp: 20 });
    if (surface === 'object') c.breakables.push({ x: parent.x, y: parent.y, radius: 20 });
    if (surface === 'expiry') parent.ttl = 0;
    if (surface === 'wall') parent.x = -1;
    const game = source('game.js');
    const loop = sliceText(game, '  for (let i = projectiles.length - 1;', '  for (let i = enemyProjectiles.length - 1;', 'game');
    vm.runInContext(loop, c);
    assert.equal(c.projectiles.includes(parent), false);
    assert.equal(c.projectiles.length, surface === 'expiry' ? 0 : 8, surface);
    if (surface === 'object') {
      vm.runInContext(loop, c);
      assert.equal(c.projectiles.length, 8, 'shards escape the triggering object');
    }
    if (surface === 'enemy') {
      assert.equal(c.enemies[0].hp, 20 - parent.damage);
      vm.runInContext(loop, c);
      assert.equal(c.enemies[0].hp, 20 - parent.damage, 'no instant eight-shard hit on original target');
    }
  }
});
