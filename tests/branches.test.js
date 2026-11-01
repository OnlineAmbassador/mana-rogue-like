// Weapon branches: highlighted branches gate behaviour items, growth needs a career XP gate plus carried materials and
// banked zeny, pairs of
// branches form synergies, and level-ups queue a pick-1-of-3 boon that only opens in a cleared room.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { combat, peek } = require('./helpers/combat');
const { loadFunctions, loadBetween } = require('./helpers/load');

function branchContext() {
  const c = combat();
  c.save.branches = { xp: 0, unlocks: {}, loadouts: { melee: [], bow: [], magic: [] } };
  c.save.bankedZeny = 0;
  c.persistSave = () => {};
  c.persistBankedZeny = (balance) => { c.save.bankedZeny = balance; return true; };
  return c;
}

test('behaviour items only work while a highlighted branch of the held weapon lists them', () => {
  const c = branchContext();
  c.ownedItems.add('mod-pierce');
  assert.equal(c.itemActive('mod-pierce', 'bow'), false, 'owned but no branch highlighted');
  assert.equal(c.toggleBranch('piercer'), 'on');
  assert.equal(c.itemActive('mod-pierce', 'bow'), true);
  assert.equal(c.itemActive('mod-pierce', 'magic'), false, 'another weapon does not borrow it');
  c.ownedItems.add('pearl');
  assert.equal(c.itemActive('pearl', 'magic'), true, 'stat items sit in no branch and always work');
  c.ownedItems.add('spore-bloom');
  assert.equal(c.itemActive('spore-bloom', 'magic'), false);
  c.character.startingAbility = 'spore-bloom';
  assert.equal(c.itemActive('spore-bloom', 'magic'), true, 'a class starting item never needs a branch');
});

test('item branches stay dormant until their item is found; technique branches always work', () => {
  const c = branchContext();
  c.toggleBranch('windup');
  assert.equal(c.fireMode('melee'), 'rapid', 'Wind-Up without its wraps does nothing');
  c.ownedItems.add('mod-windup');
  assert.equal(c.fireMode('melee'), 'charge');
  c.toggleBranch('focus');
  assert.equal(c.fireMode('magic'), 'charge', 'Focus needs no item');
  c.toggleBranch('cleave');
  assert.ok(Math.abs(c.branchEffects('melee').reach - 1.1 * 1.1) < 1e-9, 'Cleave I plus the Whirlwind synergy');
});

test('each weapon holds at most three highlighted branches and toggling off frees a slot', () => {
  const c = branchContext();
  for (const id of ['cleave', 'flurry', 'riposte']) assert.equal(c.toggleBranch(id), 'on');
  assert.equal(c.toggleBranch('cinder'), 'full');
  assert.equal(c.toggleBranch('volley'), 'on', 'other weapons have their own slots');
  assert.equal(c.toggleBranch('flurry'), 'off');
  assert.equal(c.toggleBranch('cinder'), 'on');
  assert.deepEqual([...c.save.branches.loadouts.melee], ['cleave', 'riposte', 'cinder']);
  assert.equal(c.toggleBranch('nope'), 'missing');
});

test('growth needs career XP past a gate, then the node\'s own price; XP is never spent', () => {
  const c = branchContext();
  const pouch = peek(c, 'materials');
  assert.deepEqual({ ...c.branchTierCost('piercer', 2) }, { ironOre: 4 }, 'Pierce +2 is a form stat: Iron Ore');
  assert.deepEqual({ ...c.branchTierCost('piercer', 3) }, { darkCrystal: 2 }, '+15% damage is a power stat: Dark Crystal');
  assert.equal(c.branchTier('piercer'), 1);
  assert.equal(c.growthXpRequirement(), 30);
  assert.equal(c.unlockBranchTier('piercer'), 'gate', 'no career XP yet');
  c.addBranchXp(35);
  assert.equal(c.unlockBranchTier('piercer'), 'short', 'past the gate but no Iron Ore carried');
  pouch.ironOre = 5;
  assert.equal(c.unlockBranchTier('piercer'), 'unlocked');
  assert.equal(c.branchTier('piercer'), 2);
  assert.equal(c.save.branches.xp, 35, 'XP is a threshold, not a currency');
  assert.equal(pouch.ironOre, 1, 'materials spent stay spent');
  assert.equal(c.growthXpRequirement(), 30 * 2 + 4);
  assert.equal(c.unlockBranchTier('piercer'), 'gate', 'each growth raises the gate');
  c.addBranchXp(100);
  pouch.darkCrystal = 1;
  assert.equal(c.unlockBranchTier('piercer'), 'short');
  assert.equal(pouch.darkCrystal, 1, 'a short payment takes nothing');
  pouch.darkCrystal = 2;
  assert.equal(c.unlockBranchTier('piercer'), 'unlocked');
  assert.equal(pouch.darkCrystal, 0);
  assert.equal(c.unlockBranchTier('piercer'), 'maxed');
  c.ownedItems.add('mod-pierce');
  c.toggleBranch('piercer');
  const fx = c.branchEffects('bow');
  assert.equal(fx.pierce, 3);
  assert.ok(Math.abs(fx.damage - 1.15) < 1e-9);

  c.addBranchXp(1000);
  assert.deepEqual({ ...c.branchTierCost('flurry', 2) }, { zeny: 50 }, 'speed stats cost banked zeny');
  c.save.bankedZeny = 53;
  assert.equal(c.unlockBranchTier('flurry'), 'unlocked');
  assert.equal(c.save.bankedZeny, 3);
});

test('stats are priced by type and size, abilities are Life Stone locks, and tier I is free', () => {
  const c = branchContext();
  const branches = peek(c, 'skillBranches');
  for (const branch of branches) {
    assert.equal(c.branchTierCost(branch.id, 1), null, `${branch.id} I is free`);
    for (const tier of [2, 3]) {
      const cost = c.branchTierCost(branch.id, tier);
      assert.ok(cost && Object.keys(cost).length, `${branch.id} ${tier} has a price`);
      if (c.branchTierIsAbility(branch.id, tier)) assert.deepEqual({ ...cost }, { lifeStone: 1 }, `${branch.id} ${tier}`);
      else assert.equal(cost.lifeStone, undefined, `${branch.id} ${tier} is a stat: no Life Stone`);
    }
  }
  assert.equal(c.branchTierIsAbility('cinder', 2), true, 'Fire Wall is an ability');
  assert.equal(c.branchTierIsAbility('miasma', 2), true, 'long clouds are an ability');
  assert.deepEqual({ ...c.branchTierCost('prism', 2) }, { ironOre: 4 });
  assert.deepEqual({ ...c.branchTierCost('focus', 2) }, { zeny: 60 });
  assert.deepEqual({ ...c.branchTierCost('impact', 3) }, { ironOre: 3, darkCrystal: 1 }, 'mixed stats pay each part');
  assert.deepEqual({ ...c.branchTierCost('riposte', 3) }, { darkCrystal: 1, zeny: 35 });
  const prices = new Set(branches.flatMap((branch) => [2, 3].map((tier) => JSON.stringify(c.branchTierCost(branch.id, tier)))));
  assert.ok(prices.size >= 8, 'nodes have different prices');
  assert.deepEqual({ ...peek(c, 'WEAPON_LEARN_COST') }, { lifeStone: 1 });
  assert.deepEqual({ ...peek(c, 'DUAL_GRIP_COST') }, { lifeStone: 2 });
  c.addBranchXp(999);
  c.unlockBranchTier('cinder');
  assert.equal(c.unlockBranchTier('cinder'), 'short', 'Fire Wall waits for a Life Stone');
  peek(c, 'materials').lifeStone = 1;
  assert.equal(c.unlockBranchTier('cinder'), 'unlocked');
  assert.equal(peek(c, 'materials').lifeStone, 0);
});

test('two highlighted, powered branches form their synergy', () => {
  const c = branchContext();
  c.ownedItems.add('prism');
  c.ownedItems.add('mod-chain');
  c.toggleBranch('prism');
  assert.equal(c.branchEffects('magic').chain, 0);
  c.toggleBranch('conduit');
  assert.deepEqual([...c.activeBranchSynergies('magic').map((synergy) => synergy.id)], ['fork-storm']);
  assert.equal(c.branchEffects('magic').chain, 2, 'Conduit I plus Fork Storm');
  c.ownedItems.delete('mod-chain');
  assert.equal(c.activeBranchSynergies('magic').length, 0, 'a dormant branch cannot complete a synergy');
});

test('every synergy pairs two real branches of its own weapon', () => {
  const c = branchContext();
  const branches = peek(c, 'skillBranches');
  for (const synergy of peek(c, 'branchSynergies')) {
    for (const id of synergy.branches) assert.equal(branches.find((branch) => branch.id === id)?.style, synergy.style, synergy.id);
  }
  for (const style of ['melee', 'bow', 'magic']) {
    assert.equal(branches.filter((branch) => branch.style === style).length, 5, style);
  }
});

test('a found item lights its branch in a free slot, preferring the held weapon', () => {
  const c = branchContext();
  c.activeCombatStyle = 'bow';
  const prism = { id: 'prism' };
  assert.equal(c.autoHighlightForItem(prism).branch.id, 'volley');
  assert.equal(c.autoHighlightForItem(prism).active, true, 'already highlighted');
  for (const id of ['cleave', 'flurry', 'riposte']) c.toggleBranch(id);
  const blocked = c.autoHighlightForItem({ id: 'mod-cinder' });
  assert.equal(blocked.active, false, 'a full weapon keeps the player choice');
  assert.equal(c.save.branches.loadouts.melee.includes('cinder'), false);
  assert.equal(c.autoHighlightForItem({ id: 'pearl' }), null);
});

test('Prism only splits shots while its branch is highlighted, and the damage split is undone otherwise', () => {
  const c = branchContext();
  c.ownedItems.add('prism');
  c.weapon.shotCount = 3;
  c.weapon.shotDamageMultiplier = 0.4;
  const off = c.styleShotProfile('magic');
  assert.equal(off.count, 1);
  assert.ok(Math.abs(off.damage - 0.4 * 3 / peek(c, 'PRISM_TOTAL_DAMAGE')) < 1e-9);
  c.toggleBranch('prism');
  assert.equal(c.styleShotProfile('magic').count, 3);
});

test('saved branch data is sanitised: unknown ids, wrong styles, overfull slots and bad tiers are dropped', () => {
  const c = branchContext();
  loadFunctions(c, 'dbmanager.js', ['sanitizeBranchSave', 'sanitizeWeaponSave', 'sanitizePlaySave', 'sanitizeConfluenceSave']);
  const clean = c.sanitizeBranchSave({
    xp: 12.7,
    unlocks: { prism: 3, conduit: 9, bogus: 2, focus: 1, cleave: 'x' },
    loadouts: { magic: ['prism', 'prism', 'volley', 'conduit', 'focus', 'impact'], bow: 'nope' },
  });
  assert.equal(clean.xp, 12);
  assert.deepEqual({ ...clean.unlocks }, { prism: 3, conduit: 3 });
  assert.deepEqual([...clean.loadouts.magic], ['prism', 'conduit', 'focus']);
  assert.deepEqual([...clean.loadouts.bow], []);
  assert.deepEqual([...clean.loadouts.melee], []);
  const empty = c.sanitizeBranchSave(null);
  assert.equal(empty.xp, 0);
  assert.equal(empty.element, null);
  assert.equal(c.sanitizeBranchSave({ element: 'ice' }).element, 'ice');
  assert.equal(c.sanitizeBranchSave({ element: '<b>' }).element, null);
  assert.deepEqual([...c.sanitizeBranchSave({ elements: ['fire', 'Fire', 7, 'gas'] }).elements], ['fire', 'gas']);
  assert.deepEqual([...empty.elements], []);
  assert.equal(empty.guided, false, 'the first-visit tour has not run');
  assert.equal(c.sanitizeBranchSave({ guided: true }).guided, true);
  assert.equal(c.sanitizeBranchSave({ guided: 'yes' }).guided, false);
});

test('the element picker shows every element, picks only unlocked ones and skips locked cards', () => {
  const c = branchContext();
  loadFunctions(c, 'gameui.js', ['elementCardBounds', 'elementPickerSlots', 'moveElementFocus', 'confirmElementChoice',
    'handleElementKey', 'handleElementPointer', 'pointInBounds']);
  vm.runInContext(`var keys = {}, mode = 'playing', messages = [], VIEW_W = 960, VIEW_H = 540;
    var clock = 10000; performance = { now: () => clock };
    suppressHeldAttackInput = addParticles = playSound = updateHud = saveRunState = resetChargeState = () => {};
    showMessage = (text) => messages.push(text);`, c);
  for (const element of ['spore', 'ice']) c.magicElements.add(element);
  assert.equal(c.openElementChoice('start'), true);
  assert.equal(c.elementPickerSlots().length, 8);
  const fire = c.elementPickerSlots().findIndex((slot) => slot.element === 'fire');
  assert.equal(c.elementPickerSlots()[fire].unlocked, false);
  const bounds = c.elementCardBounds(7);
  assert.ok(bounds.x + bounds.width <= 960 && bounds.y + bounds.height <= 430, 'cards fit above the hint');

  const fireBounds = c.elementCardBounds(fire);
  Object.assign(c.pointer, { x: fireBounds.x + 5, y: fireBounds.y + 5 });
  c.handleElementPointer();
  assert.equal(peek(c, 'mode'), 'element', 'a locked card does nothing but explain itself');
  assert.match(c.messages.at(-1), /Fire is locked/);

  c.moveElementFocus(1);
  assert.equal(peek(c, 'elementChoices')[peek(c, 'elementFocus')], 'spore', 'focus skips locked fire, lightning and gas');
  c.moveElementFocus(1);
  assert.equal(peek(c, 'elementChoices')[peek(c, 'elementFocus')], 'ice');
  c.moveElementFocus(1);
  assert.equal(peek(c, 'elementChoices')[peek(c, 'elementFocus')], 'bubble', 'wraps around');
  c.handleElementKey({ key: '6' }, '6');
  assert.equal(peek(c, 'mode'), 'element', 'the open guard swallows an instant keypress');
  c.clock += 400;
  c.handleElementKey({ key: '6' }, '6');
  assert.equal(peek(c, 'activeMagicElement'), 'ice', 'number keys follow card order');
  assert.equal(peek(c, 'mode'), 'playing');
  assert.equal(c.save.branches.element, 'ice', 'the choice is remembered on the profile');
});

function abilityPickerContext() {
  const c = branchContext();
  loadFunctions(c, 'gameui.js', ['abilitySlotBounds', 'confirmAbilityChoice', 'skipAbilityChoice', 'handleAbilityKey',
    'handleAbilityPointer', 'pointInBounds']);
  vm.runInContext(`var keys = {}, mode = 'playing', messages = [], granted = [], VIEW_W = 960, VIEW_H = 540;
    var clock = 10000; performance = { now: () => clock };
    suppressHeldAttackInput = addParticles = playSound = updateHud = saveRunState = () => {};
    showMessage = (text) => messages.push(text);
    isUpgradeAvailable = (item) => !item.locked;
    grantUpgrade = (item) => { ownedItems.add(item.id); granted.push(item.id); return true; };
    weaponHands = { main: 'magic', off: 'blade' };`, c);
  const mod = (id, style, extra = {}) => ({ id, name: id, description: `${style}: does a thing`, kind: 'mod', style, ...extra });
  c.shopItemCatalog.push(
    mod('mod-windup', 'melee'), mod('mod-flurry', 'melee'), mod('mod-cinder', 'melee', { locked: true }),
    mod('mod-pierce', 'bow'), mod('mod-draw', 'bow'), mod('mod-quiver', 'bow'), mod('mod-storm-arrows', 'bow'),
    mod('mod-splash', 'magic'), mod('mod-chain', 'magic'), mod('mod-lingering', 'magic'),
    { id: 'spore-bloom', name: 'Spore Bloom', description: 'Magic shots split', kind: 'ability' },
  );
  c.save.discoveredItemIds = ['mod-windup', 'mod-pierce', 'mod-chain', 'mod-cinder'];
  return c;
}

const focusedSlot = (c) => peek(c, 'abilitySlots[abilityFocus]');
const slotName = (slot) => slot.item?.id || slot.kind;

test('the run-start ability picker lists found abilities by weapon, plus Random and Skip', () => {
  const c = abilityPickerContext();
  const slots = c.startAbilitySlots();
  assert.deepEqual([...slots.map(slotName)], ['mod-windup', 'mod-pierce', 'mod-chain', 'random', 'skip'],
    'only found, unlocked abilities; locked Cinder and unfound Flurry stay hidden');
  assert.deepEqual([...slots.slice(0, 3).map((slot) => slot.column)], [0, 1, 2], 'Blade, Bow and Magic columns');
  for (const slot of slots) {
    const bounds = c.abilitySlotBounds(slot);
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 960 && bounds.y + bounds.height <= 460, `${slotName(slot)} fits`);
  }

  assert.equal(c.openAbilityChoice(), true);
  assert.equal(peek(c, 'mode'), 'ability');
  assert.equal(slotName(focusedSlot(c)), 'mod-windup');
  c.moveAbilityFocus(1);
  assert.equal(slotName(focusedSlot(c)), 'mod-pierce');
  c.moveAbilityFocus(1);
  assert.equal(slotName(focusedSlot(c)), 'mod-chain');
  c.moveAbilityFocus(0, 1);
  assert.equal(slotName(focusedSlot(c)), 'skip', 'down from Magic reaches Skip under it');
  c.moveAbilityFocus(-1);
  assert.equal(slotName(focusedSlot(c)), 'random');
  c.moveAbilityFocus(0, -1);
  assert.equal(slotName(focusedSlot(c)), 'mod-pierce');

  c.handleAbilityKey({ key: 'Enter' }, 'enter');
  assert.equal(peek(c, 'mode'), 'ability', 'the open guard swallows an instant keypress');
  c.clock += 400;
  c.handleAbilityKey({ key: 'Enter' }, 'enter');
  assert.equal(peek(c, 'mode'), 'playing');
  assert.deepEqual([...c.granted], ['mod-pierce']);
  assert.deepEqual([...c.save.branches.loadouts.bow], ['piercer'], 'its branch lights up');
  assert.equal(c.itemActive('mod-pierce', 'bow'), true);
  assert.deepEqual({ ...peek(c, 'weaponHands') }, { main: 'bow', off: 'magic' }, 'the bow goes in hand, magic moves to the off hand');
  assert.equal(c.save.branches.startAbility, 'mod-pierce', 'remembered for next run');
  assert.match(c.messages.at(-1), /Piercer branch on\. Bow in hand\./);
});

test('a full weapon swaps its last branch for the pick; the last pick is focused first; Escape skips', () => {
  const c = abilityPickerContext();
  for (const id of ['cleave', 'flurry', 'riposte']) c.toggleBranch(id);
  c.save.branches.startAbility = 'mod-windup';
  c.openAbilityChoice();
  assert.equal(slotName(focusedSlot(c)), 'mod-windup', 'the remembered pick is focused');
  c.clock += 400;
  const bounds = c.abilitySlotBounds(focusedSlot(c));
  Object.assign(c.pointer, { x: bounds.x + 4, y: bounds.y + 4 });
  c.handleAbilityPointer();
  assert.deepEqual([...c.save.branches.loadouts.melee], ['cleave', 'flurry', 'windup']);
  assert.match(c.messages.at(-1), /Wind-Up replaces Riposte/);
  assert.equal(peek(c, 'weaponHands.main'), 'blade', 'the blade in the off hand swaps into the main hand');

  c.openAbilityChoice();
  c.clock += 400;
  c.handleAbilityKey({ key: 'Escape' }, 'escape');
  assert.equal(peek(c, 'mode'), 'playing');
  assert.deepEqual([...c.granted], ['mod-windup'], 'Skip grants nothing');

  const bare = abilityPickerContext();
  bare.save.discoveredItemIds = [];
  for (const item of bare.shopItemCatalog) item.locked = true;
  assert.equal(bare.openAbilityChoice(), false, 'nothing found and nothing to roll: no picker');
  assert.equal(peek(bare, 'mode'), 'playing');
});

test('the Random card rolls an ability that suits the run element on any weapon, even one not found yet', () => {
  const c = abilityPickerContext();
  assert.deepEqual([...c.randomStartAbilityPool('fire').map((item) => item.id)], ['mod-draw', 'mod-splash'],
    'fire suits Cinder, Longbow Draw and Impact Core; locked Cinder is left out');
  assert.deepEqual([...c.randomStartAbilityPool('spore').map((item) => item.id)], ['mod-flurry', 'mod-pierce'],
    'Spore Bloom unlocks a class, so it must be found for real first');
  c.save.discoveredItemIds.push('spore-bloom');
  assert.ok(c.randomStartAbilityPool('spore').some((item) => item.id === 'spore-bloom'));
  for (const element of Object.keys(peek(c, 'magicElementPalette'))) {
    const affinity = peek(c, 'ELEMENT_ABILITY_AFFINITY')[element];
    assert.ok(affinity, `${element} has abilities`);
    for (const style of ['melee', 'bow', 'magic']) {
      assert.equal(c.startAbilityStyle(c.shopItemCatalog.find((item) => item.id === affinity[style])), style);
    }
  }

  c.activeMagicElement = 'fire';
  c.magicElements.add('fire');
  vm.runInContext('Math.random = () => 0.99', c);
  c.openAbilityChoice();
  c.clock += 400;
  const random = peek(c, 'abilitySlots').findIndex((slot) => slot.kind === 'random');
  c.confirmAbilityChoice(random);
  assert.deepEqual([...c.granted], ['mod-splash'], 'an unfound Impact Core can be rolled');
  assert.deepEqual([...c.save.branches.loadouts.magic], ['impact']);
  assert.match(c.messages.at(-1), /^The element chose mod-splash/);
  assert.equal(c.abilitySuitsElement({ id: 'mod-splash', style: 'magic' }, 'fire'), true);
  assert.equal(c.abilitySuitsElement({ id: 'mod-chain', style: 'magic' }, 'fire'), false);
});

test('the starting ability pick is kept on the profile only as a known id', () => {
  const c = branchContext();
  loadFunctions(c, 'dbmanager.js', ['sanitizeBranchSave', 'sanitizeWeaponSave', 'sanitizePlaySave', 'sanitizeConfluenceSave']);
  assert.equal(c.sanitizeBranchSave({ startAbility: 'mod-pierce' }).startAbility, 'mod-pierce');
  assert.equal(c.sanitizeBranchSave({ startAbility: '<img>' }).startAbility, null);
  assert.equal(c.sanitizeBranchSave(null).startAbility, null);
});
function branchMapContext() {
  const c = branchContext();
  loadBetween(c, 'gameui.js', '// ---- Weapon branch screen', 'function boonCardBounds(index) {');
  vm.runInContext(`var VIEW_W = 960, VIEW_H = 540, clock = 0, sounds = 0;
    performance = { now: () => clock };
    playSound = () => { sounds += 1; };
    actionForKey = () => null;
    function pointInBounds(bounds, x, y) {
      return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
    }
    branchTab = 'magic';
    resetBranchMap();`, c);
  return c;
}

const screenOf = (c, id) => {
  const node = c.branchMapNode(id);
  return c.branchWorldToScreen(node.x, node.y);
};

test('each weapon map has a heart, three-node paths per branch and a synergy gem between partners', () => {
  const c = branchMapContext();
  for (const style of ['melee', 'bow', 'magic']) {
    const nodes = c.branchMapNodes(style);
    const branches = peek(c, 'skillBranches').filter((branch) => branch.style === style);
    const synergies = peek(c, 'branchSynergies').filter((synergy) => synergy.style === style);
    const weapons = peek(c, 'weaponCatalog').filter((entry) => entry.family === style && !entry.base);
    assert.equal(nodes.length, 2 + branches.length * 3 + synergies.length + weapons.length, `${style}: heart, grip, paths, gems and weapons`);
    assert.deepEqual([...c.branchMapNode('grip', style).links], ['heart']);
    assert.equal(nodes.filter((node) => node.kind === 'weapon').length, weapons.length, 'every weapon is on its map, found or not');
    for (const branch of branches) {
      assert.deepEqual([...c.branchMapNode(`${branch.id}:1`, style).links], ['heart']);
      assert.deepEqual([...c.branchMapNode(`${branch.id}:3`, style).links], [`${branch.id}:2`]);
    }
    for (const synergy of synergies) {
      const gem = c.branchMapNode(`syn:${synergy.id}`, style);
      assert.deepEqual([...gem.links].map((id) => id.split(':')[0]), [...synergy.branches]);
    }
    const everyNode = c.allBranchMapNodes(style);
    for (const [index, a] of everyNode.entries()) {
      for (const b of everyNode.slice(index + 1)) {
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 44, `${style}: ${a.id} and ${b.id} overlap`);
      }
    }
  }
  const outer = [...c.branchMapNodes('melee')].filter((node) => node.outer).map((node) => node.id);
  assert.deepEqual(outer, ['syn:ember-dance'], 'only Flurry + Cinder reaches around another branch');
});

test('walking the map moves the character node to node, and on/off and grow act on the branch underfoot', () => {
  const c = branchMapContext();
  c.toggleFocusedBranch();
  assert.match(peek(c, 'branchNotice'), /already in your main hand/, 'on the heart, on/off picks the main hand');
  c.moveBranchMapFocus(0, -1);
  assert.equal(peek(c, 'branchMapFocus'), 'prism:1', 'up from the heart walks onto the top branch');
  assert.equal(peek(c, 'branchToken').t, 0, 'the character starts walking');
  c.moveBranchMapFocus(0, -1);
  assert.equal(peek(c, 'branchMapFocus'), 'prism:2');
  c.toggleFocusedBranch();
  assert.deepEqual([...c.save.branches.loadouts.magic], ['prism']);
  c.save.branches.xp = 100;
  peek(c, 'materials').ironOre = 4;
  c.unlockFocusedBranch();
  assert.equal(c.branchTier('prism'), 2);
  assert.equal(peek(c, 'branchMapFocus'), 'prism:2');
  c.moveBranchMapFocus(0, 1);
  c.moveBranchMapFocus(0, 1);
  assert.equal(peek(c, 'branchMapFocus'), 'heart');
  c.handleBranchKey({ key: 'e' }, 'e');
  assert.equal(peek(c, 'branchTab'), 'confluence', 'Q/E change tab now that A/D walk; Magic is followed by the Confluence');
  c.handleBranchKey({ key: 'e' }, 'e');
  assert.equal(peek(c, 'branchTab'), 'melee', 'and the tabs wrap around');
  assert.equal(peek(c, 'branchMapFocus'), 'heart');
});

test('tapping a node focuses it, dragging pans without selecting, and pinch or wheel zoom around the fingers', () => {
  const c = branchMapContext();
  const fit = peek(c, 'branchCam').zoom;
  assert.ok(fit >= 0.6, 'the fitted map stays readable on a phone');
  const conduit = screenOf(c, 'conduit:1');
  c.handleBranchPointerDown(1, conduit.x, conduit.y);
  c.handleBranchPointerUp(1, conduit.x + 2, conduit.y + 2);
  assert.equal(peek(c, 'branchMapFocus'), 'conduit:1');

  const before = { ...peek(c, 'branchCam') };
  const focus = screenOf(c, 'focus:1');
  c.handleBranchPointerDown(2, focus.x, focus.y);
  c.handleBranchPointerMove(2, focus.x - 60, focus.y - 30);
  c.handleBranchPointerUp(2, focus.x - 60, focus.y - 30);
  assert.equal(peek(c, 'branchMapFocus'), 'conduit:1', 'a drag never selects');
  assert.ok(Math.abs(peek(c, 'branchCam').x - (before.x + 60 / fit)) < 1e-9);
  assert.ok(Math.abs(peek(c, 'branchCam').y - (before.y + 30 / fit)) < 1e-9);

  const anchor = c.branchScreenToWorld(300, 260);
  c.handleBranchPointerDown(3, 260, 260);
  c.handleBranchPointerDown(4, 340, 260);
  c.handleBranchPointerMove(3, 220, 260);
  c.handleBranchPointerMove(4, 380, 260);
  assert.ok(Math.abs(peek(c, 'branchCam').zoom - fit * 2) < 1e-9, 'spreading two fingers doubles the zoom');
  const after = c.branchScreenToWorld(300, 260);
  assert.ok(Math.hypot(after.x - anchor.x, after.y - anchor.y) < 1e-6, 'the point between the fingers stays put');
  c.handleBranchPointerUp(3, 220, 260);
  c.handleBranchPointerUp(4, 380, 260);
  assert.equal(peek(c, 'branchMapFocus'), 'conduit:1', 'lifting after a pinch is not a tap');

  for (let i = 0; i < 20; i += 1) c.handleBranchWheel(1, 300, 260);
  assert.equal(peek(c, 'branchCam').zoom, peek(c, 'BRANCH_ZOOM_MIN'));
  c.handleBranchKey({ key: '0' }, '0');
  assert.equal(peek(c, 'branchCam').zoom, fit);
});

test('the side buttons act on the focused branch and the socket bar jumps to highlighted branches', () => {
  const c = branchMapContext();
  const layout = c.branchMapLayout();
  const press = (bounds) => {
    c.handleBranchPointerDown(9, bounds.x + 4, bounds.y + 4);
    c.handleBranchPointerUp(9, bounds.x + 4, bounds.y + 4);
  };
  c.focusBranchNode('impact:1');
  press(layout.toggle);
  assert.deepEqual([...c.save.branches.loadouts.magic], ['impact']);
  press(layout.unlock);
  assert.match(peek(c, 'branchNotice'), /needs 30 career XP \(you have 0\)/);
  assert.deepEqual({ ...peek(c, 'branchGuide').rect }, { ...peek(c, 'BRANCH_GUIDE_RECTS').status },
    'the spotlight points at the XP readout');
  c.save.branches.xp = 30;
  press(layout.unlock);
  assert.match(peek(c, 'branchNotice'), /costs 3 Iron Ore\. Ore and crystals come from your pouch/);
  assert.match(peek(c, 'branchGuide').label, /need 3 Iron Ore/, 'and names what is missing');
  c.focusBranchNode('heart');
  press(layout.sockets[0]);
  assert.equal(peek(c, 'branchMapFocus'), 'impact:1');
  press(layout.zoomIn);
  assert.ok(peek(c, 'branchCam').zoom > c.branchMapFitZoom());
  press(layout.tabs[1].bounds);
  assert.equal(peek(c, 'branchTab'), 'bow');
  assert.ok(layout.toggle.x >= 662 && layout.unlock.x + layout.unlock.width <= 918, 'buttons stay inside the info panel');
  for (const bounds of [layout.zoomOut, layout.zoomIn, layout.fit, ...layout.sockets]) {
    assert.ok(c.pointInBounds(peek(c, 'BRANCH_MAP_VIEW'), bounds.x, bounds.y + bounds.height), 'map buttons sit inside the map');
  }
});

test('the first visit runs a tap-through tour once, and failures spotlight what is needed', () => {
  const c = branchMapContext();
  c.startBranchTour();
  assert.ok(c.branchTourActive());
  assert.equal(peek(c, 'branchGuide').node, 'heart', 'the tour starts on your character');
  const steps = peek(c, 'branchTour').steps.length;
  const toggle = c.branchMapLayout().toggle;
  c.focusBranchNode('prism:1');
  for (let i = 1; i < steps; i += 1) {
    c.handleBranchPointerDown(1, toggle.x + 4, toggle.y + 4);
    c.handleBranchPointerUp(1, toggle.x + 4, toggle.y + 4);
  }
  assert.deepEqual([...c.save.branches.loadouts.magic], [], 'taps during the tour only move it on');
  c.handleBranchKey({ key: 'Enter' }, 'enter');
  assert.equal(c.branchTourActive(), false);
  assert.equal(c.save.branches.guided, true, 'remembered, so it shows once');
  assert.equal(peek(c, 'branchGuide'), null);
  c.startBranchTour();
  assert.equal(c.branchTourActive(), false);

  c.save.branches.guided = false;
  c.startBranchTour();
  c.handleBranchKey({ key: 'Escape' }, 'escape');
  assert.equal(c.branchTourActive(), false, 'Escape skips it');
  assert.equal(c.save.branches.guided, true);

  c.focusBranchNode('prism:1');
  c.toggleFocusedBranch();
  assert.equal(peek(c, 'branchGuide').rect, peek(c, 'BRANCH_GUIDE_RECTS').needs, 'a dormant branch points at its item');
  for (const id of ['conduit', 'focus']) c.toggleBranch(id);
  c.focusBranchNode('impact:1');
  c.toggleFocusedBranch();
  assert.equal(peek(c, 'branchGuide').rect, peek(c, 'BRANCH_GUIDE_RECTS').sockets, 'full slots point at the socket bar');
  c.handleBranchKey({ key: 'w' }, 'w');
  assert.equal(peek(c, 'branchGuide'), null, 'any input dismisses the spotlight');
});
test('level-ups queue a boon that opens only once the room is clear, and taking it resumes play', () => {
  const c = branchContext();
  vm.runInContext(`
    XP_PER_LEVEL = () => 10; xpPoints = 0; xpLevel = 1; deathTimer = 0; showMap = false; showStoryJournal = false;
    streakCallout = { timer: 0, duration: 1 }; keys = { w: true }; blanksHeld = 0;
    suppressHeldAttackInput = () => {};
  `, c);
  c.player.hp = 3;
  c.player.maxHp = 8;
  c.enemies.push({ hp: 5 });
  c.gainXp(12);
  assert.equal(peek(c, 'pendingBoonPicks'), 1);
  assert.equal(c.save.branches.xp, 12, 'gems also feed persistent branch XP');
  assert.equal(c.boonChoiceReady(), false, 'never interrupts a fight');
  c.enemies.length = 0;
  assert.equal(c.boonChoiceReady(), true);
  c.openBoonChoice();
  assert.equal(peek(c, 'mode'), 'boon');
  const choices = peek(c, 'boonChoices');
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map((boon) => boon.id)).size, 3);
  assert.equal(peek(c, 'keys').w, false, 'held movement is released');
  const might = choices.findIndex((boon) => boon.id === 'might');
  const before = c.player.damage;
  assert.equal(c.chooseBoon(Math.max(0, might)), true);
  if (might >= 0) assert.equal(c.player.damage, before + 1);
  assert.equal(peek(c, 'mode'), 'playing');
  assert.equal(peek(c, 'pendingBoonPicks'), 0);
  assert.equal(peek(c, 'boonChoices'), null);
});

test('the branch action has a default key and a free pad button, and touch exposes a Build button', () => {
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const entry = game.match(/\{ id: 'branches'[^}]*\}/)?.[0] || '';
  assert.match(entry, /key: 'b'/);
  assert.match(entry, /pad: 12/);
  const pads = [...game.slice(game.indexOf('const bindingActions'), game.indexOf('const reservedKeys'))
    .matchAll(/pad: (\d+)/g)].map((match) => Number(match[1]));
  assert.equal(pads.filter((pad) => pad === 12).length, 1, 'D-pad up is not shared with another action');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /data-touch-action="branches"/);
});

test('landscape phones keep the menu and item buttons in side gutters outside the game view', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const landscape = css.slice(css.indexOf('@media (orientation: landscape)'));
  assert.match(landscape, /--touch-gutter: \d+px/);
  assert.match(landscape, /100vw[^;]*2 \* var\(--touch-gutter\)/, 'the 16:9 view shrinks to leave both gutters');
  assert.match(landscape, /\.touch-utilities \{ right: calc\(100% \+ \d+px\); \}/);
  assert.match(landscape, /\.touch-quick-actions \{ left: calc\(100% \+ \d+px\); \}/);
});

test('Dash sits north-east of Attack, Bomb and Wave on an arc, Pause on the right, and mouse players get side columns', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const aimZone = html.slice(html.indexOf('id="touch-aim-zone"'), html.indexOf('class="touch-utilities"'));
  for (const action of ['dash', 'bomb', 'shock']) {
    assert.match(aimZone, new RegExp(`class="touch-round[^"]*" type="button" data-touch-action="${action}"`));
  }
  assert.doesNotMatch(html, /data-touch-action="(interact|withdraw)"/, 'Attack doubles as Use and the shop pads handle the bank');
  const menus = html.slice(html.indexOf('class="touch-utilities"'), html.indexOf('class="touch-quick-actions"'));
  const quick = html.slice(html.indexOf('class="touch-quick-actions"'), html.indexOf('id="side-menu"'));
  assert.doesNotMatch(menus, /data-touch-action="pause"/);
  assert.match(quick, /data-touch-action="pause"/, 'touch Pause is in the right-hand column');
  assert.doesNotMatch(quick, /data-touch-action="(bomb|shock)"/);
  const left = html.slice(html.indexOf('id="side-menu"'), html.indexOf('id="side-menu-right"'));
  const right = html.slice(html.indexOf('id="side-menu-right"'));
  for (const action of ['map', 'journal', 'branches', 'ability']) {
    assert.match(left, new RegExp(`data-side-action="${action}"`));
  }
  assert.doesNotMatch(left, /data-side-action="pause"/);
  assert.match(right, /data-side-action="pause"/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const offset = (name) => {
    const match = css.match(new RegExp(`\\.touch-arc-${name} \\{ --arc-x: (-?[\\d.]+)px; --arc-y: (-?[\\d.]+)px; \\}`));
    return { x: Number(match[1]), y: Number(match[2]) };
  };
  // A negative x offset moves a button right of Attack and a positive y moves it up.
  const dash = offset('dash');
  assert.ok(dash.x < 0 && dash.y > 0, 'Dash is up and to the right of Attack');
  const arc = [offset(2), offset(3)];
  for (const point of arc) assert.ok(Math.abs(Math.hypot(point.x, point.y) - 100) < 0.5);
  for (const [a, b] of [[arc[0], arc[1]], [dash, arc[0]], [dash, arc[1]]]) {
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 46, 'round buttons never overlap');
  }
});

test('the pause screen has tappable Resume and Save & exit buttons that do not overlap', () => {
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const c = vm.createContext({ VIEW_W: 960, VIEW_H: 540 });
  vm.runInContext(game.slice(game.indexOf('function pauseButtonBounds'), game.indexOf('function resumeGame')), c);
  const resume = c.pauseButtonBounds('resume');
  const exit = c.pauseButtonBounds('exit');
  assert.ok(resume.x + resume.width < exit.x);
  assert.ok(resume.height >= 44, 'big enough for a thumb');
  assert.ok(resume.y > 154 && resume.y + resume.height < 400, 'inside the pause panel');
  assert.match(game, /pointInBounds\(pauseButtonBounds\('resume'\)\)\) resumeGame\(\)/);
  assert.match(game, /pointInBounds\(pauseButtonBounds\('exit'\)\)\) exitToTitle\(\)/);
});

test('play style is recorded per family, halves when large, and survives a save round trip', () => {
  const c = branchContext();
  loadFunctions(c, 'dbmanager.js', ['sanitizePlaySave']);
  for (let i = 0; i < 9; i += 1) c.recordPlaystyle('melee', true);
  for (let i = 0; i < 3; i += 1) c.recordPlaystyle('melee', false);
  c.recordPlaystyle('bow', false);
  c.recordPlaystyle('nonsense', true);
  assert.equal(c.playstyleLeader(), 'melee');
  assert.ok(Math.abs(c.playstyleShare('melee') - 12 / 13) < 1e-9);
  assert.equal(c.playstyleChargeRatio('melee'), 0.75);
  assert.equal(c.playstyleChargeRatio('bow'), null, 'too few attacks to judge');
  const play = c.save.branches.play;
  play.magic.use = peek(c, 'PLAYSTYLE_HALVE_AT');
  c.recordPlaystyle('magic', false);
  assert.equal(play.magic.use, Math.floor((peek(c, 'PLAYSTYLE_HALVE_AT') + 1) / 2), 'old play fades so recent runs count most');
  const clean = c.sanitizePlaySave({ melee: { use: 5.9, charge: -3, tap: 'x' }, junk: {} });
  assert.deepEqual(JSON.parse(JSON.stringify(clean)),
    { melee: { use: 5, charge: 0, tap: 0 }, bow: { use: 0, charge: 0, tap: 0 }, magic: { use: 0, charge: 0, tap: 0 } });
});

test('the suggested path follows play style but never blocks other choices', () => {
  const c = branchContext();
  const path = c.suggestedPath('melee');
  assert.equal(path.length, 3);
  assert.ok(path.every((step) => step.kind === 'tier' && step.reason));
  for (let i = 0; i < 30; i += 1) c.recordPlaystyle('melee', true);
  assert.equal(c.suggestedPath('melee')[0].id, 'windup', 'holding to charge suggests the charge branch');
  c.save.branches.play.melee = { use: 30, charge: 0, tap: 30 };
  assert.equal(c.suggestedPath('melee')[0].id, 'flurry', 'quick taps suggest attack speed');
  c.toggleBranch('riposte');
  c.save.branches.unlocks.riposte = 2;
  const steps = c.suggestedPath('melee').map((step) => step.mapId);
  assert.ok(steps.includes('riposte:3'), 'what you highlight and grow is built on');
  assert.equal(new Set(steps).size, steps.length, 'each step is a different node');
  c.save.branches.xp = 999;
  peek(c, 'materials').ironOre = 3;
  assert.equal(c.unlockBranchTier('cleave'), 'unlocked', 'an unsuggested branch can still be grown');

  const cf = c.suggestedPath('confluence');
  assert.equal(cf[0].kind, 'tier', 'with no bridge open, it first leads to a bridge end');
  assert.equal(cf[0].mapId, 'melee/cleave:3');
  assert.ok(cf.slice(1).every((step) => step.id.startsWith('cf:edge-string:')), 'then walks the bridge it opened');
  assert.ok(cf[0].mapId.startsWith('melee/') || cf[0].mapId.startsWith('bow/') || cf[0].mapId.startsWith('magic/'));
  for (const id of ['cleave', 'stormstring']) c.save.branches.unlocks[id] = 3;
  const bridge = c.suggestedPath('confluence');
  assert.equal(bridge[0].kind, 'confluence');
  assert.ok(bridge[0].id.startsWith('cf:edge-string:'), 'an open bridge is walked');
});
