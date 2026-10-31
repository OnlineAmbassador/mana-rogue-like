// Pins the outcome of the item review (docs/ITEMS.md): base costs, removed and merged items, curio numbers and the
// rule changes behind them. A change to any of these numbers should be made in docs/ITEMS.md and here together.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, peek } = require('./helpers/combat');
const { loadBetween, loadFunctions, sliceBetween } = require('./helpers/load');

function catalogContext() {
  const c = vm.createContext({
    monsterSprites: { ratto: {}, golem: {}, bee: {} },
    monsterDisplayName: (kind) => kind,
    bossCompanionKinds: new Set(['golem']),
  });
  loadBetween(c, 'game.js', 'const MIN_ABILITY_COST', 'const characterRoster');
  return c;
}

const catalog = () => peek(catalogContext(), 'shopItemCatalog');
const byId = (items, id) => items.find((item) => item.id === id);

test('base costs follow the item review', () => {
  const items = catalog();
  const costs = {
    pearl: 7, prism: 8, feather: 8,
    'heart-vessel-i': 8, 'heart-vessel-ii': 11, 'heart-vessel-iii': 14,
    'luck-up-i': 6, 'luck-up-ii': 9,
    'range-lens': 8, 'range-lens-ii': 11, 'range-lens-iii': 14,
    'wild-magic-core': 9,
    'frost-rune': 9, 'orbiting-projectiles': 10, 'spore-bloom': 10, 'bonded-aegis': 11,
    'element-fire': 7, 'element-lightning': 7, 'element-gas': 7,
    'iron-sword': 8, 'swift-daggers': 7,
    'curio-hot-take': 8, 'curio-sole': 5, 'curio-run-on': 6, 'curio-trigger': 5, 'curio-heavy-metal': 6,
    'curio-shake': 7, 'curio-mana-cafe': 6, 'curio-mana-lisa': 4, 'curio-dice': 5, 'curio-wild-card': 5,
    'mod-windup': 7, 'mod-flurry': 7, 'mod-cinder': 8, 'mod-pierce': 8, 'mod-draw': 7, 'mod-quiver': 7,
    'mod-storm-arrows': 9, 'mod-splash': 8, 'mod-chain': 9, 'mod-lingering': 8,
    'silk-shorts': 6, 'leather-legguards': 8, 'leather-vest': 7,
    'mana-tonic': 4, 'bomb-bundle': 4, 'mana-burst': 6,
  };
  for (const [id, cost] of Object.entries(costs)) {
    assert.ok(byId(items, id), `${id} exists`);
    assert.equal(byId(items, id).cost, cost, id);
  }
});

test('retired and merged items are gone and Betsanc keeps the familiar sigil id', () => {
  const items = catalog();
  for (const id of ['guardian-heart', 'curio-overdraw', 'learn-magic', 'learn-brawl', 'learn-bow',
    'storm-spool', 'ember-seed', 'nova-pearl']) {
    assert.equal(byId(items, id), undefined, id);
  }
  assert.equal(byId(items, 'orbiting-projectiles').name, 'Betsanc');
  assert.equal(byId(items, 'lifestone').kind, 'boss-relic');
  assert.equal(byId(items, 'lifestone').cost, 0);
  assert.equal(items.some((item) => /Familiar Sigil/.test(item.name)), false);
});

test('every dormant familiar costs the same 12z', () => {
  const familiars = catalog().filter((item) => item.kind === 'companion');
  assert.equal(familiars.length, 3);
  assert.ok(familiars.every((item) => item.cost === 12));
});

test('curio numbers: Hot Take is a pure x1.5, Run-On Sentence is the faster big trade', () => {
  const items = catalog();
  const effects = (id) => ({ ...byId(items, id).effects });
  assert.deepEqual(effects('curio-hot-take'), { damage: 1.5 });
  assert.deepEqual(effects('curio-sole'), { speed: 1.2, damage: 0.85 });
  assert.deepEqual(effects('curio-run-on'), { speed: 1.35, damage: 0.95 });
  assert.deepEqual(effects('curio-trigger'), { fire: 1.4, damage: 0.85 });
  assert.deepEqual(effects('curio-heavy-metal'), { damage: 1.6, fire: 0.75 });
  assert.deepEqual(effects('curio-shake'), { damage: 1.25 });
  assert.deepEqual(effects('curio-mana-cafe'), { speed: 1.1, fire: 1.15 });
  assert.deepEqual(effects('curio-mana-lisa'), { fire: 1.2 });
  // No curio is dominated: a pure buff never costs less than a weaker pure buff.
  assert.ok(byId(items, 'curio-hot-take').cost > byId(items, 'curio-shake').cost);
});

test('Bonded Aegis no longer reshapes the player shots', () => {
  const text = sliceBetween('game.js', 'const attackMorphs = {', '};');
  assert.equal(text.includes('bonded-aegis'), false);
  assert.ok(text.includes('frost-rune'), 'the other morphs are untouched');
});

test('Heart Vessels are bought in order and Iron Sword is never offered twice', () => {
  const c = combat();
  c.rangeLensItemIds = [];
  c.isCatalogItemUnlocked = () => true;
  const vessels = ['heart-vessel-i', 'heart-vessel-ii', 'heart-vessel-iii'].map((id) => ({ id, kind: 'passive' }));
  const offered = () => vessels.filter((item) => c.isUpgradeAvailable(item)).map((item) => item.id);
  assert.deepEqual([...offered()], ['heart-vessel-i']);
  c.ownedItems.add('heart-vessel-i');
  assert.deepEqual([...offered()], ['heart-vessel-ii']);
  c.ownedItems.add('heart-vessel-ii');
  assert.deepEqual([...offered()], ['heart-vessel-iii']);
  c.ownedItems.add('heart-vessel-iii');
  assert.deepEqual([...offered()], []);

  const sword = { id: 'iron-sword', kind: 'weapon', weapon: 'sword' };
  assert.equal(c.isUpgradeAvailable(sword), true);
  c.meleeWeapons.add('sword');
  assert.equal(c.isUpgradeAvailable(sword), false, 'the Warrior already wields one');
  assert.equal(c.isUpgradeAvailable({ id: 'swift-daggers', kind: 'weapon', weapon: 'daggers' }), true);
});

test('Prism Shard is a real three-way fan of 0.4x shots, and an elemental fuse stays at 1.6x', () => {
  const c = combat();
  c.recordItemDiscovery = c.updateHud = c.showMessage = c.showPickupBanner = c.popOverPlayer = c.unlockCharacter = () => {};
  c.shopItemIconImages = {}; c.itemQuips = {}; c.itemEffectTagsFor = () => [];
  c.reservedUpgradeIds = new Set(); c.rangeLensItemIds = []; c.isCatalogItemUnlocked = () => true;
  const base = c.weapon.shotDamageMultiplier;
  assert.equal(c.grantUpgrade({ id: 'prism', name: 'Prism Shard', kind: 'passive' }), true);
  assert.equal(c.weapon.shotCount, 3);
  assert.ok(Math.abs(c.weapon.shotDamageMultiplier - base * 0.4) < 1e-9);
  const fused = c.weapon.shotDamageMultiplier * c.weapon.shotCount * 1.6 / peek(c, 'PRISM_TOTAL_DAMAGE');
  assert.ok(Math.abs(fused - base * 1.6) < 1e-9);
});

test('Wind-Up Wraps and Longbow Draw switch their style to charge mode when taken', () => {
  const c = combat();
  c.Math.random = () => 0.9;
  assert.equal(c.applyRandomFireMode({ id: 'mod-windup', style: 'melee', kind: 'mod' }), 'charge');
  assert.equal(c.fireModes.melee, 'charge');
  assert.equal(c.fireModes.bow, 'rapid', 'only its own style changes');
  assert.equal(c.applyRandomFireMode({ id: 'mod-draw', style: 'bow', kind: 'mod' }), 'charge');
  assert.equal(c.fireModes.bow, 'charge');
  assert.equal(c.applyRandomFireMode({ id: 'mod-pierce', style: 'bow', kind: 'mod' }) === 'charge', false);
});

test('Mana Burst scales with the floor but does not raise miniboss HP while carried', () => {
  const c = combat();
  const damageAt = (floor) => { c.currentFloor = floor; return c.manaBurstDamage(); };
  assert.deepEqual([1, 2, 5, 9].map(damageAt), [8, 12, 24, 40]);
  c.currentFloor = 9;
  c.consumables.push({ id: 'mana-burst', count: 1 });
  Object.assign(c.player, { damage: 1 });
  assert.equal(c.strongestPlayerSingleHit(), 8);
});

test('weapon-speed and reach numbers from the review', () => {
  const c = combat();
  assert.equal(peek(c, 'FLURRY_SWING_RATE'), 2.8);
  assert.ok(Math.abs(peek(c, 'FLURRY_COOLDOWN_SCALE') * 2.8 - 1) < 1e-12);
  assert.equal(peek(c, 'DAGGER_COOLDOWN_SCALE'), 0.8);
  assert.equal(peek(c, 'MELEE_REACH_PER_LENS'), 0.1);
  assert.equal(peek(c, 'LIFESTONE_HEARTS'), 3);
  assert.equal(peek(c, 'LIFESTONE_TICK_SECONDS'), 6);
});

test('each Far-Reach Lens tier lengthens melee reach by 10%', () => {
  const c = combat();
  c.attackOriginY = () => 300;
  c.getActiveAttackElement = () => null;
  c.characterProfile = () => ({ melee: 1 });
  c.styleSynergy = () => false;
  c.triggerHitStop = c.spawnSwordHitBurst = c.damageObstacle = () => {};
  c.activeWeaponMod = () => null;
  c.hasLineOfSight = () => true;
  c.player.meleeSwings = [];
  c.player.swordParryTimer = 0;
  const hit = (rangeLevel) => {
    c.weapon.rangeLevel = rangeLevel;
    c.weapon.damageBonus = 0;
    const struck = [];
    c.damageEnemy = (enemy) => struck.push(enemy);
    // Bare hands reach 66; a foe 1px beyond that (centre to centre, radius 10) is out of reach without a lens.
    c.enemies.length = 0;
    c.enemies.push({ x: 300 + 66 + 10 + 1, y: 300, radius: 10, hp: 10 });
    c.performMeleeSwing(0);
    return struck.length;
  };
  assert.equal(hit(0), 0);
  assert.equal(hit(1), 1);
  c.meleeWeapons.add('sword');
  const farFoe = (rangeLevel) => {
    c.weapon.rangeLevel = rangeLevel;
    const struck = [];
    c.damageEnemy = (enemy) => struck.push(enemy);
    c.enemies.length = 0;
    c.enemies.push({ x: 300 + 92 * 1.2 - 2 + 10, y: 300, radius: 10, hp: 10 });
    c.performMeleeSwing(0);
    return struck.length;
  };
  assert.equal(farFoe(1), 0, 'sword reach 92 x 1.1 does not reach 108');
  assert.equal(farFoe(2), 1, 'sword reach 92 x 1.2 does');
});

test('dyed icons map grey levels onto the TMW dye gradient and leave colour alone', () => {
  const c = vm.createContext({});
  loadFunctions(c, 'gameui.js', ['dyeGreyPixels']);
  const gradient = ['#000000', '#ff0000', '#ffffff'];
  const data = new Uint8ClampedArray([
    255, 255, 255, 255, // white -> last stop
    0, 0, 0, 255, // black -> first stop
    128, 128, 128, 255, // mid grey -> about the middle stop
    200, 40, 40, 255, // coloured pixel is untouched
    90, 90, 90, 0, // transparent pixel is untouched
  ]);
  c.dyeGreyPixels(data, gradient);
  assert.deepEqual([...data.slice(0, 3)], [255, 255, 255]);
  assert.deepEqual([...data.slice(4, 7)], [0, 0, 0]);
  assert.ok(data[8] > 250 && data[9] < 5, 'grey 128 is almost exactly the middle (red) stop');
  assert.deepEqual([...data.slice(12, 15)], [200, 40, 40]);
  assert.deepEqual([...data.slice(16, 19)], [90, 90, 90]);
  const lifestone = new Uint8ClampedArray([255, 255, 255, 255]);
  c.dyeGreyPixels(lifestone, ['#a0a010', '#ffffa0']);
  assert.deepEqual([...lifestone.slice(0, 3)], [255, 255, 160]);
});

// The bonus lines shown on cards, toasts and the pause grid.
function tagContext() {
  const c = combat();
  const catalogue = catalogContext();
  loadBetween(catalogue, 'game.js', 'const effectKeyLabels = {', 'const pickupBanner');
  loadBetween(catalogue, 'game.js', 'const attackMorphs = {', '// Chain lightning');
  Object.assign(c, {
    shopItemCatalog: peek(catalogue, 'shopItemCatalog'),
    itemEffectTags: peek(catalogue, 'itemEffectTags'),
    attackMorphs: peek(catalogue, 'attackMorphs'),
    MELEE_BASE_SCALE: 2.6,
  });
  vm.runInContext("const bonusStatLabels = { damage: 'Attack', speed: 'Speed', fire: 'Fire rate' };", c);
  loadFunctions(c, 'gameui.js', ['formatGain', 'itemEffectTagsFor']);
  return c;
}

test('bonus lines are signed, rounded percentages taken from the numbers that are applied', () => {
  const c = tagContext();
  const tags = (id) => [...c.itemEffectTagsFor(c.shopItemCatalog.find((item) => item.id === id))];
  assert.deepEqual(tags('curio-hot-take'), ['+50% Attack']);
  assert.deepEqual(tags('curio-sole'), ['+20% Speed', '-15% Attack']);
  assert.deepEqual(tags('curio-trigger'), ['+40% Fire rate', '-15% Attack']);
  assert.deepEqual(tags('curio-mana-cafe'), ['+10% Speed', '+15% Fire rate']);
  assert.deepEqual(tags('pearl'), ['+50% Shot size', '+1 Attack']);
  assert.deepEqual(tags('feather'), ['+40% Fire rate', '+15% Shot speed']);
  assert.deepEqual(tags('silk-shorts'), ['+15% Speed']);
  assert.deepEqual(tags('leather-legguards'), ['-10% Speed', '+2 Armor']);
  assert.deepEqual(tags('leather-vest'), ['+1 Armor']);
  assert.deepEqual(tags('mod-quiver'), ['+80% Fire rate', '-40% Arrow damage']);
  assert.deepEqual(tags('mod-flurry'), ['+180% Swing rate', '-62% Hit damage']);
  assert.deepEqual(tags('mod-windup'), ['+40% Charge speed', 'Melee charge mode']);
  assert.deepEqual(tags('swift-daggers'), ['+1 Melee attack', '+25% Swing rate', '-20% Melee reach']);
  assert.deepEqual(tags('range-lens-ii'), ['+35% Range', '+10% Melee reach']);
  assert.deepEqual(tags('frost-rune').slice(0, 2), ['-10% Shot damage', '-10% Shot speed']);
  assert.equal(tags('element-gas').includes('-20% Shot speed'), true);
  assert.deepEqual(tags('prism').slice(0, 2), ['3-way fan', '40% damage each']);
});

test('a saved shop stall with an old copy of an item still shows the live numbers', () => {
  const c = tagContext();
  const stale = { id: 'curio-mana-cafe', name: 'Mana-Cafe Latte', kind: 'curio', effects: { speed: 1.12, fire: 1.15 } };
  assert.deepEqual([...c.itemEffectTagsFor(stale)], ['+10% Speed', '+15% Fire rate']);
});

test('every real item shows bonus lines, and every curio line is a percentage', () => {
  const c = tagContext();
  for (const item of c.shopItemCatalog.filter((entry) => entry.kind !== 'companion' && entry.cost > 0)) {
    const lines = [...c.itemEffectTagsFor(item)];
    assert.ok(lines.length > 0, `${item.id} has bonus lines`);
    assert.ok(lines.every((line) => !/undefined|NaN/.test(line)), `${item.id}: ${lines}`);
    if (item.effects) assert.ok(lines.every((line) => /^[+-]\d+% /.test(line)), `${item.id}: ${lines}`);
  }
});

test('clothing speed is a multiplier that unequips exactly and commutes with a speed boon', () => {
  const c = combat();
  const shorts = byId(catalog(), 'silk-shorts');
  const legs = byId(catalog(), 'leather-legguards');
  assert.equal(shorts.speedMul, 1.15);
  assert.equal(legs.speedMul, 0.9);
  c.equippedClothing.legs = null;
  c.equippedClothing.chest = null;
  c.player.speed = 235;
  c.player.armor = 0;
  c.equipClothing(shorts);
  assert.ok(Math.abs(c.player.speed - 235 * 1.15) < 1e-9);
  c.player.speed *= 1.05; // a Swift Boon taken while the shorts are worn
  c.equipClothing(legs); // replaces the shorts in the same slot
  assert.ok(Math.abs(c.player.speed - 235 * 1.05 * 0.9) < 1e-9);
  assert.equal(c.player.armor, 2);
});

test('Mana Pearl and Swift Feather apply the numbers they display', () => {
  const c = combat();
  c.recordItemDiscovery = c.updateHud = c.showMessage = c.showPickupBanner = c.popOverPlayer = c.unlockCharacter = () => {};
  c.shopItemIconImages = {}; c.itemQuips = {}; c.itemEffectTagsFor = () => [];
  c.reservedUpgradeIds = new Set(); c.rangeLensItemIds = []; c.isCatalogItemUnlocked = () => true;
  Object.assign(c.weapon, { tearSize: 1, fireDelay: 0.5, projectileSpeed: 480, damageBonus: 0 });
  c.grantUpgrade({ id: 'pearl', name: 'Mana Pearl', kind: 'passive' });
  assert.equal(c.weapon.tearSize, 1.5);
  assert.equal(c.weapon.damageBonus, 1);
  c.grantUpgrade({ id: 'feather', name: 'Swift Feather', kind: 'passive' });
  assert.ok(Math.abs(0.5 / c.weapon.fireDelay - 1.4) < 1e-9, 'fire rate is exactly +40%');
  assert.ok(Math.abs(c.weapon.projectileSpeed - 480 * 1.15) < 1e-9);
});
