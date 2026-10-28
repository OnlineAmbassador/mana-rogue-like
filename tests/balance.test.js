const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function combat() {
  const c = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => 0.05 }),
    mode: 'playing', currentFloor: 1, elapsed: 10,
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
    pointer: { down: false }, touchInput: {}, attackMorphs: {}, companions: [],
    MAX_PLAYER_VOLLEY: 16, MAX_CHARGE_SHOTS: 8, BOW_TAP_WINDOW: 0.15,
    combatPalette: { melee: '#fff' },
    calmBossStates: new Set(['jacko-idle']), calmMobBehaviors: new Set(['hover', 'crawl', 'patrol']),
    clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
    distanceBetween: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    hasLineOfSight: () => true,
    damageCalls: [], moves: [], bossExtraMoves: {},
  });
  const game = source('game.js');
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

test('ordinary enemy health increases each floor without tracking individual damage upgrades', () => {
  const c = combat();
  for (const kind of ['bee', 'ratto', 'slime', 'bandit', 'troll']) {
    let previous = 0;
    for (let floor = 1; floor <= 9; floor += 1) {
      c.currentFloor = floor;
      const enemy = c.createEnemy(kind, 400, 300);
      assert.ok(enemy.hp > previous, `${kind} floor ${floor}`);
      previous = enemy.hp;
    }
  }
});

test('boss health targets at least 80 seconds of estimated sustained damage across builds', () => {
  const c = combat();
  for (const cls of ['Mage', 'Rogue', 'Warrior', 'Scholar']) {
    c.character = { className: cls, startingStyle: cls === 'Warrior' ? 'melee' : 'magic', fireDelay: 0.28 };
    if (cls === 'Warrior') c.meleeWeapons.add('sword');
    for (const floor of [1, 4, 9]) {
      c.currentFloor = floor;
      for (const shotCount of [1, 3]) {
        c.weapon.shotCount = shotCount;
        const boss = c.createEnemy('golem', 400, 300, true);
        assert.ok(boss.hp / c.estimatedPlayerDps() >= 80 + (floor - 1) * 4);
      }
    }
  }
});

test('baseline real sword, arrow, and magic attacks need over 60 seconds of uninterrupted hits', () => {
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
    assert.ok(boss.hp / swordDps > 60, `${cls} sword`);
    for (const style of ['bow', 'magic']) {
      c.activeCombatStyle = style;
      c.player.fireCooldown = 0;
      c.projectiles.length = 0;
      c.shoot(style === 'bow' ? { quick: true } : null);
      const dps = c.projectiles.reduce((total, shot) => total + shot.damage, 0) / c.player.fireCooldown;
      assert.ok(boss.hp / dps > 60, `${cls} ${style}`);
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

test('real player and enemy projectile loops push bombs and remove the impacting shots', () => {
  const c = combat();
  Object.assign(c, { dt: 0, particles: [], quality: { low: false }, MAX_PARTICLES: 400, MAX_PARTICLES_LOW: 120 });
  c.bombs.push({ x: 350, y: 300, fuse: 1 });
  c.projectiles.push({ x: 350, y: 300, vx: 500, vy: 0, radius: 4, ttl: 1, trailTimer: 1 });
  c.enemyProjectiles.push({ x: 350, y: 300, vx: 0, vy: 500, radius: 4, ttl: 1 });
  const game = source('game.js');
  const loops = game.slice(game.indexOf('  for (let i = projectiles.length - 1;'),
    game.indexOf('  for (let i = particles.length - 1;'));
  vm.runInContext(loops, c);
  assert.equal(c.projectiles.length, 0);
  assert.equal(c.enemyProjectiles.length, 0);
  assert.ok(c.bombs[0].vx > 0 && c.bombs[0].vy > 0);
  assert.equal(c.bombs[0].fuse, 1);
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

test('boss ground strikes arrive as a spaced sequence without stacking new patterns', () => {
  const c = combat();
  const boss = { x: 700, y: 300, boss: true, radius: 40, behavior: 'jacko-idle',
    pressureCooldown: 0, smackCooldown: 10, speed: 150 };
  c.applyBossPressure(boss, 0.016, -1, 0, 400);
  assert.equal(c.bossStrikes.length, 4);
  for (let i = 1; i < c.bossStrikes.length; i += 1) {
    assert.ok(c.bossStrikes[i].timer - c.bossStrikes[i - 1].timer >= 0.29);
  }
  c.applyBossPressure(boss, 10, -1, 0, 400);
  assert.equal(c.bossStrikes.length, 4);
});
