const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, peek } = require('./helpers/combat');
const { loadFunctions, loadBetween } = require('./helpers/load');

function gridContext() {
  const c = combat({ skillPrerequisitesOpen: false });
  c.save.branches = c.createBranchState();
  c.save.bankedZeny = 0;
  c.persistSave = () => {};
  c.persistBankedZeny = (balance) => { c.save.bankedZeny = balance; return true; };
  return c;
}

function payFor(c, cost) {
  c.branchState().xp = c.growthXpRequirement();
  Object.assign(peek(c, 'materials'), { ironOre: 0, darkCrystal: 0, lifeStone: 0 });
  c.save.bankedZeny = cost.zeny || 0;
  for (const [key, amount] of Object.entries(cost)) if (key !== 'zeny') peek(c, 'materials')[key] = amount;
}

function prerequisite(c, kind, id, tier = null) {
  return c.skillStatNodes().find((node) => node.target.kind === kind && node.target.id === id && node.tier === tier);
}

test('every paid branch tier requires a reachable stat fork, with no free ability bypass', () => {
  for (const branch of peek(gridContext(), 'skillBranches')) {
    const c = gridContext();
    const first = prerequisite(c, 'tier', branch.id, 1);
    if (first) {
      payFor(c, first.cost);
      assert.equal(c.upgradeSkillStat(first.id), 'upgraded');
    }
    for (const tier of [2, 3]) {
      const stats = c.skillStatNodes().filter((node) => node.target.kind === 'tier' &&
        node.target.id === branch.id && node.tier === tier);
      assert.ok(stats.length >= 2, `${branch.id} ${tier}: multiple stat routes`);
      payFor(c, c.branchTierCost(branch.id, tier));
      assert.equal(c.unlockBranchTier(branch.id), 'locked', 'an affordable ability is still gated by a stat');
      payFor(c, stats[0].cost);
      assert.equal(c.upgradeSkillStat(stats[0].id), 'upgraded');
      assert.equal(c.hasSkillStatPrerequisite('tier', branch.id, tier), true);
      payFor(c, c.branchTierCost(branch.id, tier));
      assert.equal(c.unlockBranchTier(branch.id), 'unlocked');
      assert.equal(c.branchTier(branch.id), tier);
    }
  }
});

test('Build never advertises an unaffordable upgrade, and its recommended node can be purchased immediately', () => {
  const c = gridContext();
  c.branchState().xp = c.growthXpRequirement();
  assert.equal(c.hasAffordableSkillGrowth(), false);
  assert.equal(c.affordableSkillGrowth(), null);
  peek(c, 'materials').lifeStone = 99;
  assert.equal(c.hasAffordableSkillGrowth(), false, 'stones alone cannot bypass the first stat runes');
  peek(c, 'materials').darkCrystal = 1;
  c.branchState().xp -= 1;
  assert.equal(c.hasAffordableSkillGrowth(), false);
  c.branchState().xp += 1;
  const offered = c.affordableSkillGrowth();
  assert.equal(offered.kind, 'stat');
  assert.equal(c.upgradeSkillStat(offered.id), 'upgraded', 'the recommended upgrade really succeeds');
  assert.equal(peek(c, 'materials').darkCrystal, 0);
  assert.equal(c.hasAffordableSkillGrowth(), false, 'the rising XP gate is checked after buying');
});

test('even first-tier abilities require a stat rune before activation; basic weapon attacks stay available', () => {
  const c = gridContext();
  for (const id of ['focus', 'volley', 'miasma', 'windup', 'cinder', 'longdraw']) {
    const branch = c.branchById(id);
    for (const item of branch.items) c.ownedItems.add(item);
    assert.equal(c.toggleBranch(id), 'locked', id);
    assert.equal(c.branchTechniqueReady(branch), false);
    const stat = prerequisite(c, 'tier', id, 1);
    payFor(c, stat.cost);
    assert.equal(c.upgradeSkillStat(stat.id), 'upgraded');
    assert.equal(c.branchTechniqueReady(branch), true);
    assert.equal(c.toggleBranch(id), 'on');
  }
  assert.equal(c.styleUnlocked('magic'), true);
  assert.equal(c.styleUnlocked('bow'), true);
  assert.equal(c.styleUnlocked('melee'), true);
});

test('damage, attack-speed and magic stat investments steer affordable route suggestions', () => {
  for (const style of ['melee', 'bow', 'magic']) {
    const c = gridContext();
    const chosen = c.skillStatNodes().find((node) => node.style === style &&
      node.target.kind === 'tier' && c.skillStatReachable(node));
    payFor(c, chosen.cost);
    assert.equal(c.upgradeSkillStat(chosen.id), 'upgraded');
    c.branchState().xp = c.growthXpRequirement();
    Object.assign(peek(c, 'materials'), { ironOre: 100, darkCrystal: 100, lifeStone: 100 });
    c.save.bankedZeny = 100;
    const offered = c.affordableSkillGrowth();
    assert.equal(c.skillStatNodes().find((node) => node.id === offered.id).style, style);
  }
});

test('suggested ability routes start with the first-tier stat, not an unreachable later fork', () => {
  const c = gridContext();
  for (let i = 0; i < 30; i += 1) c.recordPlaystyle('magic', true);
  const path = c.suggestedPath('magic');
  assert.equal(path[0].kind, 'stat');
  const first = c.skillStatNodes().find((node) => node.id === path[0].id);
  assert.equal(first.target.id, 'focus');
  assert.equal(first.tier, 1);
  assert.equal(c.skillStatReachable(first), true);
  assert.equal(path[1].kind, 'stat');
  assert.equal(c.skillStatNodes().find((node) => node.id === path[1].id).tier, 2);
  assert.equal(path[2].mapId, 'focus:2');
});

test('stat runes apply real weapon-specific bonuses without activating an ability or unlocking an element', () => {
  const c = gridContext();
  for (const style of ['melee', 'bow', 'magic']) {
    const node = c.skillStatNodes().find((entry) => entry.style === style && entry.target.kind === 'tier' &&
      c.skillStatReachable(entry) && (style === 'melee' ? entry.fx.damage : style === 'bow' ? entry.fx.rate : entry.fx.moveSpeed));
    payFor(c, node.cost);
    assert.equal(c.upgradeSkillStat(node.id), 'upgraded');
  }
  assert.equal(c.branchEffects('melee').damage, 1.04);
  assert.equal(c.branchEffects('bow').rate, 0.97);
  assert.equal(c.branchEffects('magic').moveSpeed, 1.01);
  assert.equal(c.baseGroundSpeed(), c.player.speed * 1.01, 'Stride actually changes character movement');
  assert.equal(c.branchEffects('magic').damage, 1);
  assert.equal(c.branchEffects('bow').damage, 1);
  assert.deepEqual([...c.magicElements], ['bubble']);
  assert.deepEqual([...c.branchLoadout('magic')], []);
});

test('magic splash stat has an exact chance boundary, only affects spells, and is capped', () => {
  const c = gridContext();
  const node = c.skillStatNodes().find((entry) => entry.fx.splashChance);
  payFor(c, node.cost);
  assert.equal(c.upgradeSkillStat(node.id), 'upgraded');
  const primary = { x: 100, y: 100, radius: 10, hp: 100 };
  c.enemies.push(primary);
  c.Math.random = () => 0.019;
  const spell = { type: 'tear', x: 100, y: 100, damage: 1, element: 'bubble' };
  c.applyMorphLanding(spell, primary);
  assert.equal(spell.explode, 36);
  c.Math.random = () => 0.02;
  const miss = { ...spell, explode: 0 };
  c.applyMorphLanding(miss, primary);
  assert.equal(miss.explode, 0, 'chance uses a strict threshold');
  c.Math.random = () => 0;
  const arrow = { ...spell, type: 'arrow', explode: 0 };
  c.applyMorphLanding(arrow, primary);
  assert.equal(arrow.explode, 0);
  c.skillStatState().push(...c.skillStatNodes().filter((entry) => entry.fx.splashChance &&
    !c.skillStatOwned(entry.id)).map((entry) => entry.id));
  c.Math.random = () => 0.3;
  const capped = { ...spell, explode: 0 };
  c.applyMorphLanding(capped, primary);
  assert.equal(capped.explode, 0, 'stacked splash chance cannot exceed 30%');
});

test('weapons, Dual Grip and every Confluence ability have stat prerequisites', () => {
  const c = gridContext();
  c.findWeapon('axe');
  for (const [kind, id, upgrade, cost] of [
    ['weapon', 'axe', () => c.learnWeapon('axe'), { lifeStone: 1 }],
    ['grip', 'grip', () => c.growDualGrip(), { lifeStone: 2 }],
  ]) {
    payFor(c, cost);
    assert.equal(upgrade(), 'locked');
    const stat = prerequisite(c, kind, id);
    payFor(c, stat.cost);
    assert.equal(c.upgradeSkillStat(stat.id), 'upgraded');
    payFor(c, cost);
    assert.equal(upgrade(), 'learned');
  }
  c.branchState().unlocks.cleave = 3;
  const seal = c.confluenceNode('cf:edge-string:g1');
  payFor(c, seal.cost);
  assert.equal(c.growConfluenceNode(seal.id), 'locked');
  const stat = prerequisite(c, 'confluence', seal.id);
  payFor(c, stat.cost);
  assert.equal(c.upgradeSkillStat(stat.id), 'upgraded');
  payFor(c, seal.cost);
  assert.equal(c.growConfluenceNode(seal.id), 'grown');
  for (const node of c.confluenceNodes()) {
    if (node.kind !== 'stat') assert.ok(prerequisite(c, 'confluence', node.id), node.id);
  }
});

test('stat respec refunds the exact price and cannot remove the only prerequisite of an unlocked tier', () => {
  const c = gridContext();
  const stat = prerequisite(c, 'tier', 'prism', 2);
  payFor(c, stat.cost);
  c.upgradeSkillStat(stat.id);
  c.weaponState().runes = 2;
  assert.equal(c.unweaveNode('stat', stat.id), 'done');
  assert.equal(c.skillStatOwned(stat.id), false);
  for (const [key, amount] of Object.entries(stat.cost)) {
    assert.equal(key === 'zeny' ? c.save.bankedZeny : peek(c, 'materials')[key], amount);
  }
  payFor(c, stat.cost);
  c.upgradeSkillStat(stat.id);
  payFor(c, c.branchTierCost('prism', 2));
  c.unlockBranchTier('prism');
  assert.equal(c.unweaveNode('stat', stat.id), 'blocked');
});

test('respec cannot orphan a later stat fork or a Confluence prerequisite', () => {
  const c = gridContext();
  const first = prerequisite(c, 'tier', 'focus', 1);
  const second = prerequisite(c, 'tier', 'focus', 2);
  payFor(c, first.cost);
  c.upgradeSkillStat(first.id);
  payFor(c, second.cost);
  c.upgradeSkillStat(second.id);
  c.weaponState().runes = 10;
  assert.equal(c.unweaveNode('stat', first.id), 'blocked');
  assert.equal(c.unweaveNode('stat', second.id), 'done');
  assert.equal(c.unweaveNode('stat', first.id), 'done');
  c.branchState().unlocks.cleave = 3;
  const bridgeStat = prerequisite(c, 'confluence', 'cf:edge-string:g1');
  payFor(c, bridgeStat.cost);
  c.upgradeSkillStat(bridgeStat.id);
  assert.equal(c.unweaveNode('tier', 'cleave'), 'blocked', 'the tier III root supports a bridge stat fork');
  assert.equal(c.unweaveNode('stat', bridgeStat.id), 'done');
  assert.equal(c.unweaveNode('tier', 'cleave'), 'done');
});

test('old saves reset tree upgrades but preserve career XP, resources and other unlocks; new saves round-trip', () => {
  const c = gridContext();
  loadFunctions(c, 'dbmanager.js', ['sanitizeBranchSave', 'sanitizeWeaponSave', 'sanitizePlaySave', 'sanitizeConfluenceSave']);
  const saved = {
    xp: 1000, unlocks: { prism: 3 }, loadouts: { magic: ['prism'] }, confluence: ['cf:trinity'],
    elements: ['fire'], element: 'fire', startAbility: 'mod-chain', guided: true, buildPromptSeen: true,
    weapons: { found: ['axe'], learned: ['axe'], grip: true, runes: 3, hands: { Mage: { main: 'axe', off: 'magic' } } },
  };
  const old = c.sanitizeBranchSave(saved);
  assert.equal(old.gridVersion, 1);
  assert.equal(old.xp, 1000);
  assert.deepEqual({ ...old.unlocks }, {});
  assert.deepEqual([...old.confluence], []);
  assert.deepEqual([...old.statNodes], []);
  assert.deepEqual([...old.weapons.found], ['axe']);
  assert.deepEqual([...old.weapons.learned], []);
  assert.equal(old.weapons.grip, false);
  assert.equal(old.weapons.runes, 3);
  assert.deepEqual([...old.elements], ['fire']);
  assert.equal(old.startAbility, 'mod-chain');
  assert.equal(old.buildPromptSeen, false);
  const stat = prerequisite(c, 'tier', 'prism', 2);
  const current = c.sanitizeBranchSave({ ...saved, gridVersion: 1, statNodes: [stat.id, stat.id, 'bogus'] });
  assert.deepEqual([...current.statNodes], [stat.id]);
  assert.equal(current.unlocks.prism, 3);
  assert.deepEqual([...current.weapons.learned], ['axe']);
});

test('opening Build focuses an actually affordable stat node even when the held family has no affordable growth', () => {
  const c = gridContext();
  loadBetween(c, 'gameui.js', '// ---- Weapon branch screen', 'function boonCardBounds(index) {');
  Object.assign(c, {
    VIEW_W: 960, VIEW_H: 540, deathTimer: 0, keys: {}, showMap: false,
    acknowledgeBuildPrompt() {}, updateTouchControls() {},
  });
  vm.runInContext("weaponHands = { main: 'magic', off: 'blade' };", c);
  c.branchState().guided = true;
  payFor(c, { darkCrystal: 1 });
  const offered = c.affordableSkillGrowth();
  assert.equal(c.openBranchScreen(), true);
  assert.equal(peek(c, 'branchMapFocus'), offered.mapId);
  assert.equal(peek(c, 'branchTab'), offered.style);
  const node = c.branchMapNode(peek(c, 'branchMapFocus'));
  c.unlockFocusedBranch();
  assert.equal(c.skillStatOwned(node.stat.id), true);
});
