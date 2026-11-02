// Four weapon maps form a diamond, with optional Brawler bridges and the original Trinity at its centre.
// Also the element ground effects it leans on: charged puddles, slush and quenching.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, peek } = require('./helpers/combat');
const { loadFunctions, loadBetween } = require('./helpers/load');

function confluenceContext({ strict = false } = {}) {
  const c = combat({ skillPrerequisitesOpen: !strict });
  c.save.branches = { xp: 100000, unlocks: {}, loadouts: { melee: [], bow: [], magic: [] } };
  c.save.bankedZeny = 100000;
  c.persistSave = () => {};
  c.persistBankedZeny = (balance) => { c.save.bankedZeny = balance; return true; };
  Object.assign(peek(c, 'materials'), { ironOre: 99, darkCrystal: 99, lifeStone: 99 });
  vm.runInContext("weaponHands = { main: 'magic', off: 'blade' };", c);
  return c;
}

const grow = (c, ...ids) => ids.map((id) => c.growConfluenceNode(id));

test('a bridge grows only from a tier III end and then node to node, like a sphere grid', () => {
  const c = confluenceContext();
  assert.equal(c.growConfluenceNode('cf:edge-string:g1'), 'locked', 'Cleave is not tier III yet');
  c.save.branches.unlocks.cleave = 3;
  assert.equal(c.growConfluenceNode('cf:edge-string:s1'), 'locked', 'the Bridge Seal comes first');
  assert.equal(c.growConfluenceNode('cf:edge-string:s2'), 'locked', 'not next to anything owned');
  assert.deepEqual(grow(c, 'cf:edge-string:g1', 'cf:edge-string:s1', 'cf:edge-string:s2', 'cf:edge-string:fusion'),
    ['grown', 'grown', 'grown', 'grown']);
  assert.equal(c.growConfluenceNode('cf:edge-string:s1'), 'known');
  assert.equal(c.growConfluenceNode('cf:edge-string:move'), 'grown', 'the move hangs off the fusion');
  c.save.branches.unlocks.focus = 3;
  assert.equal(c.growConfluenceNode('cf:string-spell:s4'), 'locked');
  assert.deepEqual(grow(c, 'cf:string-spell:g2', 'cf:string-spell:s4'), ['grown', 'grown'], 'the other end of a bridge works too');
  assert.equal(c.growConfluenceNode('cf:nope'), 'missing');
});

test('Confluence growth uses the XP gate; seals and abilities take Life Stones, stats their own price', () => {
  const c = confluenceContext();
  c.save.branches.unlocks.cleave = 3;
  c.save.branches.xp = 0;
  assert.equal(c.growConfluenceNode('cf:edge-string:g1'), 'gate');
  c.save.branches.xp = 100000;
  Object.assign(peek(c, 'materials'), { ironOre: 99, darkCrystal: 1, lifeStone: 0 });
  assert.equal(c.growConfluenceNode('cf:edge-string:g1'), 'short', 'a Bridge Seal is a Life Stone lock');
  peek(c, 'materials').lifeStone = 1;
  assert.equal(c.growConfluenceNode('cf:edge-string:g1'), 'grown');
  assert.equal(c.growConfluenceNode('cf:edge-string:s1'), 'short', 'Might is a power stat: 2 Dark Crystals');
  peek(c, 'materials').darkCrystal = 2;
  assert.equal(c.growConfluenceNode('cf:edge-string:s1'), 'grown');
  assert.deepEqual({ ...peek(c, 'materials') }, { ironOre: 99, darkCrystal: 0, lifeStone: 0 });
  const nodes = peek(c, 'confluenceNodes()');
  for (const node of nodes) {
    if (node.kind === 'stat') assert.equal(node.cost.lifeStone, undefined, `${node.id} is a stat`);
    else assert.deepEqual(Object.keys(node.cost), ['lifeStone'], `${node.id} is a Life Stone lock`);
  }
  assert.equal(nodes.filter((node) => node.kind === 'seal').length, 10, 'a seal at each end of each bridge');
  assert.ok(new Set(nodes.filter((node) => node.kind === 'stat').map((node) => JSON.stringify(node.cost))).size >= 5,
    'stats have different prices');
});

test('the Trinity needs all three fusions, and then every fusion works whatever you hold', () => {
  const c = confluenceContext();
  Object.assign(c.save.branches.unlocks, { cleave: 3, quickdraw: 3, impact: 3 });
  grow(c, 'cf:edge-string:g1', 'cf:edge-string:s1', 'cf:edge-string:s2', 'cf:edge-string:fusion',
    'cf:string-spell:g1', 'cf:string-spell:s1', 'cf:string-spell:s2', 'cf:string-spell:fusion');
  assert.equal(c.growConfluenceNode('cf:trinity'), 'locked', 'two fusions are not enough');
  assert.equal(c.confluenceFusionActive('riposte-volley'), false, 'Blade + Bow fusion sleeps while Magic is in the main hand');
  assert.equal(c.confluenceFusionActive('spellstring'), true, 'Bow + Magic fusion works with Magic in hand');
  vm.runInContext("weaponHands = { main: 'axe', off: 'magic' };", c);
  assert.equal(c.confluenceFusionActive('riposte-volley'), true, 'any weapon of the family counts');
  assert.equal(c.confluenceFusionActive('spellblade'), false, 'not grown');
  grow(c, 'cf:spell-edge:g1', 'cf:spell-edge:s1', 'cf:spell-edge:s2', 'cf:spell-edge:fusion');
  assert.equal(c.growConfluenceNode('cf:trinity'), 'grown');
  vm.runInContext("weaponHands = { main: 'bow', off: 'magic' };", c);
  assert.equal(c.confluenceFusionActive('spellblade'), true, 'the Trinity wakes every fusion');
  const fx = c.branchEffects('bow');
  assert.ok(fx.damage >= 1.25 - 1e-9, 'the Trinity adds damage');
});

test('stat nodes stack for every weapon, and Vigor and Fortune land straight away mid-run', () => {
  const c = confluenceContext();
  c.save.branches.unlocks.cleave = 3;
  const before = { damage: c.branchEffects('magic').damage, reach: c.branchEffects('melee').reach };
  Object.assign(c.player, { maxHp: 4, hp: 4, luck: 0 });
  grow(c, 'cf:edge-string:g1', 'cf:edge-string:s1', 'cf:edge-string:s2', 'cf:edge-string:fusion', 'cf:edge-string:s3', 'cf:edge-string:s4');
  assert.ok(Math.abs(c.branchEffects('magic').damage - before.damage * 1.06) < 1e-9, 'Might reaches Magic too');
  assert.ok(Math.abs(c.branchEffects('melee').reach - before.reach * 1.06) < 1e-9);
  assert.ok(Math.abs(c.confluenceSpeedMultiplier() - 1.04) < 1e-9, 'Stride');
  assert.equal(c.confluenceStatCount('vigor'), 1);
  assert.equal(c.player.maxHp, 5);
  assert.equal(c.player.hp, 5);
  c.save.branches.unlocks.quickdraw = 3;
  grow(c, 'cf:string-spell:g1', 'cf:string-spell:s1', 'cf:string-spell:s2');
  assert.equal(c.player.luck, 1, 'Fortune');
});

test('Brawler bridges grow from either physical family and connect through the centre without changing Trinity requirements', () => {
  for (const [bridge, roots] of [['fist-edge', ['brawl-power', 'cleave']], ['fist-string', ['brawl-flurry', 'quickdraw']]]) {
    for (const [index, root] of roots.entries()) {
      const c = confluenceContext();
      c.save.branches.unlocks[root] = 3;
      const parts = index === 0 ? ['g1', 's1', 's2', 'fusion', 's3', 's4', 'g2']
        : ['g2', 's4', 's3', 'fusion', 's2', 's1', 'g1'];
      assert.deepEqual(grow(c, ...parts.map(part => `cf:${bridge}:${part}`)), parts.map(() => 'grown'));
      assert.equal(c.unweaveNode('tier', root), 'blocked');
      loadFunctions(c, 'dbmanager.js', ['sanitizeConfluenceSave']);
      assert.deepEqual([...c.sanitizeConfluenceSave(JSON.parse(JSON.stringify(c.save.branches.confluence)))],
        [...c.save.branches.confluence]);
    }
    const c = confluenceContext();
    c.save.branches.confluence = ['cf:trinity'];
    assert.equal(c.growConfluenceNode(`cf:${bridge}:fusion`), 'grown', 'central entry is a real progression link');
    assert.equal(c.growConfluenceNode(`cf:${bridge}:move`), 'grown');
    assert.equal(c.growConfluenceNode(`cf:${bridge}:s2`), 'grown');
    assert.equal(c.growConfluenceNode(`cf:${bridge}:s3`), 'grown');
  }
  const c = confluenceContext();
  assert.equal(c.confluenceNode('cf:trinity').links.length, 3);
  vm.runInContext("weaponHands.main = 'fists';", c);
  const before = c.branchEffects('brawl').rate;
  c.save.branches.confluence = ['cf:fist-string:fusion', 'cf:fist-string:move'];
  assert.equal(c.branchEffects('brawl').rate, before * 0.95);
  assert.equal(c.confluenceSpeedMultiplier(), 1.04);
});

test('both Brawler bridges require an affordable stat upgrade before their seals, fusion and move', () => {
  for (const bridge of ['fist-edge', 'fist-string']) {
    const c = confluenceContext({ strict: true });
    c.save.branches.unlocks[c.confluenceNode(`cf:${bridge}:g1`).bridge.ends[0]] = 3;
    for (const part of ['g1', 's1', 's2', 'fusion', 'move', 's3', 's4', 'g2']) {
      const id = `cf:${bridge}:${part}`;
      if (c.confluenceNode(id).kind !== 'stat') {
        assert.equal(c.growConfluenceNode(id), 'locked', `${id} needs a stat first`);
        const stat = c.skillStatNodes().find(node => node.target.id === id);
        assert.equal(c.upgradeSkillStat(stat.id), 'upgraded');
      }
      assert.equal(c.growConfluenceNode(id), 'grown');
    }
  }
});

test('unweaving never strands a node: the chain and its tier III root are protected', () => {
  const c = confluenceContext();
  c.save.branches.unlocks.cleave = 3;
  c.save.branches.weapons = { found: [], learned: [], grip: false, runes: 5, hands: {} };
  Object.assign(c.player, { maxHp: 4, hp: 4 });
  grow(c, 'cf:edge-string:g1', 'cf:edge-string:s1', 'cf:edge-string:s2', 'cf:edge-string:fusion', 'cf:edge-string:s3');
  assert.equal(c.unweaveNode('confluence', 'cf:edge-string:s2'), 'blocked', 'the fusion would lose its way back');
  assert.equal(c.unweaveNode('tier', 'cleave'), 'blocked', 'the root holds the whole bridge');
  assert.equal(c.save.branches.weapons.runes, 5, 'a blocked unweave keeps the rune');
  assert.equal(c.unweaveNode('confluence', 'cf:edge-string:s3'), 'done');
  assert.equal(c.player.maxHp, 4, 'Vigor is taken back');
  assert.equal(peek(c, 'materials').darkCrystal, 99 - 2 - 3 + 3, 'Vigor refunds its Dark Crystals');
  c.save.branches.unlocks.stormstring = 3;
  grow(c, 'cf:edge-string:s3', 'cf:edge-string:s4', 'cf:edge-string:g2');
  assert.equal(c.unweaveNode('confluence', 'cf:edge-string:s2'), 'done', 'rooted at both ends, the middle can go');
  assert.equal(c.unweaveNode('tier', 'cleave'), 'blocked', 'Cleave still roots the seal and first stat node');
  assert.equal(c.unweaveNode('confluence', 'cf:edge-string:s1'), 'done');
  const stones = peek(c, 'materials').lifeStone;
  assert.equal(c.unweaveNode('confluence', 'cf:edge-string:g1'), 'done');
  assert.equal(peek(c, 'materials').lifeStone, stones + 1, 'a seal refunds its Life Stone');
  assert.equal(c.unweaveNode('tier', 'cleave'), 'done', 'the far end now holds the bridge up');
});

test('saved Confluence ids are de-duplicated and unknown ids are dropped', () => {
  const c = confluenceContext();
  loadFunctions(c, 'dbmanager.js', ['sanitizeBranchSave', 'sanitizeWeaponSave', 'sanitizePlaySave', 'sanitizeConfluenceSave']);
  const clean = c.sanitizeBranchSave({ gridVersion: 1, confluence: ['cf:trinity', 'cf:trinity', 'cf:bogus', 7, 'cf:spell-edge:move'] });
  assert.deepEqual([...clean.confluence], ['cf:trinity', 'cf:spell-edge:move']);
  assert.deepEqual([...c.sanitizeBranchSave(null).confluence], []);
  const old = c.sanitizeBranchSave({ gridVersion: 1, confluence: ['cf:edge-string:s1', 'cf:string-spell:s4', 'cf:string-spell:s3'] });
  assert.deepEqual([...old.confluence],
    ['cf:edge-string:s1', 'cf:string-spell:s4', 'cf:string-spell:s3', 'cf:edge-string:g1', 'cf:string-spell:g2'],
    'saves from before Bridge Seals keep their stat nodes connected');
});

test('charged puddles shock foes, slush slows them, and both merge and stay capped', () => {
  const c = confluenceContext();
  const hits = [];
  c.damageEnemy = (enemy, amount) => hits.push(amount);
  c.leaveElementPuddle(100, 100, 'slush');
  const merged = c.leaveElementPuddle(110, 100, 'slush');
  assert.equal(c.groundHazards.length, 1, 'a nearby puddle of the same kind grows instead');
  assert.equal(merged.radius, 34);
  for (let index = 0; index < 12; index += 1) c.leaveElementPuddle(200 + index * 100, 300, 'charged');
  assert.equal(c.groundHazards.length, peek(c, 'ELEMENT_PUDDLE_CAP'), 'the oldest puddle goes at the cap');
  c.groundHazards.length = 0;

  c.enemies.push({ x: 100, y: 100, radius: 10, hp: 5 });
  c.leaveElementPuddle(100, 100, 'slush');
  c.updateGroundHazards(0.016);
  assert.ok(c.enemies[0].slowTimer > 0, 'slush slows');
  assert.equal(c.damageCalls.length, 0, 'the player is never hurt by their own puddles');

  c.createGroundHazard(100, 100, 'water', 'enemy');
  assert.equal(c.electrifyPuddles(100, 100, 40, 2), 2, 'lightning charges water and slush');
  assert.ok(c.groundHazards.every((hazard) => hazard.kind === 'charged' && hazard.owner === 'player'));
  c.updateGroundHazards(0.016);
  assert.deepEqual(hits, [2, 2]);
  c.updateGroundHazards(0.1);
  assert.equal(hits.length, 2, 'shocks wait for the cooldown');
  c.updateGroundHazards(0.6);
  assert.equal(hits.length, 4);

  c.createGroundHazard(400, 400, 'fire', 'player');
  c.quenchHazardsNear(100, 100, 30, ['water', 'slush', 'charged']);
  assert.deepEqual(c.groundHazards.map((hazard) => hazard.kind), ['fire'], 'fire boils the puddles away');
  c.quenchHazardsNear(400, 400, 30, ['fire']);
  assert.equal(c.groundHazards.length, 0, 'and ice puts fire out');
});

function confluenceMapContext() {
  const c = confluenceContext();
  loadBetween(c, 'gameui.js', '// ---- Weapon branch screen', 'function boonCardBounds(index) {');
  vm.runInContext(`var VIEW_W = 960, VIEW_H = 540, clock = 0;
    performance = { now: () => clock };
    playSound = () => {};
    actionForKey = () => null;
    function pointInBounds(bounds, x, y) {
      return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
    }
    branchTab = 'magic';
    resetBranchMap();`, c);
  return c;
}

test('the Confluence tab joins all four maps, with every bridge linked into its tier III ends', () => {
  const c = confluenceMapContext();
  c.setBranchTab('confluence');
  const nodes = c.branchMapNodes('confluence');
  const weaponNodes = ['melee', 'bow', 'magic', 'brawl'].reduce((sum, style) =>
    sum + c.branchMapNodes(style).length, 0);
  const bridgeStats = c.skillStatNodes().filter((node) => node.target.kind === 'confluence').length;
  assert.equal(nodes.length, weaponNodes + peek(c, 'confluenceNodes()').length + bridgeStats);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    for (const link of node.links) assert.ok(byId.has(link), `${node.id} links to missing ${link}`);
  }
  assert.ok(byId.get('cf:edge-string:g1').links.every((id) => id.startsWith('stat:confluence:')));
  const entryStat = byId.get(byId.get('cf:edge-string:g1').links[0]);
  assert.deepEqual([...entryStat.links], ['melee/cleave:3']);
  assert.deepEqual([...byId.get('cf:edge-string:s1').links], ['cf:edge-string:g1']);
  const exitStat = byId.get(byId.get('cf:edge-string:g2').links[0]);
  assert.deepEqual([...exitStat.links], ['cf:edge-string:s4', 'bow/stormstring:3']);
  assert.equal(byId.get('cf:trinity').x, 0);
  for (const [index, a] of nodes.entries()) {
    for (const b of nodes.slice(index + 1)) {
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= c.branchNodeRadius(a) + c.branchNodeRadius(b) + 4,
        `${a.id} and ${b.id} overlap`);
    }
  }
  assert.equal(peek(c, 'branchMapFocus'), 'magic/heart', 'the camera starts on the main hand heart');
});

test('opening Confluence keeps the selected heart visible for all four weapon families', () => {
  const c = confluenceMapContext();
  for (const style of ['melee', 'bow', 'magic', 'brawl']) {
    c.applyWeaponHands(c.defaultWeaponHands({ startingStyle: style }));
    c.setBranchTab('confluence');
    c.resetBranchMap();
    const node = c.branchMapNode(`${style}/heart`);
    const screen = c.branchWorldToScreen(node.x, node.y);
    const view = peek(c, 'BRANCH_MAP_VIEW');
    assert.ok(screen.x >= view.x && screen.x <= view.x + view.width, `${style} horizontal focus`);
    assert.ok(screen.y >= view.y && screen.y <= view.y + view.height, `${style} vertical focus`);
    assert.equal(peek(c, 'branchMapFocus'), `${style}/heart`);
  }
});

test('the four hearts form a symmetric diamond with both Brawler bridges joined to the central stat gates', () => {
  const c = confluenceMapContext();
  const nodes = c.branchMapNodes('confluence');
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const [style, x, y] of [['magic', 0, -850], ['melee', -850, 0], ['bow', 850, 0], ['brawl', 0, 850]]) {
    assert.equal(byId.get(`${style}/heart`).x, x);
    assert.equal(byId.get(`${style}/heart`).y, y);
  }
  for (const bridge of ['fist-edge', 'fist-string']) {
    const fusion = byId.get(`cf:${bridge}:fusion`);
    const gates = fusion.links.map(id => byId.get(id));
    assert.ok(gates.every(node => node.kind === 'stat'));
    assert.ok(gates.every(node => node.links.includes('cf:trinity')), `${bridge} connects to the centre`);
  }
});

test('growing a Confluence node from the map spends its price and explains a gate or a lock', () => {
  const c = confluenceMapContext();
  c.setBranchTab('confluence');
  c.focusBranchNode('cf:edge-string:g1');
  c.unlockFocusedBranch();
  assert.equal(c.confluenceOwned('cf:edge-string:g1'), false);
  assert.equal(peek(c, 'branchGuide').node, 'melee/cleave:3', 'the spotlight points at the tier III end it needs');
  c.save.branches.unlocks.cleave = 3;
  c.save.branches.xp = 0;
  c.unlockFocusedBranch();
  assert.match(peek(c, 'branchNotice'), /career XP/);
  c.save.branches.xp = 100000;
  c.unlockFocusedBranch();
  assert.equal(c.confluenceOwned('cf:edge-string:g1'), true);
  c.focusBranchNode('cf:edge-string:s1');
  c.unlockFocusedBranch();
  assert.equal(c.confluenceOwned('cf:edge-string:s1'), true);
  assert.equal(c.branchFxBadge({ shots: 1 }).label, '+1 SHOT');
  assert.equal(c.branchFxBadge({ damage: 1.15 }).label, '+15% DMG');
  assert.equal(c.branchFxBadge({ damage: 1.1, explode: 30 }).icon, '✸', 'the special stat wins over plain damage');
});
