// Weapons: any weapon can be held in either hand at any time (unfound 70%, found 85%, learned 100% power); caches drop
// new weapons that are learned past the career XP gate for materials + banked zeny, Dual Grip lets the off hand
// auto-attack foes inside a 30-degree cone on its own family's branches, and Unweaving Runes refund a grown tier,
// a learned weapon or Dual Grip.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, peek } = require('./helpers/combat');
const { loadFunctions } = require('./helpers/load');

function weaponContext() {
  const c = combat();
  c.save.branches = { xp: 0, unlocks: {}, loadouts: { melee: [], bow: [], magic: [] } };
  c.save.bankedZeny = 0;
  c.saves = 0;
  c.persistSave = () => { c.saves += 1; };
  c.persistBankedZeny = (balance) => { c.save.bankedZeny = balance; return true; };
  vm.runInContext("weaponHands = { main: 'magic', off: 'blade' };", c);
  return c;
}

const hands = (c) => ({ ...peek(c, 'weaponHands') });

test('weapon saves keep only real, found weapons and clamp runes', () => {
  const c = weaponContext();
  loadFunctions(c, 'dbmanager.js', ['sanitizeWeaponSave']);
  const clean = c.sanitizeWeaponSave({
    found: ['axe', 'axe', 'blade', 'laser', 'kunai'], learned: ['axe', 'scepter'], grip: 'yes', runes: 400.7,
    hands: { Mage: { main: 'axe', off: 'axe' }, Ranger: { main: 'nope', off: 'bow' }, Bad: 'x' },
  });
  assert.deepEqual([...clean.found], ['axe', 'kunai'], 'base weapons and unknown ids are dropped');
  assert.deepEqual([...clean.learned], ['axe'], 'a weapon has to be found before it can be learned');
  assert.equal(clean.grip, false);
  assert.equal(clean.runes, 99);
  assert.deepEqual(JSON.parse(JSON.stringify(clean.hands)), { Mage: { main: 'axe' }, Ranger: { off: 'bow' } });
  assert.deepEqual(JSON.parse(JSON.stringify(c.sanitizeWeaponSave(null))),
    { found: [], learned: [], grip: false, runes: 0, hands: {} });
});

test('found weapons are learned past the XP gate for a Life Stone, and leave the drop pool once found', () => {
  const c = weaponContext();
  assert.equal(c.learnWeapon('axe'), 'unknown', 'a weapon has to be found first');
  assert.ok(c.weaponDropPool().some((entry) => entry.id === 'axe'));
  assert.equal(c.findWeapon('axe'), true);
  assert.equal(c.findWeapon('axe'), false, 'finding it twice does nothing');
  assert.equal(c.findWeapon('blade'), false, 'base weapons are always known');
  assert.ok(!c.weaponDropPool().some((entry) => entry.id === 'axe'));
  const cost = peek(c, 'WEAPON_LEARN_COST');
  assert.deepEqual({ ...cost }, { lifeStone: 1 }, 'learning a weapon is an ability lock');
  const pouch = peek(c, 'materials');
  assert.equal(c.learnWeapon('axe'), 'gate', 'career XP below the first gate');
  c.save.branches.xp = c.growthXpRequirement();
  pouch.lifeStone = 0;
  c.save.bankedZeny = 500;
  assert.equal(c.learnWeapon('axe'), 'short');
  assert.equal(c.save.bankedZeny, 500, 'nothing is spent when short');
  pouch.lifeStone = 2;
  assert.equal(c.learnWeapon('axe'), 'learned');
  assert.equal(pouch.lifeStone, 1);
  assert.equal(c.save.bankedZeny, 500, 'zeny is not part of the price');
  assert.equal(c.save.branches.xp, 30, 'XP is a gate, never spent');
  assert.equal(c.learnWeapon('axe'), 'known');
  assert.equal(c.weaponLearned('blade'), true);
});

test('setting a hand swaps when the weapon is already in the other one and is remembered per class', () => {
  const c = weaponContext();
  assert.equal(c.setWeaponHand('main', 'nope'), false, 'only real weapons can be held');
  assert.equal(c.setWeaponHand('off', 'bow'), true);
  assert.deepEqual(hands(c), { main: 'magic', off: 'bow' });
  assert.equal(c.setWeaponHand('main', 'bow'), true);
  assert.deepEqual(hands(c), { main: 'bow', off: 'magic' }, 'the hands trade places');
  assert.equal(c.activeCombatStyle, 'bow', 'the main hand decides the active family');
  assert.deepEqual({ ...c.save.branches.weapons.hands.Mage }, { main: 'bow', off: 'magic' });
  assert.deepEqual({ ...c.savedWeaponHands({ className: 'Mage', startingStyle: 'magic' }) }, { main: 'bow', off: 'magic' });
  assert.deepEqual({ ...c.savedWeaponHands({ className: 'Knight', startingStyle: 'melee' }) }, { main: 'blade', off: 'bow' },
    'another class keeps its own default pair');
});

test('all three base weapons are explicitly selectable at run start on every class', () => {
  const c = weaponContext();
  c.keys = { w: true };
  c.pointer.down = true;
  c.saveRunState = c.suppressHeldAttackInput = () => {};
  for (const className of Object.keys(peek(c, 'classProfiles'))) {
    c.character.className = className;
    for (const [index, id] of ['blade', 'bow', 'magic'].entries()) {
      c.meleeWeapons.clear();
      c.meleeWeapons.add('hands');
      c.openStartingWeaponChoice();
      assert.equal(c.mode, 'weapon');
      assert.equal(c.keys.w, false);
      assert.equal(c.pointer.down, false);
      assert.equal(c.chooseStartingWeapon(index), true, `${className}: ${id}`);
      assert.equal(hands(c).main, id);
      assert.notEqual(hands(c).off, id);
      assert.equal(c.activeCombatStyle, ['melee', 'bow', 'magic'][index]);
      if (index === 0) assert.equal(c.meleeWeapons.has('sword'), true, 'Sword choice equips real sword attacks, not fists');
      assert.equal(c.mode, 'playing');
      assert.equal(c.chooseStartingWeapon(index), false, 'a closed picker cannot change weapons');
    }
  }
});

test('starting weapon keyboard and touch selection share the guarded choice path', () => {
  const c = weaponContext();
  c.keys = {};
  c.saveRunState = c.suppressHeldAttackInput = () => {};
  c.VIEW_W = 960;
  c.clock = 1000;
  c.performance = { now: () => c.clock };
  loadFunctions(c, 'gameui.js', ['startingWeaponBounds', 'moveStartingWeaponFocus',
    'confirmStartingWeaponChoice', 'handleStartingWeaponKey', 'handleStartingWeaponPointer', 'pointInBounds']);
  c.openStartingWeaponChoice();
  c.handleStartingWeaponKey({ key: '2' }, '2');
  assert.equal(c.mode, 'weapon', 'held startup input cannot skip the choice');
  c.clock += 400;
  c.handleStartingWeaponKey({ key: '2' }, '2');
  assert.equal(hands(c).main, 'bow');
  c.openStartingWeaponChoice();
  c.clock += 400;
  const bounds = c.startingWeaponBounds(2);
  Object.assign(c.pointer, { x: bounds.x + 5, y: bounds.y + 5 });
  c.handleStartingWeaponPointer();
  assert.equal(hands(c).main, 'magic');
  assert.equal(c.mode, 'playing');
});

test('a variant weapon reshapes only its own family, and the off hand hits lighter and slower', () => {
  const c = weaponContext();
  c.findWeapon('axe');
  c.save.branches.weapons.learned.push('axe');
  c.setWeaponHand('main', 'axe');
  const axe = c.weaponShape('melee');
  assert.equal(axe.variant, 'axe');
  assert.equal(axe.damage, 1.35);
  assert.equal(c.weaponShape('bow').damage, 1, 'other families keep the base shape');
  assert.equal(c.weaponShape('bow').variant, null);
  vm.runInContext("weaponHands = { main: 'magic', off: 'axe' }; offhandContext = { angle: 0 };", c);
  const off = c.weaponShape('melee');
  assert.ok(Math.abs(off.damage - 1.35 * peek(c, 'OFFHAND_DAMAGE_SCALE')) < 1e-9);
  assert.ok(Math.abs(off.rate - 1.3 * peek(c, 'OFFHAND_RATE_SCALE')) < 1e-9);
  vm.runInContext('offhandContext = null;', c);
});

test('any weapon can be held at once; it hits at 70% unfound, 85% found and full power once learned', () => {
  const c = weaponContext();
  const power = peek(c, 'WEAPON_PROFICIENCY');
  assert.equal(c.setWeaponHand('main', 'scythe'), true, 'no need to find or learn it first');
  assert.equal(c.weaponProficiencyRank('scythe'), 'unfound');
  assert.ok(Math.abs(c.weaponShape('melee').damage - 1.2 * power.unfound) < 1e-9);
  c.findWeapon('scythe');
  assert.ok(Math.abs(c.weaponShape('melee').damage - 1.2 * power.found) < 1e-9);
  c.save.branches.weapons.learned.push('scythe');
  assert.ok(Math.abs(c.weaponShape('melee').damage - 1.2) < 1e-9);
  assert.equal(c.weaponProficiency('blade'), 1, 'base weapons are always at full power');
  c.save.branches.weapons.grip = true;
  c.setWeaponHand('off', 'kunai');
  assert.equal(c.offhandActive(), true, 'an unfound off hand still attacks with Dual Grip');
  assert.equal(c.learnWeapon('kunai'), 'unknown', 'but it has to be found before it can be learned');
});

test('the off hand only aims at foes inside a 30-degree cone of where the player looks', () => {
  const c = weaponContext();
  c.attackOriginY = () => c.player.y;
  c.enemyAttackTarget = (enemy) => enemy;
  Object.assign(c.player, { x: 300, y: 300, lookX: 1, lookY: 0 });
  c.enemies.push({ x: 300, y: 200, hp: 5, radius: 10 });
  assert.equal(c.offhandTargetAngle(200), null, 'a foe straight up is outside the cone');
  c.enemies.push({ x: 400, y: 330, hp: 5, radius: 10 });
  const angle = c.offhandTargetAngle(200);
  assert.ok(Math.abs(angle - Math.atan2(30, 100)) < 1e-9, 'a foe 17 degrees off the look line is targeted');
  assert.equal(c.offhandTargetAngle(50), null, 'out of range');
  c.player.lookX = -1;
  assert.equal(c.offhandTargetAngle(200), null, 'looking away stops the off hand');
});

test('Dual Grip is needed before the off hand attacks, and it fires on its own cooldown without touching the main hand', () => {
  const c = weaponContext();
  c.attackOriginY = () => c.player.y;
  c.enemyAttackTarget = (enemy) => enemy;
  c.enemies.push({ x: 380, y: 300, hp: 50, radius: 10 });
  const calls = [];
  c.performMeleeAttack = (charged) => {
    calls.push({ charged, style: c.activeCombatStyle, angle: c.currentAimAngle(), hand: peek(c, 'heldWeaponId()') });
    c.player.fireCooldown = 0.5;
    c.player.meleeCharge = 0;
  };
  vm.runInContext('currentAimAngle = () => (offhandContext ? offhandContext.angle : 0);', c);
  Object.assign(c.player, { fireCooldown: 0.2, meleeCharge: 0.4 });
  c.updateOffhand(0.016, true);
  assert.equal(calls.length, 0, 'without Dual Grip the off hand stays sheathed');
  assert.equal(c.offhandActive(), false);

  const cost = peek(c, 'DUAL_GRIP_COST');
  c.save.branches.xp = c.growthXpRequirement();
  peek(c, 'materials').lifeStone = cost.lifeStone;
  assert.equal(c.growDualGrip(), 'learned');
  assert.equal(c.offhandActive(), true);
  c.updateOffhand(0.016, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { charged: false, style: 'melee', angle: 0, hand: 'blade' });
  assert.equal(c.activeCombatStyle, 'magic', 'the main hand family is restored');
  assert.equal(c.player.fireCooldown, 0.2, 'the main hand cooldown is untouched');
  assert.equal(c.player.meleeCharge, 0.4, 'an off-hand swing never clears the main hand charge');
  assert.equal(c.player.offhand.cooldown, 0.5);
  c.updateOffhand(0.016, true);
  assert.equal(calls.length, 1, 'the off hand waits for its own cooldown');
  c.updateOffhand(0.6, false);
  assert.equal(calls.length, 1, 'no attacks while control is off');
  c.updateOffhand(0.016, true);
  assert.equal(calls.length, 2);
});

test('the off hand charges when its own family has a charge branch highlighted', () => {
  const c = weaponContext();
  c.attackOriginY = () => c.player.y;
  c.enemyAttackTarget = (enemy) => enemy;
  c.enemies.push({ x: 380, y: 300, hp: 50, radius: 10 });
  c.save.branches.weapons = { found: [], learned: [], grip: true, runes: 0, hands: {} };
  const calls = [];
  c.performMeleeAttack = (charged) => { calls.push(charged); c.player.fireCooldown = 0.5; };
  c.ownedItems.add('mod-windup');
  c.toggleBranch('windup');
  assert.equal(c.fireMode('melee'), 'charge');
  assert.equal(c.fireMode('magic'), 'rapid', 'the main hand keeps tapping');
  const needed = c.offhandChargeTime('melee');
  c.updateOffhand(needed / 2, true);
  assert.equal(calls.length, 0, 'the off hand winds up first');
  c.updateOffhand(needed / 2 + 0.01, true);
  assert.deepEqual(calls, [true], 'then releases a charged swing');
});

test('an Unweaving Rune undoes one node and refunds exactly what it cost', () => {
  const c = weaponContext();
  assert.equal(c.unweaveNode('grip'), 'nothing');
  c.save.branches.weapons = { found: ['axe'], learned: ['axe'], grip: true, runes: 0, hands: { Mage: { main: 'axe', off: 'magic' } } };
  vm.runInContext("weaponHands = { main: 'axe', off: 'magic' };", c);
  assert.equal(c.unweaveNode('grip'), 'no-rune');
  c.addUnweavingRune();
  c.addUnweavingRune();
  c.addUnweavingRune();
  assert.equal(c.unweaveNode('weapon', 'axe'), 'done');
  const learn = peek(c, 'WEAPON_LEARN_COST');
  const pouch = peek(c, 'materials');
  assert.equal(pouch.lifeStone, learn.lifeStone, 'the Life Stone goes back into the pouch');
  assert.equal(c.save.branches.xp, 0, 'career XP was never spent, so none comes back');
  assert.deepEqual([...c.save.branches.weapons.learned], []);
  assert.deepEqual([...c.save.branches.weapons.found], ['axe'], 'the weapon stays found and can be relearned');
  assert.equal(hands(c).main, 'axe', 'it stays in hand, back at found strength');
  assert.equal(c.weaponProficiency('axe'), peek(c, 'WEAPON_PROFICIENCY').found);
  assert.equal(c.unweaveNode('weapon', 'blade'), 'nothing', 'base weapons cannot be unwoven');

  c.save.branches.unlocks.prism = 3;
  assert.equal(c.unweaveNode('tier', 'prism'), 'done');
  assert.equal(c.branchTier('prism'), 2);
  assert.equal(c.save.branches.weapons.runes, 1);
  const tierCost = c.branchTierCost('prism', 3);
  assert.deepEqual({ ...tierCost }, { darkCrystal: 2 });
  assert.equal(pouch.darkCrystal, tierCost.darkCrystal, 'tier III refunds its Dark Crystals');
  assert.equal(c.unweaveNode('grip'), 'done');
  assert.equal(pouch.lifeStone, learn.lifeStone + peek(c, 'DUAL_GRIP_COST').lifeStone);
  assert.equal(c.save.branches.weapons.grip, false);
  assert.equal(c.save.branches.weapons.runes, 0);
  assert.equal(c.unweaveNode('tier', 'prism'), 'no-rune');
});

test('a held kunai is always thrown as a kunai: taps, charged throws and Riposte Volley', () => {
  const c = weaponContext();
  c.activeCombatStyle = 'bow';
  c.fireModes.bow = 'charge';
  c.weapon.projectileSpeed = 420;
  c.weapon.rangeMultiplier = 1;
  c.weapon.tearSize = 1;
  c.setWeaponHand('main', 'kunai');
  c.shoot({ charge: 0 });
  assert.equal(c.projectiles[0].type, 'arrow');
  assert.equal(c.projectiles[0].weaponVariant, 'kunai');
  assert.equal(c.player.attackAnimationStyle, 'hand', 'a kunai is thrown, not drawn on a bow');
  c.projectiles.length = 0;
  c.player.fireCooldown = 0;
  c.mode = 'playing';
  c.shoot({ charge: 1 });
  assert.equal(c.projectiles.length, 1, 'the first kunai of the stream flies at once');
  assert.equal(c.projectiles[0].type, 'arrow', 'a charged kunai is not a light beam');
  const each = c.projectiles[0].damage;
  for (let i = 0; i < 20; i += 1) c.updateKunaiStream(0.035);
  assert.equal(c.projectiles.length, c.kunaiStreamCount(1), 'the rest follow one after another');
  assert.equal(c.kunaiStreamCount(1), 6);
  assert.equal(c.kunaiStreamCount(0.3), 3);
  assert.ok(c.projectiles.every((shot) => shot.type === 'arrow' && shot.weaponVariant === 'kunai' && shot.damage === each));
  assert.equal(c.player.kunaiStream, null);
  c.projectiles.length = 0;
  c.looseRiposteVolley(300, 300, 10);
  assert.equal(c.projectiles.length, 3);
  assert.ok(c.projectiles.every((shot) => shot.weaponVariant === 'kunai'));
  c.setWeaponHand('main', 'bow');
  c.projectiles.length = 0;
  c.player.fireCooldown = 0;
  c.shoot({ charge: 1 });
  assert.equal(c.projectiles[0].type, 'charge-beam', 'the bow keeps its beam');
});

test('arrows and kunai carry the run element; Spellstring only adds the landing burst', () => {
  const c = weaponContext();
  c.activeCombatStyle = 'bow';
  c.weapon.projectileSpeed = 420;
  c.weapon.rangeMultiplier = 1;
  c.weapon.tearSize = 1;
  c.setWeaponHand('main', 'bow');
  c.magicElements.add('fire');
  c.activeMagicElement = 'fire';
  c.shoot({ charge: 0 });
  const arrow = c.projectiles[0];
  assert.equal(arrow.type, 'arrow');
  assert.equal(arrow.element, 'fire', 'fire arrows without any fusion');
  assert.equal(arrow.color, peek(c, 'magicElementPalette.fire'));
  assert.equal(arrow.explode, 0, 'no burst without Spellstring');
  c.projectiles.length = 0;
  c.player.fireCooldown = 0;
  c.confluenceFusionActive = (id) => id === 'spellstring';
  c.shoot({ charge: 0 });
  assert.equal(c.projectiles[0].explode, 30, 'Spellstring bursts where the arrow lands');
  c.projectiles.length = 0;
  c.player.fireCooldown = 0;
  c.setWeaponHand('main', 'kunai');
  c.shoot({ charge: 0 });
  assert.equal(c.projectiles[0].weaponVariant, 'kunai');
  assert.equal(c.projectiles[0].element, 'fire', 'a thrown kunai carries the element too');
});

test('Cinder\'s wall takes the run element and every wall shares one cap', () => {
  const c = weaponContext();
  for (const element of ['fire', 'ice', 'lightning', 'gas', 'earth']) c.magicElements.add(element);
  const wall = (element) => {
    c.groundHazards.length = 0;
    c.activeMagicElement = element;
    c.spawnElementWall(0, 10, false);
    return [...c.groundHazards];
  };
  assert.deepEqual(wall('fire').map((hazard) => hazard.kind), ['fire', 'fire', 'fire']);
  assert.equal(wall('bubble')[0].kind, 'water');
  assert.equal(wall('ice')[0].kind, 'slush');
  assert.equal(wall('lightning')[0].kind, 'charged');
  const earth = wall('earth');
  assert.equal(earth[0].kind, 'miasma');
  assert.equal(earth[0].color, peek(c, 'magicElementPalette.earth'), 'clouds are tinted to the element');
  assert.ok(earth.every((hazard) => hazard.wall && hazard.owner === 'player' && hazard.damage === 4));
  c.activeMagicElement = 'none';
  assert.equal(wall('none')[0].kind, 'fire', 'no element keeps the classic fire wall');

  c.groundHazards.length = 0;
  c.activeMagicElement = 'ice';
  for (let swing = 0; swing < 6; swing += 1) c.spawnElementWall(0, 10, true);
  assert.equal(c.groundHazards.length, peek(c, 'ELEMENT_WALL_CAP'));

  const foe = { x: 350, y: 300, radius: 12, hp: 20 };
  c.enemies.push(foe);
  c.groundHazards.length = 0;
  c.activeMagicElement = 'bubble';
  c.spawnElementWall(0, 10, false);
  c.updateGroundHazards(0.4);
  assert.ok(foe.hp < 20, 'a water wall hurts');
  assert.ok(foe.wetTimer > 0, 'and soaks, so lightning hits harder');
});
