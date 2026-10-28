const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function combat() {
  const context = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => 0.3 }), Infinity,
    player: {
      x: 300, y: 300, radius: 12, hp: 2, maxHp: 4, lookX: 1, lookY: 0,
      swordParryTimer: 0, swordParryRadius: 0, swordParryDamage: 7,
      swordParryRewarded: false,
      meleeSwings: [{
        weapon: 'hands', angle: 0, damage: 7, reach: 92, timer: 0.2, maxTimer: 0.2,
      }],
    },
    enemyProjectiles: [], enemies: [], returned: [], damageCalls: [], elapsed: 1, mode: 'playing',
    streakCallout: { duration: 1 }, hearts: 0,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    hasLineOfSight: () => true,
    distanceBetween: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'playermanager.js'), 'utf8'), context);
  vm.runInContext(`
    realSpawnPlayerProjectile = spawnPlayerProjectile;
    spawnPlayerProjectile = (shot) => returned.push(shot);
    damagePlayer = (damage) => { damageCalls.push(damage); player.hp -= damage; };
    addParticles = playSound = triggerHitStop = triggerCameraShake = updateHud = () => {};
    popOverPlayer = () => { hearts += 1; };
  `, context);
  return context;
}

function shot(context, overrides = {}) {
  context.enemyProjectiles.push({
    x: 325, y: 300, vx: -200, vy: 0, radius: 4, damage: 2, ...overrides,
  });
}

test('starting melee weapon parries approaching shots and restores half a heart', () => {
  const c = combat();
  shot(c);
  c.updateMeleeProjectileParry();
  assert.equal(c.returned.length, 1);
  assert.equal(c.returned[0].damage, 9);
  assert.equal(c.player.hp, 2.5);
  assert.equal(c.damageCalls.length, 0);
});

test('late body contact still hurts and returns the projectile without a heart', () => {
  const c = combat();
  shot(c, { x: 305 });
  c.updateMeleeProjectileParry();
  assert.equal(c.returned.length, 1);
  assert.equal(c.player.hp, 1.5);
  assert.equal(c.damageCalls[0], 0.5);
  assert.equal(c.hearts, 0);
});

test('sword tip catches a projectile that is not traveling toward the body', () => {
  const c = combat();
  shot(c, { x: 392, y: 266, vx: 0, vy: 200 });
  c.updateMeleeProjectileParry();
  assert.equal(c.returned.length, 1);
  assert.equal(c.hearts, 1);
});

test('swept sword-tip contact catches fast projectiles between frames', () => {
  const c = combat();
  shot(c, { x: 392, y: 316, vx: 0, vy: 1000 });
  assert.equal(c.updateMeleeProjectileParry(0, 0.1), true);
  assert.equal(c.returned.length, 1);
  assert.equal(c.damageCalls.length, 0);
});

test('a fast body hit does damage even after passing through the body', () => {
  const c = combat();
  shot(c, { x: 250, y: 300, vx: -1000 });
  c.updateMeleeProjectileParry(0, 0.1);
  assert.equal(c.returned.length, 1);
  assert.equal(c.damageCalls[0], 0.5);
  assert.equal(c.hearts, 0);
});

test('earlier sword-tip contact wins over a later body collision', () => {
  const c = combat();
  c.player.meleeSwings[0].angle = Math.PI / 2;
  shot(c, { x: 300, y: 250, vx: 0, vy: -1000 });
  c.updateMeleeProjectileParry(0, 0.15);
  assert.equal(c.returned.length, 1);
  assert.equal(c.damageCalls.length, 0);
  assert.equal(c.hearts, 1);
});

test('multiple parries reward only half a heart and retain swing damage after expiry', () => {
  const c = combat();
  shot(c);
  c.updateMeleeProjectileParry();
  c.player.meleeSwings = [];
  shot(c);
  c.updateMeleeProjectileParry();
  assert.equal(c.returned.length, 2);
  assert.equal(c.returned[1].damage, 9);
  assert.equal(c.hearts, 1);
  assert.equal(c.player.hp, 2.5);
});

test('no active swing or follow-through means no deflection', () => {
  const c = combat();
  c.player.meleeSwings = [];
  shot(c);
  c.updateMeleeProjectileParry();
  assert.equal(c.returned.length, 0);
});

test('charged radial burst catches sideways shots without refreshing itself', () => {
  const c = combat();
  c.player.meleeSwings = [];
  c.player.swordParryTimer = 0.2;
  c.player.swordParryRadius = 115;
  shot(c, { x: 380, vx: 0, vy: 200 });
  c.updateMeleeProjectileParry();
  assert.equal(c.returned.length, 1);
  assert.ok(c.returned[0].vx > 0);
  assert.equal(c.player.swordParryTimer, 0.2);
});

test('heart rewards cannot exceed maximum health', () => {
  const c = combat();
  c.player.hp = c.player.maxHp;
  shot(c);
  c.updateMeleeProjectileParry();
  assert.equal(c.player.hp, c.player.maxHp);
});

test('a later intercept cannot revive a player killed by body contact', () => {
  const c = combat();
  c.player.hp = 0.5;
  shot(c, { x: 305 });
  c.updateMeleeProjectileParry();
  shot(c, { x: 392, y: 266, vx: 0, vy: 200 });
  c.updateMeleeProjectileParry();
  assert.ok(c.player.hp <= 0);
  assert.equal(c.hearts, 0);
});

test('the entire visible sweep bats aside shots traveling away from the player', () => {
  for (const angle of [-0.85, -0.5, 0.5, 0.85]) {
    const c = combat();
    shot(c, {
      x: 300 + Math.cos(angle) * 92, y: 266 + Math.sin(angle) * 92,
      vx: Math.cos(angle) * 200, vy: Math.sin(angle) * 200,
    });
    c.updateMeleeProjectileParry();
    assert.equal(c.returned.length, 1, `missed visible blade at ${angle}`);
    assert.equal(c.damageCalls.length, 0);
    assert.equal(c.hearts, 1);
  }
});

test('fast shots crossing the side of the sweep are caught between frames', () => {
  const c = combat();
  shot(c, { x: 430, y: 210, vx: 2000, vy: 0 });
  c.updateMeleeProjectileParry(0, 0.1);
  assert.equal(c.returned.length, 1);
  assert.equal(c.damageCalls.length, 0);
});

test('every visible weapon sweep can intercept, not only the first one', () => {
  const c = combat();
  c.player.meleeSwings.push({ weapon: 'sword', angle: Math.PI, reach: 92, timer: 0.2, maxTimer: 0.2, damage: 7 });
  shot(c, { x: 355, y: 338, vx: 200, vy: 200 });
  c.updateMeleeProjectileParry();
  assert.equal(c.returned.length, 1);
});

test('charged spinning sweep uses its current visible angle and expanded reach', () => {
  const c = combat();
  Object.assign(c.player.meleeSwings[0], { spin: true, timer: 0.1 });
  const angle = Math.PI - 0.9 + 0.6;
  shot(c, { x: 300 + Math.cos(angle) * 98, y: 266 + Math.sin(angle) * 98, vx: -200, vy: 0 });
  c.updateMeleeProjectileParry();
  assert.equal(c.returned.length, 1);
});

test('shots behind the swing or beyond its reach are not caught', () => {
  for (const position of [{ x: 208, y: 266 }, { x: 420, y: 266 }, { x: 333, y: 180 }]) {
    const c = combat();
    shot(c, { ...position, vx: 0, vy: -200 });
    c.updateMeleeProjectileParry();
    assert.equal(c.returned.length, 0);
  }
});

function arrow(overrides = {}) {
  return { x: 300, y: 200, vx: 500, vy: 0, damage: 4, ...overrides };
}

test('arrows return shots within a forgiving tip box without healing on interception', () => {
  const c = combat();
  const a = arrow();
  const incoming = { x: 332, y: 212, vx: -250, vy: 0, radius: 4, damage: 2 };
  assert.equal(c.deflectArrowTipProjectile(a, incoming), true);
  assert.equal(c.returned.length, 1);
  assert.equal(c.returned[0].arrowParried, true);
  assert.equal(c.returned[0].damage, 6);
  assert.ok(c.returned[0].vx > 0);
  assert.equal(c.player.hp, 2);
  assert.equal(c.hearts, 0);
});

test('arrow parry box rejects shots beyond its width or behind the shaft', () => {
  const c = combat();
  for (const position of [{ x: 314, y: 225 }, { x: 280, y: 200 }]) {
    assert.equal(c.deflectArrowTipProjectile(arrow(), { ...position, vx: -250, vy: 0, radius: 4 }), false);
  }
});

test('relative swept arrow box catches fast crossing shots and moving arrows', () => {
  const c = combat();
  assert.equal(c.deflectArrowTipProjectile(
    arrow({ previousX: 250, previousY: 200 }),
    { x: 240, y: 210, vx: -1500, vy: 0, radius: 4 }, 0.1,
  ), true);
});

test('vertical arrows use an oriented box and return shots toward a living enemy', () => {
  const c = combat();
  c.enemies.push({ x: 500, y: 200, hp: 3 });
  assert.equal(c.deflectArrowTipProjectile(
    arrow({ vx: 0, vy: -500 }), { x: 312, y: 180, vx: 0, vy: 250, radius: 4 },
  ), true);
  assert.ok(c.returned[0].vx > 0);
  const aim = Math.atan2(20, 188);
  assert.ok(Math.abs(Math.atan2(c.returned[0].vy, c.returned[0].vx) - aim) <= 32 * Math.PI / 180 + 1e-10);
});

test('arrow clashes boost speeds and scatter in varied, bounded directions', () => {
  const results = [];
  for (const random of [0, 0.5, 0.999999]) {
    const c = combat();
    c.Math = Object.create(Math);
    c.Math.random = () => random;
    const a = arrow();
    c.deflectArrowTipProjectile(a, { x: 314, y: 200, vx: -500, vy: 0, radius: 4 });
    const returned = c.returned[0];
    const angle = Math.atan2(returned.vy, returned.vx) * 180 / Math.PI;
    const arrowAngle = Math.atan2(a.vy, a.vx) * 180 / Math.PI;
    assert.ok(Math.abs(angle) >= 35 && Math.abs(angle) <= 80);
    assert.ok(Math.abs(arrowAngle) >= 35 && Math.abs(arrowAngle) <= 70);
    assert.notEqual(Math.sign(angle), Math.sign(arrowAngle));
    assert.ok(Math.hypot(returned.vx, returned.vy) >= 825 - 1e-10);
    assert.ok(Math.hypot(returned.vx, returned.vy) <= 825 * 1.15 + 1e-10);
    assert.ok(Math.abs(Math.hypot(a.vx, a.vy) - 600) < 1e-10);
    results.push(angle);
  }
  assert.equal(new Set(results).size, 3);
});

test('only a damaging returned arrow-parry hit restores half a heart, once', () => {
  const c = combat();
  const returned = { arrowParried: true };
  const enemy = { hp: 3 };
  c.rewardArrowParryHit(returned, enemy, 3);
  assert.equal(c.player.hp, 2);
  enemy.hp = 2;
  c.rewardArrowParryHit(returned, enemy, 3);
  assert.equal(c.player.hp, 2.5);
  c.rewardArrowParryHit(returned, enemy, 3);
  assert.equal(c.player.hp, 2.5);
  assert.equal(c.hearts, 1);
  c.rewardArrowParryHit({}, enemy, 3);
  assert.equal(c.player.hp, 2.5);
});

test('arrow return healing cannot overheal or revive a dead player', () => {
  const c = combat();
  c.player.hp = 4;
  c.rewardArrowParryHit({ arrowParried: true }, { hp: 1 }, 2);
  assert.equal(c.player.hp, 4);
  c.player.hp = 0;
  c.rewardArrowParryHit({ arrowParried: true }, { hp: 1 }, 2);
  assert.equal(c.player.hp, 0);
});

test('real projectile loops remove the hostile shot and heal only on its later enemy hit', () => {
  const c = combat();
  Object.assign(c, {
    dt: 0, projectiles: [arrow({ owner: 'player', type: 'arrow', radius: 4, ttl: 2, trailTimer: 1 })],
    breakables: [], particles: [], quality: { low: false }, MAX_PARTICLES: 400, MAX_PARTICLES_LOW: 120,
    ROOM_W: 1000, ROOM_H: 800, weapon: { rangeLevel: 0 }, MAX_PLAYER_PROJECTILES: 100,
  });

  c.player.meleeSwings = [];
  c.enemies.push({ x: 500, y: 210, radius: 12, hp: 10 });
  shot(c, { x: 332, y: 210, ttl: 2 });
  vm.runInContext(`
    spawnPlayerProjectile = realSpawnPlayerProjectile;
    damageEnemy = (enemy, damage) => { enemy.hp -= damage; };
    applyMorphLanding = () => {};
    strikeBombWithProjectile = () => false;
    shieldWithCompanion = () => false;
  `, c);
  const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const loops = source.slice(source.indexOf('  for (let i = projectiles.length - 1;'),
    source.indexOf('  for (let i = particles.length - 1;'));
  vm.runInContext(loops, c);
  assert.equal(c.enemyProjectiles.length, 0);
  assert.equal(c.damageCalls.length, 0);
  assert.equal(c.player.hp, 2);
  const returned = c.projectiles.find((p) => p.arrowParried);
  assert.ok(returned);
  returned.x = 500;
  returned.y = 210;
  vm.runInContext(loops, c);
  assert.equal(c.enemies[0].hp, 4);
  assert.equal(c.player.hp, 2.5);
  assert.equal(c.projectiles.includes(returned), false);
});

test('parry healing has exactly a 40 percent eligibility threshold with no repeat rolls', () => {
  for (const [random, expected] of [[0, 2.5], [0.399999, 2.5], [0.4, 2], [0.999999, 2]]) {
    const c = combat();
    c.Math.random = () => random;
    shot(c);
    c.updateMeleeProjectileParry();
    assert.equal(c.player.hp, expected, `melee roll ${random}`);
    c.Math.random = () => 0;
    shot(c);
    c.updateMeleeProjectileParry();
    assert.equal(c.player.hp, expected, 'no second chance in the same swing');
    c.player.hp = 2;
    c.Math.random = () => random;
    const returned = { arrowParried: true };
    c.rewardArrowParryHit(returned, { hp: 1 }, 3);
    assert.equal(c.player.hp, expected, `arrow roll ${random}`);
    c.Math.random = () => 0;
    c.rewardArrowParryHit(returned, { hp: 1 }, 3);
    assert.equal(c.player.hp, expected, 'no reroll on the same returned shot');
  }
});

test('sword and arrow returns preserve original kind, color, and radius instead of stone shots', () => {
  for (const kind of ['arrow', 'venom', 'spore-orb', 'spore-shard', 'ice-orb']) {
    const c = combat();
    shot(c, { kind, color: '#91d8f5', radius: 9 });
    c.updateMeleeProjectileParry();
    const incoming = { x: 314, y: 200, vx: -250, vy: 0, radius: 9, kind, color: '#91d8f5' };
    c.deflectArrowTipProjectile(arrow(), incoming);
    for (const returned of c.returned) {
      assert.equal(returned.type, 'reflected');
      assert.equal(returned.kind, kind);
      assert.equal(returned.color, '#91d8f5');
      assert.equal(returned.radius, 9);
    }
    assert.equal(c.returned.length, 2);
  }
});

test('returned shots use the identical renderer as hostile shots and never draw the stone sprite', () => {
  const c = combat();
  const calls = [];
  c.ctx = new Proxy({}, {
    get: (_, key) => (...args) => { calls.push([key, ...args]); },
    set: (_, key, value) => { calls.push([key, value]); return true; },
  });
  const ui = fs.readFileSync(path.join(__dirname, '..', 'gameui.js'), 'utf8');
  vm.runInContext(ui, c);
  const loop = ui.slice(ui.indexOf('  for (const projectile of projectiles) {'),
    ui.indexOf('  for (const particle of particles) {'));
  for (const kind of ['arrow', 'venom', 'spore-orb', 'spore-shard', 'ice-orb']) {
    const original = { x: 300, y: 200, vx: 500, vy: 100, kind, color: '#91d8f5', radius: 9 };
    c.projectiles = [{ ...original, type: 'reflected' }];
    c.enemyProjectiles = [{ ...original }];
    calls.length = 0;
    vm.runInContext(loop, c);
    const midpoint = calls.length / 2;
    assert.deepEqual(calls.slice(0, midpoint), calls.slice(midpoint), kind);
    assert.equal(calls.some(([command]) => command === 'drawImage'), false);
  }
});
