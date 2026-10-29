const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function combat() {
  const c = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    enemies: [], ownedItems: new Set(), lightningArcs: [], bursts: [], hits: [],
    runOfferedAbilityIds: new Set(),
    groundHazards: [], clusters: [],
    character: { className: 'Mage' }, player: { x: 100, y: 200 },
    magicElements: new Set(['bubble']), activeMagicElement: 'bubble',
    ROOM_W: 960, ROOM_H: 540, ROOM_WALL_THICKNESS: 64,
    clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
    distanceBetween: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    hasLineOfSight: () => true,
    destination: { x: 600, y: 300 },
  });
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  vm.runInContext(game.slice(game.indexOf('const magicElementPalette ='), game.indexOf('let hitStopTimer =')), c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'playermanager.js'), 'utf8'), c);
  vm.runInContext(`
    damageEnemy = (enemy, damage, x, y, ignore, stop) => {
      enemy.hp -= damage;
      hits.push({ enemy, damage, stop });
    };
    addParticles = (...args) => bursts.push(args);
    findEnemySpawnPosition = () => destination;
    createGroundHazard = (x, y, kind, owner, options) => groundHazards.push({ x, y, kind, owner, ...options });
    burstClusterOrb = (orb, owner) => clusters.push({ orb, owner });
  `, c);
  return c;
}

function shot(overrides = {}) {
  return { x: 300, y: 300, vx: 480, vy: 0, size: 1, radius: 6, damage: 4,
    magicSurprise: true, wildEnemyChance: 0.4, wildObjectChance: 0.2, color: '#62d9ee', ...overrides };
}

test('charge-mode magic drops short taps and emits only a deliberate charged release', () => {
  const c = combat();
  const shots = [];
  c.fireMode = () => 'charge';
  c.meleeInputHeld = () => c.attackHeld;
  c.shoot = (options) => shots.push(options);
  c.player.magicHold = 0.1;
  c.attackHeld = false;
  c.updateMagicInput(0);
  assert.equal(shots.length, 0);
  c.player.magicHold = 0.3;
  c.updateMagicInput(0);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].magicCharge, 1 / 3);
});

test('new Mage runs can start with each element; other classes keep water until an upgrade', () => {
  const c = combat();
  const elements = ['bubble', 'fire', 'lightning', 'gas', 'spore', 'ice', 'wind', 'earth'];
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const init = game.slice(game.indexOf('  ownedItems.clear();'), game.indexOf('  combatStyles.clear();'));
  for (const [index, element] of elements.entries()) {
    c.Math.random = () => (index + 0.5) / elements.length;
    c.entry = { className: 'Mage' };
    vm.runInContext(init, c);
    assert.equal(c.activeMagicElement, element);
    assert.equal(c.magicElements.has(element), true);
    for (const className of ['Rogue', 'Warrior', 'Sporeling']) {
      c.entry = { className };
      vm.runInContext(init, c);
      assert.equal(c.activeMagicElement, 'bubble');
    }
  }
});

test('ordinary upgrades and consumables preserve the active element; sigils unlock their named element', () => {
  const c = combat();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'worldmanager.js'), 'utf8'), c);
  vm.runInContext(`
    weapon = { fireDelay: 1, projectileSpeed: 480 };
    reservedUpgradeIds = new Set(); attackMorphs = {}; itemQuips = {}; shopItemIconImages = {}; rangeLensItemIds = [];
    itemEffectTagsFor = () => [];
    isUpgradeAvailable = () => true;
    applyRandomFireMode = () => null;
    recordItemDiscovery = updateHud = showMessage = popOverPlayer = playSound = () => {};
    showPickupBanner = (name, tags) => { bannerTags = tags; };
  `, c);
  c.character.className = 'Rogue';
  assert.equal(c.grantUpgrade({ id: 'feather', name: 'Feather', kind: 'passive' }), true);
  assert.equal(c.activeMagicElement, 'bubble');
  assert.equal(c.bannerTags.includes('FIRE MAGIC'), false);
  assert.equal(c.grantUpgrade({ id: 'feather', name: 'Feather', kind: 'passive' }), false);
  assert.equal(c.activeMagicElement, 'bubble');
  assert.equal(c.grantUpgrade({ id: 'tonic', name: 'Tonic', kind: 'consumable' }), true);
  assert.equal(c.activeMagicElement, 'bubble');
  assert.equal(c.grantUpgrade({ id: 'another-upgrade', name: 'Upgrade', kind: 'passive' }), true);
  assert.equal(c.activeMagicElement, 'bubble');
  c.combatStyles = new Set();
  assert.equal(c.grantUpgrade({ id: 'element-fire', name: 'Ember Sigil', kind: 'element', element: 'fire' }), true);
  assert.equal(c.activeMagicElement, 'bubble');
  assert.equal(c.magicElements.has('fire'), true);
});

test('an elemental menhir changes the active element once when interacted with', () => {
  const c = combat();
  c.pickups = [];
  c.player.radius = 12;
  c.directions = [
    { name: 'up', dx: 0, dy: -1 },
    { name: 'right', dx: 1, dy: 0 },
    { name: 'down', dx: 0, dy: 1 },
    { name: 'left', dx: -1, dy: 0 },
  ];
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'worldmanager.js'), 'utf8'), c);
  vm.runInContext(`
    mode = 'playing';
    currentRoom = { type: 'elemental-shrine', shrineElement: 'fire', shrineUsed: false };
    player.x = ROOM_W / 2;
    player.y = ROOM_H / 2;
    frostActive = true;
    isPlayerNearDoor = () => false;
    addParticles = updateHud = saveRunState = showMessage = () => {};
    showPickupBanner = (name, tags) => { shrineBanner = name; };
  `, c);
  assert.equal(c.canInteract(), true);
  c.interact();
  assert.equal(c.activeMagicElement, 'fire');
  assert.equal(c.magicElements.has('fire'), true);
  assert.equal(c.currentRoom.shrineUsed, true);
  assert.equal(c.frostActive, false);
  assert.equal(c.shrineBanner, 'FIRE ATTUNEMENT');
  c.activeMagicElement = 'ice';
  c.interact();
  assert.equal(c.activeMagicElement, 'ice');
});

test('saved random elements restore without requiring an owned element sigil', () => {
  const c = combat();
  c.saved = { magicElements: ['bubble', 'ice', 'not-an-element'], activeMagicElement: 'ice' };
  c.shopItemCatalog = [];
  const db = fs.readFileSync(path.join(__dirname, '..', 'dbmanager.js'), 'utf8');
  vm.runInContext(db.slice(db.indexOf('  magicElements.clear();'), db.indexOf('  combatStyles.clear();')), c);
  assert.equal(c.activeMagicElement, 'ice');
  assert.equal(c.magicElements.has('not-an-element'), false);
});

test('every wild effect inherits shot element color and links its impact to the player', () => {
  for (const element of ['bubble', 'fire', 'lightning', 'gas', 'spore', 'ice', 'wind', 'earth']) {
    for (const effect of ['gas', 'wall', 'spores', 'bomb', 'slam', 'rot', 'rift', 'nova', 'chain']) {
      const c = combat();
      const target = { x: 300, y: 300, radius: 12, hp: 100 };
      c.enemies.push(target, { x: 340, y: 300, radius: 12, hp: 100 });
      c.triggerWildMagicImpact(shot({ element, wildEffect: effect }), target);
      const color = c.magicColor({ element });
      assert.ok(c.bursts.some((burst) => burst[2] === color), `${element} ${effect}`);
      const trail = c.lightningArcs.find((arc) => arc.castTrail);
      assert.equal(trail.x1, c.player.x);
      assert.equal(trail.color, color);
      assert.equal(trail.owner, 'player');
      assert.ok(c.groundHazards.every((hazard) => hazard.color === color));
      const status = target.manaBomb || target.manaSlam || target.manaRift;
      if (status) assert.equal(status.color, color);
      if (effect === 'bomb' || effect === 'slam') {
        c.bursts.length = 0;
        c.updateWildMagicStatus(target, 1.3);
        assert.ok(c.bursts.some((burst) => burst[2] === color), 'delayed explosion keeps original element');
      }
    }
  }
});

test('Mage special shot roll has an exact 6 percent threshold and keeps elemental identity', () => {
  for (const [roll, special] of [[0, true], [0.059999, true], [0.06, false], [0.99, false]]) {
    const c = combat();
    c.Math.random = () => roll;
    const s = c.prepareWildMagicShot(shot({ element: 'fire' }));
    assert.equal(Boolean(s.wildEffect), special);
    assert.equal(s.element, 'fire');
    assert.equal(s.color, '#ff7043');
    assert.equal(s.size, special ? 1.2 : 1);
  }
});

test('gas and flame wall procs create bounded player-owned damaging ground effects without hitstop', () => {
  for (const [effect, count, kind] of [['gas', 3, 'miasma'], ['wall', 5, 'fire']]) {
    const c = combat();
    c.triggerWildMagicImpact(shot({ wildEffect: effect }));
    assert.equal(c.groundHazards.length, count);
    assert.ok(c.groundHazards.every((h) => h.owner === 'player' && h.kind === kind && h.suppressHitStop));
    for (let i = 0; i < 10; i += 1) c.triggerWildMagicImpact(shot({ wildEffect: effect }));
    assert.equal(c.groundHazards.length, 16);
  }
});

test('spore surprises burst elemental clusters without creating recursive wild shots', () => {
  const c = combat();
  c.triggerWildMagicImpact(shot({ wildEffect: 'spores', element: 'fire' }));
  assert.equal(c.clusters.length, 1);
  assert.equal(c.clusters[0].orb.element, 'fire');
  assert.equal(c.clusters[0].orb.magicSurprise, undefined);
});

test('enemy bombs visibly count down then explode damaging nearby enemies but not the player', () => {
  const c = combat();
  const enemy = { x: 300, y: 300, radius: 12, hp: 20 };
  const nearby = { x: 340, y: 300, radius: 12, hp: 20 };
  c.enemies.push(enemy, nearby);
  c.triggerWildMagicImpact(shot({ wildEffect: 'bomb' }), enemy);
  assert.equal(enemy.manaBomb.timer, 1.2);
  c.updateWildMagicStatus(enemy, 0.6);
  assert.equal(enemy.hp, 20);
  c.updateWildMagicStatus(enemy, 0.61);
  assert.equal(enemy.manaBomb, null);
  assert.equal(enemy.hp, 16);
  assert.equal(nearby.hp, 18);
  assert.ok(c.hits.every((hit) => hit.stop === false));
});

test('lift suspends a mob for one second then slams it with splash damage and recovery', () => {
  const c = combat();
  const enemy = { x: 300, y: 300, radius: 12, hp: 20, attackCooldown: 0 };
  c.enemies.push(enemy);
  c.triggerWildMagicImpact(shot({ wildEffect: 'slam' }), enemy);
  assert.equal(c.updateWildMagicStatus(enemy, 0.5), true);
  assert.equal(enemy.hp, 20);
  assert.equal(c.updateWildMagicStatus(enemy, 0.51), true);
  assert.equal(enemy.manaSlam, null);
  assert.equal(enemy.hp, 16);
  assert.equal(enemy.attackCooldown, 0.8);
});

test('lift visuals include a ground shadow and vertical movement, while bomb marks flash red', () => {
  const c = combat();
  const calls = [];
  c.elapsed = 1;
  c.ctx = new Proxy({}, {
    get: (_, key) => (...args) => calls.push([key, ...args]),
    set: (_, key, value) => { calls.push([key, value]); return true; },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gameui.js'), 'utf8'), c);
  vm.runInContext('drawEnemyBody = () => {};', c);
  const enemy = { x: 300, y: 300, radius: 12, manaSlam: { timer: 0.5, duration: 1 } };
  c.drawEnemy(enemy);
  assert.ok(calls.some(([command]) => command === 'ellipse'));
  assert.ok(calls.some(([command, x, y]) => command === 'translate' && x === 0 && y === -85));
  calls.length = 0;
  enemy.manaSlam = null;
  enemy.manaBomb = { timer: 0.6, duration: 1.2 };
  c.drawEnemy(enemy);
  assert.ok(calls.some(([command, value]) => command === 'fillStyle' && value.startsWith('rgba(255, 35, 25')));
});

test('normal magic curves subtly without changing speed or losing its general heading', () => {
  const c = combat();
  const s = c.prepareWildMagicShot(shot());
  let maxDeviation = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    c.updateWildMagicFlight(s, 1 / 60);
    assert.ok(Math.abs(Math.hypot(s.vx, s.vy) - 480) < 1e-8);
    maxDeviation = Math.max(maxDeviation, Math.abs(Math.atan2(s.vy, s.vx)));
  }
  assert.ok(maxDeviation > 0.01 && maxDeviation < 0.15);
});

test('Mage enemy and object impact probabilities are exactly 40 and 20 percent', () => {
  for (const [targetHit, threshold] of [[true, 0.4], [false, 0.2]]) {
    for (const [roll, triggers] of [[threshold - 0.000001, true], [threshold, false]]) {
      const c = combat();
      c.Math.random = () => roll;
      const target = { x: 300, y: 300, radius: 12, hp: 20 };
      c.enemies.push(target);
      const s = shot();
      c.triggerWildMagicImpact(s, targetHit ? target : null);
      assert.equal(c.bursts.length > 0, triggers);
      const before = c.bursts.length;
      c.Math.random = () => 0;
      c.triggerWildMagicImpact(s, target);
      assert.equal(c.bursts.length, before, 'piercing shots do not reroll');
    }
  }
});

test('nearby enemies chain lightning but distant and obstructed enemies do not', () => {
  const c = combat();
  const target = { x: 300, y: 300, radius: 12, hp: 20 };
  const adjacent = { x: 350, y: 300, radius: 12, hp: 20 };
  const distant = { x: 900, y: 300, radius: 12, hp: 20 };
  c.enemies.push(target, adjacent, distant);
  c.triggerWildMagicImpact(shot({ wildEffect: 'chain' }), target);
  assert.equal(adjacent.hp, 19);
  assert.equal(distant.hp, 20);
  assert.equal(c.lightningArcs.filter((arc) => !arc.castTrail).length, 1);
  assert.equal(c.hits[0].stop, false);
  c.hasLineOfSight = () => false;
  const before = adjacent.hp;
  c.triggerWildMagicImpact(shot({ wildEffect: 'chain' }), target);
  assert.equal(adjacent.hp, before);
});

test('decay bursts deal repeated damage with particles and no magic hitstop', () => {
  const c = combat();
  const target = { x: 300, y: 300, radius: 12, hp: 20 };
  c.enemies.push(target);
  c.triggerWildMagicImpact(shot({ wildEffect: 'rot' }), target);
  c.updateWildMagicStatus(target, 0.1);
  c.updateWildMagicStatus(target, 0.6);
  assert.equal(target.hp, 16);
  assert.ok(c.bursts.length >= 3);
  assert.ok(c.hits.every((hit) => hit.stop === false));
});

test('rift sinks before relocating, rises, then releases the mob with recovery', () => {
  const c = combat();
  const target = { x: 300, y: 300, radius: 12, hp: 20, attackCooldown: 0 };
  c.enemies.push(target);
  c.triggerWildMagicImpact(shot({ wildEffect: 'rift' }), target);
  assert.equal(target.manaRift.timer, 0.8);
  c.updateWildMagicStatus(target, 0.2);
  assert.equal(target.x, 300);
  c.updateWildMagicStatus(target, 0.21);
  assert.equal(target.x, 600);
  c.updateWildMagicStatus(target, 0.4);
  assert.equal(target.manaRift, null);
  assert.ok(target.attackCooldown >= 0.7);
});

test('rifts do not teleport bosses and safely handle rooms without a legal destination', () => {
  const c = combat();
  const boss = { x: 300, y: 300, radius: 30, hp: 200, boss: true };
  c.enemies.push(boss);
  c.triggerWildMagicImpact(shot({ wildEffect: 'rift' }), boss);
  assert.equal(boss.manaRift, undefined);
  const mob = { x: 300, y: 300, hp: 20, radius: 12 };
  c.destination = null;
  c.triggerWildMagicImpact(shot({ wildEffect: 'rift' }), mob);
  assert.equal(mob.manaRift, undefined);
  assert.equal(mob.slowTimer, 1.2);
});

test('new items enhance their effects without raising baseline proc probabilities', () => {
  const c = combat();
  c.ownedItems.add('ember-seed');
  const target = { x: 300, y: 300, hp: 20, radius: 12 };
  c.triggerWildMagicImpact(shot({ wildEffect: 'rot' }), target);
  assert.equal(target.manaRotTimer, 4);
  c.ownedItems.add('nova-pearl');
  const adjacent = { x: 420, y: 300, hp: 20, radius: 12 };
  c.enemies.push(target, adjacent);
  c.triggerWildMagicImpact(shot({ wildEffect: 'nova' }), target);
  assert.equal(adjacent.hp, 18);
  const s = shot();
  c.Math.random = () => 0.4;
  const count = c.bursts.length;
  c.triggerWildMagicImpact(s, target);
  assert.equal(c.bursts.length, count);
});

test('non-Mages have mostly normal shots with 1 percent special, 10 percent enemy and 5 percent object rolls', () => {
  const c = combat();
  c.character.className = 'Rogue';
  for (const [roll, special] of [[0.009999, true], [0.01, false]]) {
    c.Math.random = () => roll;
    const s = c.prepareWildMagicShot(shot());
    assert.equal(Boolean(s.wildEffect), special);
    assert.equal(s.wildEnemyChance, 0.1);
    assert.equal(s.wildObjectChance, 0.05);
    if (!special) assert.equal(s.wildAmplitude, 0.025);
  }
  for (const targetHit of [true, false]) {
    for (const pass of [true, false]) {
      c.Math.random = () => 0.5;
      const s = c.prepareWildMagicShot(shot());
      const threshold = targetHit ? 0.1 : 0.05;
      c.Math.random = () => threshold - (pass ? 0.000001 : 0);
      const target = { x: 300, y: 300, hp: 20, radius: 12 };
      const count = c.bursts.length;
      c.triggerWildMagicImpact(s, targetHit ? target : null);
      assert.equal(c.bursts.length > count, pass);
    }
  }
});

test('Storm Spool extends lightning to four targets without recursive impacts', () => {
  const c = combat();
  c.ownedItems.add('storm-spool');
  const target = { x: 300, y: 300, hp: 20, radius: 12 };
  c.enemies.push(target);
  for (let i = 1; i <= 4; i += 1) c.enemies.push({ x: 300 + i * 30, y: 300, hp: 20, radius: 12 });
  c.triggerWildMagicImpact(shot({ wildEffect: 'chain' }), target);
  assert.equal(c.lightningArcs.filter((arc) => !arc.castTrail).length, 4);
  assert.equal(c.hits.length, 4);
});

test('actual projectile loop triggers enemy and object wild impacts without changing base attacks', () => {
  for (const surface of ['enemy', 'object']) {
    const c = combat();
    const projectile = shot({ wildEffect: 'rot', type: 'elemental', owner: 'player', ttl: 1, trailTimer: 1,
      wildAge: 0, wildPhase: 0, wildAmplitude: 0.07 });
    const target = { x: 300, y: 300, radius: 12, hp: 20 };
    Object.assign(c, {
      dt: 0, projectiles: [projectile], breakables: [], particles: [],
      quality: { low: false }, MAX_PARTICLES: 400, MAX_PARTICLES_LOW: 120,
    });
    c.enemies.push(target);
    if (surface === 'object') c.breakables.push({ x: 300, y: 300, radius: 16 });
    vm.runInContext(`
      strikeBombWithProjectile = () => false;
      triggerMagicCluster = damageObstacle = applyMorphLanding = triggerHitStop = () => {};
      resolveElementalImpact = (projectile, target) => { target.hp -= projectile.damage; };
    `, c);
    const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
    vm.runInContext(game.slice(game.indexOf('  for (let i = projectiles.length - 1;'),
      game.indexOf('  for (let i = enemyProjectiles.length - 1;')), c);
    assert.ok(target.manaRotTimer > 0, surface);
    assert.equal(target.hp, surface === 'enemy' ? 16 : 20);
    assert.equal(c.projectiles.length, 0);
  }
});
