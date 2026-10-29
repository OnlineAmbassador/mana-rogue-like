const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function combat() {
  const c = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => 0.05 }),
    mode: 'playing', currentFloor: 1, elapsed: 10, performance,
    save: { unlockedCharacters: [], playtimeSeconds: 0 },
    player: { x: 300, y: 300, lookX: 1, lookY: 0, radius: 12, damage: 1, luck: 0 },
    weapon: { damageBonus: 0, shotDamageMultiplier: (2 / 3) / 0.23,
      fireDelay: 2 / 3, shotCount: 1, rangeLevel: 0 },
    character: { className: 'Mage', raceHead: 'humanMale', startingStyle: 'magic', fireDelay: 0.23 },
    meleeWeapons: new Set(['hands']), combatStyles: new Set(['magic', 'bow', 'melee']),
    ownedItems: new Set(), shopItemCatalog: [
      { id: 'mana-tonic', name: 'Mana Tonic', kind: 'consumable' },
      { id: 'bomb-bundle', name: 'Bomb Bundle', kind: 'consumable' },
    ],
    enemies: [], enemyProjectiles: [], projectiles: [], bombs: [], breakables: [], pickups: [],
    consumables: [], bossStrikes: [], groundHazards: [], laserBeams: [], sporePods: [], playerStillTimer: 0,
    playerVelocity: { x: 0, y: 0 }, hitStopTimer: 0,
    ROOM_W: 960, ROOM_H: 540, ROOM_WALL_THICKNESS: 24,
    FIRE_RATE_SCALE: 0.82, MELEE_BASE_SCALE: 2.6,
    MAX_PLAYER_PROJECTILES: 100, currentRoom: {},
    magicElements: new Set(['bubble']), activeMagicElement: 'bubble',
    fireModes: { melee: 'rapid', bow: 'rapid', magic: 'rapid' }, activeCombatStyle: 'magic',
    runOfferedAbilityIds: new Set(),
    pointer: { down: false }, touchInput: {}, attackMorphs: {}, companions: [],
    MAX_PLAYER_VOLLEY: 16, MAX_CHARGE_SHOTS: 8, BOW_TAP_WINDOW: 0.15, BOW_CHARGE_TIME: 1,
    combatPalette: { melee: '#fff' },
    calmBossStates: new Set(['jacko-idle']), calmMobBehaviors: new Set(['hover', 'crawl', 'patrol']),
    clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
    distanceBetween: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    hasLineOfSight: () => true,
    damageCalls: [], moves: [], bossExtraMoves: {},
  });
  const game = source('game.js');
  const phaseStart = game.indexOf('const bossPhaseAttackSets =');
  vm.runInContext(game.slice(phaseStart, game.indexOf('let ROOM_W =', phaseStart)), c);
  const enemyUnlockStart = game.indexOf('const enemyUnlockAtSeconds =');
  vm.runInContext(game.slice(enemyUnlockStart, game.indexOf('let enemyLinkSequence =', enemyUnlockStart)), c);
  vm.runInContext(game.slice(game.indexOf('const magicElementPalette ='), game.indexOf('let hitStopTimer =')), c);
  vm.runInContext(game.slice(game.indexOf('const classProfiles ='), game.indexOf('// Every weapon style')), c);
  for (const file of ['playermanager.js', 'mobmanager.js', 'worldmanager.js']) vm.runInContext(source(file), c);
  vm.runInContext(`
    recordEnemyDiscovery = recordEnemyAbilityDiscovery = addParticles = playSound = showMessage = updateHud = () => {};
    curioMultiplier = () => 1;
    damagePlayer = (amount) => damageCalls.push(amount);
    moveEnemy = (enemy, vx, vy) => moves.push({vx, vy});
    triggerCameraShake = playEnemyAttackSound = () => {};
    currentAimAngle = () => 0;
    meleeChargeTime = () => 0.9;
  `, c);
  return c;
}

test('ordinary and newly added TMW enemy health increases each floor without tracking damage upgrades', () => {
  const c = combat();
  for (const kind of ['bee', 'ratto', 'slime', 'bandit', 'troll', 'piou', 'maggot', 'tortuga']) {
    let previous = 0;
    for (let floor = 1; floor <= 9; floor += 1) {
      c.currentFloor = floor;
      const enemy = c.createEnemy(kind, 400, 300);
      assert.ok(enemy.hp > previous, `${kind} floor ${floor}`);
      previous = enemy.hp;
    }
  }
});

test('new TMW creatures join the run pools progressively with accumulated playtime', () => {
  const c = combat();
  const isAvailable = (seconds, kind) => vm.runInContext(
    `Object.entries(enemyUnlockAtSeconds).some(([id, unlock]) => id === '${kind}' && ${seconds} >= unlock)`, c,
  );
  assert.equal(isAvailable(2099, 'piou'), false);
  assert.equal(isAvailable(2100, 'piou'), true);
  assert.equal(isAvailable(2279, 'maggot'), false);
  assert.equal(isAvailable(2280, 'maggot'), true);
  assert.equal(isAvailable(2459, 'tortuga'), false);
  assert.equal(isAvailable(2460, 'tortuga'), true);
});

test('rebalanced boss health targets at least 56 seconds of estimated sustained damage across builds', () => {
  const c = combat();
  for (const cls of ['Mage', 'Rogue', 'Warrior', 'Scholar']) {
    c.character = { className: cls, startingStyle: cls === 'Warrior' ? 'melee' : 'magic', fireDelay: 0.28 };
    if (cls === 'Warrior') c.meleeWeapons.add('sword');
    for (const floor of [1, 4, 9]) {
      c.currentFloor = floor;
      for (const shotCount of [1, 3]) {
        c.weapon.shotCount = shotCount;
        const boss = c.createEnemy('golem', 400, 300, true);
        assert.ok(boss.hp / c.estimatedPlayerDps() >= 56 + (floor - 1) * 3);
      }
    }
  }
});

test('a charge-mode unlock applies to every selectable weapon style', () => {
  const c = combat();
  c.Math.random = () => 0.01;
  assert.equal(c.applyRandomFireMode({ style: 'melee', kind: 'skill' }), 'charge');
  assert.deepEqual({ ...c.fireModes }, { melee: 'charge', bow: 'charge', magic: 'charge' });
});

test('charge mode is a one-time five-percent discovery and is never rerolled after discovery', () => {
  const c = combat();
  const rolls = [0.05, 0.8, 0.01];
  c.Math.random = () => rolls.shift() ?? 0.8;
  assert.equal(c.applyRandomFireMode({ style: 'melee', kind: 'skill' }), 'rapid');
  assert.deepEqual({ ...c.fireModes }, { melee: 'rapid', bow: 'rapid', magic: 'rapid' });
  assert.equal(c.applyRandomFireMode({ style: 'bow', kind: 'weapon' }), 'charge');
  assert.deepEqual({ ...c.fireModes }, { melee: 'charge', bow: 'charge', magic: 'charge' });
  c.Math.random = () => 0;
  assert.equal(c.applyRandomFireMode({ style: 'magic', kind: 'mod' }), 'rapid');
});

test('experienced players can encounter promoted AI on the first floor without raising enemy count', () => {
  const c = combat();
  const makeEnemy = () => ({ kind: 'scorpion', hp: 8, maxHp: 8, speed: 40, radius: 16 });
  c.currentFloor = 1;
  c.Math.random = () => 0.5;
  const newPlayerEnemy = c.applyBossAIPromotion(makeEnemy());
  assert.equal(newPlayerEnemy.bossAI, undefined);
  assert.equal(c.enemies.length, 1);
  c.enemies.length = 0;
  c.save.playtimeSeconds = 8 * 1800;
  c.Math.random = () => 0.01;
  const experiencedEnemy = c.applyBossAIPromotion(makeEnemy());
  assert.equal(experiencedEnemy.bossAI, true);
  assert.equal(c.enemies.length, 1);
  c.enemies.length = 0;
  c.save.playtimeSeconds = 0;
  c.save.unlockedCharacters = ['a', 'b', 'c'];
  c.Math.random = () => 0.01;
  assert.equal(c.applyBossAIPromotion(makeEnemy()).bossAI, true);
  assert.equal(c.enemies.length, 1);
});

test('charged bow creates a sustained piercing beam that stops at solid room obstacles', () => {
  const c = combat();
  c.activeCombatStyle = 'bow';
  c.fireModes.bow = 'charge';
  c.weapon.projectileSpeed = 420;
  c.weapon.rangeMultiplier = 1;
  c.weapon.tearSize = 1;
  c.shoot({ charge: 1 });
  assert.equal(c.projectiles[0].type, 'charge-beam');
  assert.ok(c.projectiles[0].beamWidth >= 14);
  assert.ok(c.projectiles[0].beamRange >= 1160);
  c.projectiles.length = 0;
  c.enemies.push({ x: 470, y: 300, radius: 14, hp: 20 });
  c.breakables.push({ x: 400, y: 300, radius: 16, type: 'solid', broken: false });
  c.addParticles = () => {};
  c.damageEnemy = (enemy, damage) => { enemy.hp -= damage; };
  c.damageObstacle = () => {};
  const beam = {
    ttl: 1, originX: 318, originY: 300, vx: 1, vy: 0,
    beamRange: 800, beamWidth: 12, beamHitTimers: new Map(), damage: 30, color: '#fff',
  };
  assert.equal(c.updateChargeBeamProjectile(beam, 0.016), false);
  assert.ok(beam.beamEndX < 400);
  assert.equal(c.enemies[0].hp, 20);
});

test('major guardians have three distinct attack sets and heal the player at each phase change', () => {
  const c = combat();
  const phaseSets = vm.runInContext('bossPhaseAttackSets', c);
  for (const kind of Object.keys(phaseSets)) {
    const sets = phaseSets[kind];
    assert.equal(sets.length, 3, `${kind} phase count`);
    assert.notDeepEqual(sets[0], sets[1], `${kind} phase II differs`);
    assert.notDeepEqual(sets[1], sets[2], `${kind} phase III differs`);
    assert.ok(sets.every((set) => set.length >= 2), `${kind} has varied attacks per phase`);
  }
  Object.assign(c.player, { hp: 1, maxHp: 14, radius: 12, lookX: 1, lookY: 0 });
  const boss = c.createEnemy('golem', 500, 300, true);
  boss.hp = boss.maxHp * 0.66;
  c.damageEnemy(boss, 1, 300, 300, false, false);
  assert.equal(boss.phase, 2);
  assert.equal(c.player.hp, 3);
  c.player.hp = 2;
  boss.hp = boss.maxHp / 3;
  c.damageEnemy(boss, 1, 300, 300, false, false);
  assert.equal(boss.phase, 3);
  assert.equal(c.player.hp, 4);
});

test('charged magic cannot bypass the weapon recovery cooldown', () => {
  const c = combat();
  c.activeCombatStyle = 'magic';
  c.player.fireCooldown = 0.5;
  c.fireModes.magic = 'charge';
  c.shoot({ magicCharge: 1 });
  assert.equal(c.projectiles.length, 0);
  assert.equal(c.player.fireCooldown, 0.5);
});

test('a fully charged magic shot is large, explosive, and more damaging', () => {
  const c = combat();
  c.weapon.projectileSpeed = 420;
  c.weapon.rangeMultiplier = 1;
  c.weapon.tearSize = 1;
  c.shoot({ magicCharge: 1 });
  const shot = c.projectiles[0];
  assert.ok(shot.damage > 10);
  assert.ok(shot.radius >= c.player.radius * 0.6);
  assert.equal(shot.explode, 54);
});

test('the Guardian Heart is a boss-room-only collectible that improves maximum and current health', () => {
  const c = combat();
  c.BASE_HEARTS = 4;
  c.MAX_EXTRA_HEARTS = 9;
  c.shopItemIconImages = {};
  c.shopItemCatalog = [{ id: 'guardian-heart', name: 'Guardian Heart', kind: 'boss-relic' }];
  c.spawnCoin = () => false;
  c.dropLoot(400, 300, true);
  assert.equal(c.pickups.filter((pickup) => pickup.item?.id === 'guardian-heart').length, 1);
  c.pickups.length = 0;
  c.dropLoot(400, 300, false);
  assert.equal(c.pickups.some((pickup) => pickup.item?.id === 'guardian-heart'), false);
  Object.assign(c.player, { maxHp: 8, hp: 2 });
  c.recordItemDiscovery = c.updateHud = c.showMessage = c.showPickupBanner = c.popOverPlayer = () => {};
  assert.equal(c.grantUpgrade({ id: 'guardian-heart', name: 'Guardian Heart', kind: 'boss-relic' }), true);
  assert.equal(c.player.maxHp, 10);
  assert.equal(c.player.hp, 4);
  assert.equal(c.ownedItems.has('guardian-heart'), true);
  assert.equal(c.isUpgradeAvailable({ id: 'guardian-heart', kind: 'boss-relic' }), false);
});

test('baseline real sword, arrow, and magic attacks need over 40 seconds of uninterrupted hits', () => {
  for (const cls of ['Mage', 'Rogue', 'Warrior']) {
    const c = combat();
    c.character = { className: cls, startingStyle: cls === 'Warrior' ? 'melee' : cls === 'Rogue' ? 'bow' : 'magic',
      fireDelay: cls === 'Warrior' ? 0.28 : 0.23 };
    Object.assign(c.player, { meleeSwings: [], swordParryTimer: 0, fireCooldown: 0 });
    Object.assign(c.weapon, { tearSize: 1, rangeMultiplier: 1, projectileSpeed: 480 });
    if (cls === 'Warrior') c.meleeWeapons.add('sword');
    const boss = c.createEnemy('golem', 500, 300, true);
    c.performMeleeAttack(false);
    const swordDps = c.player.meleeSwings[0].damage / c.player.fireCooldown;
    assert.ok(boss.hp / swordDps > 40, `${cls} sword`);
    for (const style of ['bow', 'magic']) {
      c.activeCombatStyle = style;
      c.player.fireCooldown = 0;
      c.projectiles.length = 0;
      c.shoot(style === 'bow' ? { quick: true } : null);
      const dps = c.projectiles.reduce((total, shot) => total + shot.damage, 0) / c.player.fireCooldown;
      assert.ok(boss.hp / dps > 40, `${cls} ${style}`);
    }
  }
});

test('even bypass-cap damage and simultaneous volleys cannot one-shot a fresh enemy', () => {
  const c = combat();
  for (const boss of [false, true]) {
    const enemy = c.createEnemy(boss ? 'golem' : 'bee', 400, 300, boss);
    c.enemies.push(enemy);
    for (let hit = 0; hit < 8; hit += 1) c.damageEnemy(enemy, 999999, 300, 300, true, false);
    assert.equal(enemy.hp, 1);
    assert.equal(enemy.firstHitTimer, 0.12);
  }
});

test('opening-volley protection expires in gameplay time instead of becoming permanent armor', () => {
  const c = combat();
  const enemy = c.createEnemy('bee', 400, 300);
  c.enemies.push(enemy);
  c.damageEnemy(enemy, 1, 300, 300, false, false);
  assert.equal(enemy.hp, 4);
  vm.runInContext('updateEnemyBehavior = () => {};', c);
  c.updateEnemy(enemy, 0.13);
  assert.equal(enemy.firstHitTimer, 0);
  c.damageEnemy(enemy, 2, 300, 300, false, false);
  assert.equal(enemy.hp, 2);
});

test('bombs can be shot by either side, retain their fuse, and reject airborne bombs', () => {
  const c = combat();
  const bomb = { x: 350, y: 300, fuse: 1.2 };
  c.bombs.push(bomb);
  assert.equal(c.strikeBombWithProjectile({ x: 400, y: 300, vx: 1000, vy: 0, radius: 4 }, 0.1), true);
  assert.ok(bomb.vx > 0);
  assert.equal(bomb.fuse, 1.2);
  assert.equal(c.strikeBombWithProjectile({ x: 350, y: 300, vx: -1000, vy: 0, radius: 4, owner: 'enemy' }), true);
  bomb.flightTimer = 0.3;
  assert.equal(c.strikeBombWithProjectile({ x: 350, y: 300, vx: 500, vy: 0, radius: 4 }), false);
});

test('sliding bombs bounce off walls and obstacles without tunneling, then lose speed', () => {
  const c = combat();
  const bomb = { x: 910, y: 300, vx: 500, vy: 0 };
  c.updateBombMotion(bomb, 0.1);
  assert.ok(bomb.vx < 0);
  assert.ok(bomb.x <= 924 && bomb.x >= 36);
  c.breakables.push({ x: 400, y: 300, radius: 20 });
  Object.assign(bomb, { x: 350, y: 300, vx: 500, vy: 0 });
  c.updateBombMotion(bomb, 0.15);
  assert.ok(bomb.vx < 0);
  assert.ok(bomb.x <= 368);
  c.breakables.length = 0;
  const speed = Math.abs(bomb.vx);
  c.updateBombMotion(bomb, 0.1);
  assert.ok(Math.abs(bomb.vx) < speed);
});

test('breakables drop storable consumables without overriding guaranteed treasure', () => {
  const c = combat();
  const obstacle = { x: 350, y: 300, hp: 1, maxHp: 1, type: 'breakable', room: {}, broken: false };
  c.breakables.push(obstacle);
  c.damageObstacle(obstacle, 1);
  assert.equal(c.pickups.length, 1);
  assert.equal(c.pickups[0].kind, 'consumable');
  c.collectConsumable(c.pickups[0].item);
  c.collectConsumable(c.pickups[0].item);
  assert.equal(c.consumables[0].count, 2);
  c.damageObstacle(obstacle, 1);
  assert.equal(c.pickups.length, 1);
  assert.equal(c.dropBreakableConsumable({ ...obstacle, guaranteedDrop: true }), false);
  assert.equal(c.dropBreakableConsumable({ ...obstacle, bossSpawned: true }), false);
});

test('reward rooms only spawn relics that do not require bombs to break', () => {
  const c = combat();
  const bombOnly = { type: 'bomb-only', radius: 18 };
  const breakable = { type: 'regenerating', radius: 15 };
  c.regionObstacleSprites = () => [bombOnly, breakable];
  c.currentFloor = 1;
  c.ROOM_W = 960;
  c.ROOM_H = 540;
  c.findEnemySpawnPosition = (x, y) => ({ x, y });
  c.createBreakableAt = (x, y, sprite) => ({ x, y, radius: sprite.radius, type: sprite.type });
  c.breakables = [];
  c.spawnRewardRelics({ rewardRoom: true, treasureClaimed: false, type: 'normal' }, 2);
  assert.equal(c.breakables.length, 2);
  assert.ok(c.breakables.every((relic) => relic.type !== 'bomb-only'));
  assert.equal(c.breakables.filter((relic) => relic.guaranteedDrop).length, 1);
});

test('boss-summoned enemies cannot randomly drop healing hearts', () => {
  const c = combat();
  c.pickups = [];
  c.spawnCoin = () => {};
  c.dropLoot(300, 300, false, true);
  assert.ok(c.pickups.every((pickup) => pickup.kind !== 'heart'));
});

test('heavy boss ground markers remain fixed, warn at least a second, and hit for two hearts', () => {
  const c = combat();
  const boss = { x: 350, y: 300, boss: true, radius: 40, behavior: 'jacko-idle',
    pressureCooldown: 10, smackCooldown: 0, speed: 150 };
  c.enemies.push(boss);
  c.applyBossPressure(boss, 0.016, -1, 0, 50);
  assert.equal(c.bossStrikes.length, 1);
  const strike = c.bossStrikes[0];
  assert.ok(strike.duration >= 1);
  assert.equal(strike.damage, 2);
  boss.x = 600;
  c.updateBossStrikes(0.5);
  assert.equal(strike.x, 350);
  assert.equal(c.damageCalls.length, 0);
  c.updateBossStrikes(0.7);
  assert.equal(c.damageCalls[0], 2);
});

test('boss windups have a minimum readable duration and do not spawn competing pressure', () => {
  const c = combat();
  vm.runInContext('updateEnemyBehavior = (enemy) => { enemy.behavior = "golem-slam-windup"; enemy.stateTimer = 0.2; };', c);
  const boss = { boss: true, behavior: 'jacko-idle' };
  c.updateEnemy(boss, 0.016);
  assert.equal(boss.stateTimer, 0.95);
  c.applyBossPressure(boss, 0.016, 1, 0, 50);
  assert.equal(c.bossStrikes.length, 0);
});

function telegraphRenderer(c) {
  const arcs = [];
  c.ctx = {
    save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {},
    fillRect() {}, fillText() {},
    arc(x, y, radius) {
      assert.ok(Number.isFinite(radius) && radius >= 0, `invalid arc radius: ${radius}`);
      arcs.push({ x, y, radius });
    },
  };
  c.monsterSprites = {
    golem: { image: { complete: false } },
    jacko: { image: { complete: false } },
  };
  vm.runInContext(source('gameui.js'), c);
  return (enemy, target) => {
    arcs.length = 0;
    c.drawEnemyBody(enemy);
    return arcs.find((arc) => arc.x === target.x && arc.y === target.y).radius;
  };
}

test('golem slam telegraphs render throughout both phases and complete on schedule', () => {
  for (const phase of [1, 2]) {
    for (const miniBoss of [false, true]) {
      const c = combat();
      const render = telegraphRenderer(c);
      vm.runInContext('fireEnemyProjectile = fireJackoBurst = () => {};', c);
      const enemy = c.createEnemy('golem', 400, 300, true);
      Object.assign(enemy, { phase, boss: !miniBoss, miniBoss, attackCooldown: 0 });
      enemy.golemAttackIndex = phase === 2 ? 1 : 0;
      c.enemies.push(enemy);
      c.updateEnemy(enemy, 0.016);
      assert.equal(enemy.behavior, 'golem-slam-windup');
      const duration = Math.max(phase === 2 ? 0.64 : 0.92, miniBoss ? 0.7 : 0.95);
      assert.equal(enemy.stateTimer, duration);
      const maximumRadius = phase === 2 ? 112 : 74;
      assert.equal(render(enemy, enemy.slamTarget), maximumRadius * (1 - duration * 0.12));
      for (let frame = 0; frame < Math.ceil(duration / 0.05); frame += 1) {
        c.updateEnemy(enemy, 0.05);
        if (enemy.behavior === 'golem-slam-windup') {
          const radius = render(enemy, enemy.slamTarget);
          assert.ok(radius >= 0 && radius <= maximumRadius);
        }
      }
      assert.equal(enemy.behavior, 'golem-recover');
    }
  }
});

test('Jacko ground-pound telegraphs accept the actual boss and miniboss windup timers', () => {
  for (const miniBoss of [false, true]) {
    const c = combat();
    const render = telegraphRenderer(c);
    const enemy = c.createEnemy('jacko', 400, 300, true);
    Object.assign(enemy, { phase: 2, boss: !miniBoss, miniBoss, attackCooldown: 0, attackIndex: 3 });
    c.enemies.push(enemy);
    c.updateEnemy(enemy, 0.016);
    assert.equal(enemy.behavior, 'jacko-ground-pound-windup');
    assert.equal(enemy.stateTimer, miniBoss ? 0.7 : 0.95);
    assert.equal(render(enemy, enemy.groundPoundTarget), 38);
    for (const timer of [0.35, 0.175, 0]) {
      enemy.stateTimer = timer;
      assert.equal(render(enemy, enemy.groundPoundTarget), 38 + (1 - timer / 0.35) * 34);
    }
  }
});

test('slam telegraph radii stay bounded for oversized and expired state timers', () => {
  const c = combat();
  const render = telegraphRenderer(c);
  for (const kind of ['golem', 'jacko']) {
    const enemy = c.createEnemy(kind, 400, 300, true);
    const target = { x: 300, y: 300 };
    Object.assign(enemy, {
      behavior: kind === 'golem' ? 'golem-slam-windup' : 'jacko-ground-pound-windup',
      slamTarget: target, groundPoundTarget: target,
    });
    for (const phase of [1, 2]) {
      enemy.phase = phase;
      const minimum = kind === 'golem' ? 0 : 38;
      const maximum = kind === 'golem' ? phase === 2 ? 112 : 74 : 72;
      for (const timer of [100, 10, 1 / 0.12, 0.95, 0, -0.1, -100]) {
        enemy.stateTimer = timer;
        const radius = render(enemy, target);
        assert.ok(radius >= minimum && radius <= maximum);
      }
    }
  }
});

test('later-floor evasive mobs dodge but early mobs and slow chargers stay committed', () => {
  for (const [floor, archetype, expected] of [[1, 'ranged', false], [4, 'ranged', true], [4, 'charger', false]]) {
    const c = combat();
    c.currentFloor = floor;
    c.projectiles.push({ x: 200, y: 300, vx: 500, vy: 0, radius: 4 });
    const enemy = { x: 300, y: 300, radius: 12, speed: 50, hp: 10, maxHp: 10,
      behavior: 'hover', archetype, attackCooldown: 1, dodgeCooldown: 0, tacticTimer: 1 };
    c.enemies.push(enemy);
    assert.equal(c.applyMobTactics(enemy, 0.016, 1, 0, 200), expected);
  }
});

test('more unlocked delvers gradually increase later-floor boss-style enemy promotions', () => {
  const c = combat();
  c.currentFloor = 3;
  c.save = { unlockedCharacters: [] };
  c.Math.random = () => 0.105;
  const unpromoted = c.applyBossAIPromotion(c.createEnemy('bandit', 400, 300));
  assert.equal(unpromoted.bossAI, undefined);
  c.enemies.length = 0;
  c.save.unlockedCharacters = ['warden', 'arcanist'];
  const promoted = c.applyBossAIPromotion(c.createEnemy('bandit', 400, 300));
  assert.equal(promoted.bossAI, true);
});

test('real player and enemy projectile loops push bombs and remove the impacting shots', () => {
  const c = combat();
  Object.assign(c, { dt: 0, particles: [], quality: { low: false }, MAX_PARTICLES: 400, MAX_PARTICLES_LOW: 120 });
  c.bombs.push({ x: 350, y: 300, fuse: 1 });
  c.projectiles.push({ x: 350, y: 300, vx: 500, vy: 0, radius: 4, ttl: 1, trailTimer: 1 });
  c.enemyProjectiles.push({ x: 350, y: 300, vx: 0, vy: 500, radius: 4, ttl: 1 });
  const game = source('game.js');
  const loops = game.slice(game.indexOf('  for (let i = projectiles.length - 1;'),
    game.indexOf('  updateParticles(dt);'));
  vm.runInContext(loops, c);
  assert.equal(c.projectiles.length, 0);
  assert.equal(c.enemyProjectiles.length, 0);
  assert.ok(c.bombs[0].vx > 0 && c.bombs[0].vy > 0);
  assert.equal(c.bombs[0].fuse, 1);
});

test('particle updates compact expired effects in one pass and preserve live particles', () => {
  const c = vm.createContext({ particles: [
    { x: 0, y: 0, vx: 10, vy: 0, ttl: 0.01 },
    { x: 10, y: 10, vx: 0, vy: 10, ttl: 1, streak: true },
    { x: 20, y: 20, vx: -10, vy: 0, ttl: 0.01 },
  ] });
  const game = source('game.js');
  const start = game.indexOf('function updateParticles(dt)');
  const end = game.indexOf('function update(dt)', start);
  vm.runInContext(game.slice(start, end), c);
  vm.runInContext('updateParticles(0.02)', c);
  assert.equal(c.particles.length, 1);
  assert.equal(c.particles[0].x, 10);
  assert.ok(c.particles[0].y > 10);
  assert.ok(c.particles[0].ttl > 0);
});

test('Sporeling pods also push grounded bombs before bursting', () => {
  const c = combat();
  c.bombs.push({ x: 350, y: 300, fuse: 1 });
  c.sporePods.push({ x: 340, y: 300, vx: 100, vy: 0, radius: 13, ttl: 1, fuse: 1 });
  c.updateClassSignature(0.1);
  assert.equal(c.sporePods.length, 0);
  assert.ok(c.bombs[0].vx > 0);
  assert.equal(c.projectiles.length, 8);
});

test('squads take turns telegraphing and allow staggered overlap only on later floors', () => {
  const c = combat();
  const first = { x: 450, y: 300, hp: 5, behavior: 'hover', attackCooldown: -1 };
  const second = { x: 400, y: 300, hp: 5, behavior: 'hover', attackCooldown: -0.5 };
  c.enemies.push(first, second);
  assert.equal(c.mobAttackBeatAvailable(first), true);
  assert.equal(c.mobAttackBeatAvailable(second), false);
  first.behavior = 'shoot-windup';
  first.attackSpacingTimer = 0.55;
  assert.equal(c.mobAttackBeatAvailable(second), false);
  c.currentFloor = 4;
  assert.equal(c.mobAttackBeatAvailable(second), false);
  first.attackSpacingTimer = 0;
  assert.equal(c.mobAttackBeatAvailable(second), true);
  c.currentFloor = 1;
  assert.equal(c.mobAttackBeatAvailable(second), false);
  first.behavior = 'recover';
  assert.equal(c.mobAttackBeatAvailable(second), true);
});

test('generated floors include three extra dead ends, optional elemental shrines, a bomb cache, and upgrades', () => {
  const c = combat();
  c.Math.random = Math.random;
  c.currentFloor = 1;
  c.activeMagicElement = 'bubble';
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
  let observedShrine = false;
  let observedNoShrine = false;
  vm.runInContext(`
    createShopStock = () => [];
    ownedAbilityCount = reservedAbilityCount = () => 0;
    isUpgradeAvailable = heartVesselAllowed = () => true;
  `, c);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    c.keysHeld = 0;
    c.reservedUpgradeIds.clear();
    const dungeon = c.generateDungeon();
    const optionalRooms = dungeon.rooms.filter((room) => room.optionalBranch);
    const shrines = dungeon.rooms.filter((room) => room.type === 'elemental-shrine');
    const gatedBranches = optionalRooms.filter((room) =>
      ['elemental-shrine', 'shrine'].includes(room.type));
    const bombCaches = dungeon.rooms.filter((room) => room.bombCache);
    const keyCaches = dungeon.rooms.filter((room) => room.keyCache);
    const upgrades = dungeon.rooms.filter((room) => room.rewardUpgrade);
    const trials = dungeon.rooms.filter((room) => room.type === 'trial');

    assert.equal(optionalRooms.length, 3);
    for (const room of optionalRooms) assert.equal(Object.keys(room.links).length, 1);
    assert.equal(gatedBranches.length, 1);
    const gatedRoom = gatedBranches[0];
    assert.equal(Object.keys(gatedRoom.lockedDoors).length, 1);
    const gateDirection = Object.keys(gatedRoom.lockedDoors)[0];
    const gateVector = c.directions.find((direction) => direction.name === gateDirection);
    const gateSource = dungeon.rooms.find((room) =>
      room.x === gatedRoom.x + gateVector.dx && room.y === gatedRoom.y + gateVector.dy);
    assert.equal(gateSource.lockedDoors[c.oppositeDirection[gateDirection]], true);
    assert.ok(shrines.length <= 1);
    if (shrines.length === 1) {
      observedShrine = true;
      assert.equal(vm.runInContext(
        `Object.hasOwn(magicElementPalette, '${shrines[0].shrineElement}')`, c,
      ), true);
      assert.notEqual(shrines[0].shrineElement, c.activeMagicElement);
      assert.equal(shrines[0].rewardUpgrade, null);
      assert.equal(shrines[0].bombCache, false);
      assert.equal(shrines[0].keyCache, false);
    } else {
      observedNoShrine = true;
      assert.ok(optionalRooms.some((room) => room.type === 'shrine' && room.rewardUpgrade));
    }
    assert.equal(bombCaches.length, 1);
    assert.equal(keyCaches.length, 1);
    assert.equal(upgrades.length, shrines.length === 1 ? 1 : 2);
    assert.ok(trials.length === 1 || trials.length === 2);
    if (trials.length === 2) {
      assert.equal(trials[0].trialGroupId, trials[1].trialGroupId);
      assert.equal(trials.map((room) => room.trialStep).sort().join(','), '1,2');
    }
    assert.ok([-1, 1].includes(trials[0].trialBranch));
    assert.equal(trials[0].trialMirrors.length, 3);
    assert.ok(trials[0].trialMirrors.some((orientation, index) => {
      const branch = trials[0].trialBranch;
      const solutions = [branch > 0 ? '\\' : '/', branch > 0 ? '\\' : '/', branch > 0 ? '/' : '\\'];
      return orientation !== solutions[index];
    }));
    assert.ok(c.keysHeld >= 1);
  }
  assert.equal(observedShrine, true);
  assert.equal(observedNoShrine, true);
});

test('room clears grant one of five familiar charge-ups, once per room, capped at eight', () => {
  const c = combat();
  Object.assign(c, {
    orbitGuardChargeUps: 0,
    ORBIT_GUARD_CHARGE_REQUIREMENT: 5,
    ORBIT_GUARD_CHARGE_CAP: 8,
    particles: [],
    bombs: [],
    groundHazards: [],
    bossStrikes: [],
    lightningArcs: [],
    sporePods: [],
    laserBeams: [],
    breakables: [],
    pickups: [],
    companions: [],
    applyRoomSize: () => {},
    updateChaos: () => {},
    restoreRoomRuntime: () => false,
    currentFloorTheme: () => ({ name: 'Test floor' }),
    recordStory: () => {},
    saveRunState: () => {},
    showMessage: () => {},
  });
  const firstRoom = c.createRoom(1, 0, 'trial');
  c.spawnRoom(firstRoom);
  assert.equal(c.orbitGuardChargeUps, 0);
  assert.equal(c.grantOrbitGuardChargeUp(firstRoom), true);
  assert.equal(c.orbitGuardChargeUps, 1);
  assert.equal(c.grantOrbitGuardChargeUp(firstRoom), false);

  for (let index = 0; index < 4; index += 1) {
    c.grantOrbitGuardChargeUp(c.createRoom(index + 2, 0, 'trial'));
  }
  assert.equal(c.orbitGuardChargeUps, 5);
  for (let index = 0; index < 5; index += 1) {
    c.grantOrbitGuardChargeUp(c.createRoom(index + 6, 0, 'normal'));
  }
  assert.equal(c.orbitGuardChargeUps, 8);
});

test('ranged windups snapshot the aim and do not track the player after commitment', () => {
  const c = combat();
  c.currentFloor = 4;
  const enemy = { x: 400, y: 300, hp: 5, kind: 'bandit', arrowShot: true, behavior: 'hover' };
  c.enemies.push(enemy);
  vm.runInContext('updateEnemyBehavior = (enemy) => { enemy.behavior = "shoot-windup"; };', c);
  c.updateEnemy(enemy, 0.016);
  assert.equal(enemy.shotTarget.x, 300);
  c.player.y = 500;
  c.fireEnemyProjectile(enemy);
  assert.ok(c.enemyProjectiles[0].vx < 0);
  assert.ok(Math.abs(c.enemyProjectiles[0].vy) < 1e-10);
});

test('miniboss ground strikes use one readable marker without stacking patterns', () => {
  const c = combat();
  const boss = { x: 700, y: 300, miniBoss: true, radius: 40, behavior: 'jacko-idle',
    pressureCooldown: 0, smackCooldown: 10, speed: 150 };
  c.applyBossPressure(boss, 0.016, -1, 0, 400);
  assert.equal(c.bossStrikes.length, 1);
  for (let i = 1; i < c.bossStrikes.length; i += 1) {
    assert.ok(c.bossStrikes[i].timer - c.bossStrikes[i - 1].timer >= 0.29);
  }
  c.applyBossPressure(boss, 10, -1, 0, 400);
  assert.equal(c.bossStrikes.length, 1);
});

test('Yeti-style wind gusts carry a visible directional warning for the knockback window', () => {
  const c = combat();
  const boss = { x: 100, y: 200, radius: 40 };
  assert.equal(c.performBossMove(boss, 'wind-gust', { x: 300, y: 200 }, false), true);
  assert.equal(boss.gustVisualTimer, 1.1);
  assert.equal(boss.gustVisualAngle, 0);
  assert.equal(c.player.windPush.vx, 300);
  assert.equal(c.player.windPush.timer, 0.9);
});

// Top-level let/const in the manager scripts are not context properties, so read and write them through the VM.
const peek = (c, expression) => vm.runInContext(expression, c);
const setDominant = (c, style) => vm.runInContext(`dominantAIStyle = ${JSON.stringify(style)};`, c);

test('mob AI follows the style the player relies on, with hysteresis against quick swaps', () => {
  const c = combat();
  c.activeCombatStyle = 'magic';
  c.resetStyleHeat();
  assert.equal(peek(c, 'dominantAIStyle'), 'magic');
  c.recordStyleUse('melee', 0.8);
  assert.equal(peek(c, 'dominantAIStyle'), 'magic');
  for (let i = 0; i < 12; i += 1) c.recordStyleUse('melee', 0.8);
  assert.equal(peek(c, 'dominantAIStyle'), 'melee');
  c.recordStyleUse('bow', 0.3);
  assert.equal(peek(c, 'dominantAIStyle'), 'melee');
});

test('style heat decays and mobs return to neutral when the player stops attacking', () => {
  const c = combat();
  c.activeCombatStyle = 'bow';
  c.resetStyleHeat();
  assert.equal(peek(c, 'dominantAIStyle'), 'bow');
  for (let i = 0; i < 40; i += 1) c.updateStyleHeat(0.5);
  assert.equal(peek(c, 'dominantAIStyle'), null);
  assert.equal(c.aiStyleProfile(), peek(c, 'styleAIProfiles.neutral'));
});

test('each style draws a distinct mob response from the shared tactics', () => {
  const profileFor = (style, className = 'Mage') => {
    const c = combat();
    c.character.className = className;
    setDominant(c, style);
    return c.aiStyleProfile();
  };
  assert.ok(profileFor('melee').ringScale > 1);
  assert.equal(profileFor('melee').punishRecovery, true);
  assert.ok(profileFor('bow').ringScale < 1);
  assert.equal(profileFor('bow').tokenBonus, 1);
  assert.ok(profileFor('bow').dodgeScale > 1);
  assert.ok(profileFor('magic').spacingScale > 1);
  assert.ok(profileFor('magic').rangedRate > 1);
  assert.ok(profileFor('melee', 'Warrior').ringScale > profileFor('melee', 'Mage').ringScale);
});

test('the bow response lets one extra melee mob engage', () => {
  const waitingCooldown = (style) => {
    const c = combat();
    c.currentFloor = 2;
    setDominant(c, style);
    const mobs = [0, 1, 2].map((i) => ({ x: 500 + i, y: 300, hp: 5, radius: 12, archetype: 'charger',
      behavior: i < 2 ? 'charge' : 'patrol', attackCooldown: 0.2, speed: 40, dodgeCooldown: 5, tacticTimer: 5 }));
    c.enemies.push(...mobs);
    c.applyMobTactics(mobs[2], 0.016, 1, 0, 300);
    return mobs[2].attackCooldown;
  };
  // Floor 2 allows two engaged chargers: a magic player's third waits, a bow player's may commit.
  assert.equal(waitingCooldown('magic'), 0.25);
  assert.equal(waitingCooldown('bow'), 0.2);
});

test('bosses and promoted boss-AI foes ignore the style response', () => {
  const c = combat();
  setDominant(c, 'magic');
  assert.equal(c.styleCooldownRate({ boss: true, archetype: 'ranged' }), 1);
  assert.equal(c.styleCooldownRate({ miniBoss: true, archetype: 'ranged' }), 1);
  assert.equal(c.styleCooldownRate({ bossAI: true, archetype: 'ranged' }), 1);
  assert.equal(c.styleCooldownRate({ archetype: 'charger' }), 1);
  assert.ok(c.styleCooldownRate({ archetype: 'ranged' }) > 1);
});
