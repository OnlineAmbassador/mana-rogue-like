// Shared combat context for the enemy-AI tests: the player, enemies and room state plus the real mobmanager,
// playermanager and worldmanager scripts, with rendering, sound and damage side effects stubbed out.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceText } = require('./load');

const source = (file) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');

function combat() {
  const c = vm.createContext({
    monsterSprites: {},
    Math: Object.assign(Object.create(Math), { random: () => 0.05 }),
    mode: 'playing', lastInputMode: 'keyboard', currentFloor: 1, elapsed: 10, performance,
    save: { unlockedCharacters: [], playtimeSeconds: 0 },
    player: { x: 300, y: 300, lookX: 1, lookY: 0, radius: 12, speed: 235, invuln: 0, damage: 1, luck: 0 },
    weapon: { damageBonus: 0, shotDamageMultiplier: (2 / 3) / 0.23,
      fireDelay: 2 / 3, shotCount: 1, rangeLevel: 0 },
    character: { className: 'Mage', raceHead: 'humanMale', startingStyle: 'magic', fireDelay: 0.23 },
    meleeWeapons: new Set(['hands']), combatStyles: new Set(['magic', 'bow', 'melee']),
    ownedItems: new Set(), shopItemCatalog: [
      { id: 'mana-tonic', name: 'Mana Tonic', kind: 'consumable' },
      { id: 'bomb-bundle', name: 'Bomb Bundle', kind: 'consumable' },
    ],
    enemies: [], enemyProjectiles: [], projectiles: [], bombs: [], breakables: [], pickups: [],
    consumables: [], bossStrikes: [], groundHazards: [], bombScorches: [], laserBeams: [], sporePods: [], playerStillTimer: 0,
    playerVelocity: { x: 0, y: 0 }, hitStopTimer: 0,
    ROOM_W: 960, ROOM_H: 540, ROOM_WALL_THICKNESS: 24, WALL_COLLISION_PADDING: 4,
    dashCooldown: 0, dashTimer: 0,
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
    coins: 0, MAX_EXTRA_HEARTS: 9, SOFT_EXTRA_HEARTS: 5, BASE_HEARTS: 4, equippedClothing: { legs: null, chest: null },
  });
  const game = source('game.js');
  vm.runInContext(sliceText(game, 'const bossPhaseAttackSets =', 'let ROOM_W =', 'game'), c);
  vm.runInContext(sliceText(game, 'const enemyUnlockAtSeconds =', 'let enemyLinkSequence =', 'game'), c);
  vm.runInContext(sliceText(game, 'const magicElementPalette =', 'let hitStopTimer =', 'game'), c);
  vm.runInContext(sliceText(game, 'const classProfiles =', '// Every weapon style', 'game'), c);
  vm.runInContext(sliceText(game, 'const materialCatalog =', 'let keysHeld =', 'game'), c);
  for (const file of ['playermanager.js', 'mobmanager.js', 'worldmanager.js']) vm.runInContext(source(file), c);
  c.moveEnemyWithCollision = c.moveEnemy;
  vm.runInContext(`
    recordEnemyDiscovery = recordEnemyAbilityDiscovery = addParticles = addEffectBurst = playSound = showMessage = updateHud = () => {};
    curioMultiplier = () => 1;
    damagePlayer = (amount) => damageCalls.push(amount);
    moveEnemy = (enemy, vx, vy) => moves.push({vx, vy});
    triggerCameraShake = playEnemyAttackSound = () => {};
    currentAimAngle = () => 0;
    meleeChargeTime = () => 0.9;
  `, c);
  return c;
}

const peek = (c, expression) => vm.runInContext(expression, c);

module.exports = { combat, source, peek };
