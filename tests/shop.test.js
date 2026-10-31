const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, peek } = require('./helpers/combat');
const { readSource, loadFunctions } = require('./helpers/load');

function shopContext(floor = 1) {
  const c = combat();
  c.currentFloor = floor;
  c.MIN_ABILITY_COST = 3;
  c.rangeLensItemIds = [];
  c.reservedUpgradeIds = new Set();
  c.isCatalogItemUnlocked = () => true;
  c.abilityAlreadyOffered = () => false;
  c.markAbilityOffered = () => {};
  c.coins = 0;
  c.playPickupSound = c.playSound = c.showMessage = c.updateHud = c.saveRunState = () => {};
  c.shopItemCatalog = [
    { id: 'frost-rune', name: 'Frost Rune', kind: 'ability', cost: 9 },
    { id: 'spore-bloom', name: 'Spore Bloom', kind: 'ability', cost: 10 },
    { id: 'pearl', name: 'Mana Pearl', kind: 'passive', cost: 7 },
    { id: 'mana-tonic', name: 'Mana Tonic', kind: 'consumable', cost: 4 },
    { id: 'rat-companion', name: 'Rat Familiar', kind: 'companion', cost: 12 },
  ];
  return c;
}

test('bombs and hearts climb 1z a floor while upgrades climb 2z, all capped at 15z', () => {
  const expectations = [
    [1, 4, 3, 9, 7], [2, 5, 4, 11, 9], [5, 8, 7, 15, 15], [9, 12, 11, 15, 15],
  ];
  for (const [floor, bomb, heart, ability, passive] of expectations) {
    const c = shopContext(floor);
    const stock = c.createShopStock();
    const byKind = (kind) => stock.filter((item) => item.kind === kind);
    assert.equal(stock.find((item) => item.id === 'shop-bomb').cost, bomb, `bomb on floor ${floor}`);
    assert.equal(stock.find((item) => item.id === 'shop-heart').cost, heart, `heart on floor ${floor}`);
    assert.equal(byKind('ability')[0].cost >= ability, true);
    assert.equal(stock.find((item) => item.id === 'pearl').cost, passive, `passive on floor ${floor}`);
  }
  assert.equal(shopContext(9).createShopStock().find((item) => item.id === 'frost-rune' || item.id === 'spore-bloom').cost, 15);
});

test('every shop always offers one non-ability upgrade, never a consumable or familiar, in at most five stalls', () => {
  for (let run = 0; run < 25; run += 1) {
    const c = shopContext(3);
    c.Math.random = () => (run % 5) / 5;
    const stock = c.createShopStock();
    assert.ok(stock.length >= 4 && stock.length <= 5, `stalls: ${stock.length}`);
    assert.equal(stock.filter((item) => item.id === 'pearl').length, 1);
    assert.equal(stock.some((item) => ['consumable', 'companion'].includes(item.kind)), false);
    assert.ok(stock.some((item) => item.kind === 'ability'));
  }
  const c = shopContext(2);
  c.shopItemCatalog = c.shopItemCatalog.filter((item) => item.kind === 'passive');
  assert.deepEqual([...c.createShopStock().map((item) => item.id)], ['shop-bomb', 'shop-heart', 'pearl']);
  c.shopItemCatalog = [];
  assert.deepEqual([...c.createShopStock().map((item) => item.id)], ['shop-bomb', 'shop-heart-2']);
});

test('stall cards narrow to fit up to five in one row', () => {
  const c = shopContext();
  const widths = [3, 4, 5].map((count) => c.shopStallWidth(count));
  const spacing = [3, 4, 5].map((count) => c.shopStallSpacing(count));
  assert.deepEqual([...widths], [210, 182, 156]);
  assert.deepEqual([...spacing], [220, 190, 164]);
  for (const count of [3, 4, 5]) {
    c.currentRoom = { shopStock: new Array(count).fill({}) };
    const first = c.shopPedestalPosition(0);
    const last = c.shopPedestalPosition(count - 1);
    assert.ok(first.x - c.shopStallWidth(count) / 2 > 64 && last.x + c.shopStallWidth(count) / 2 < 896, `${count} stalls fit`);
    assert.ok(c.shopStallSpacing(count) >= c.shopStallWidth(count), 'cards do not overlap');
  }
});

test('the sell pad turns carried ore and crystals into zeny and counts them as found', () => {
  const c = shopContext();
  Object.assign(c.coins, {});
  vm.runInContext('materials.ironOre = 4; materials.darkCrystal = 2;', c);
  assert.equal(c.materialCount(), 6);
  assert.equal(c.materialSaleValue(), 4 * 1 + 2 * 3);
  const before = peek(c, 'runStats.zenyFound');
  assert.equal(c.sellMaterials(), true);
  assert.equal(c.coins, 10);
  assert.equal(peek(c, 'runStats.zenyFound'), before + 10);
  assert.equal(c.materialCount(), 0);
  assert.equal(c.sellMaterials(), false, 'nothing is left to sell');
  assert.equal(c.coins, 10);
});

test('the sell pad is walk-on while the repair pad needs the interact action', () => {
  const c = shopContext();
  c.currentRoom = { type: 'shop' };
  c.mode = 'playing';
  c.player.x = c.sellPadPosition().x;
  c.player.y = c.sellPadPosition().y;
  assert.equal(c.nearSellPad(), true);
  assert.equal(c.nearRepairPad(), false);
  c.player.x = c.repairPadPosition().x;
  c.player.y = c.repairPadPosition().y;
  assert.equal(c.nearRepairPad(), true);
  c.currentRoom = { type: 'normal' };
  assert.equal(c.nearRepairPad() || c.nearSellPad(), false, 'the pads exist only in shop rooms');
  const source = readSource('worldmanager.js');
  const walkIn = source.slice(source.indexOf('function updateWalkInInteractions'), source.indexOf('function interact('));
  assert.ok(walkIn.includes('sellMaterials()'));
  assert.equal(walkIn.includes('repairArmor()'), false, 'repair must not trigger on contact');
});

test('armor repair costs 2z a point, plus 1z every three floors, and only mends worn armor', () => {
  const prices = [[1, 2], [3, 2], [4, 3], [6, 3], [7, 4], [9, 4]];
  for (const [floor, price] of prices) assert.equal(shopContext(floor).repairCostPerPoint(), price, `floor ${floor}`);

  const c = shopContext(4);
  assert.equal(c.repairArmor(), false, 'no armor worn');
  c.equippedClothing.legs = { id: 'leather-legguards', armorBonus: 2 };
  c.equippedClothing.chest = { id: 'leather-vest', armorBonus: 1 };
  assert.equal(c.armorCapacity(), 3);
  c.player.armor = 3;
  assert.equal(c.repairArmor(), false, 'already intact');
  c.player.armor = 0;
  c.coins = 2;
  assert.equal(c.repairArmor(), false, 'cannot afford a point at 3z');
  assert.equal(c.player.armor, 0);
  c.coins = 7;
  assert.equal(c.repairArmor(), true);
  assert.equal(c.player.armor, 2, 'partial repair with the zeny available');
  assert.equal(c.coins, 1);
  c.coins = 10;
  c.repairArmor();
  assert.equal(c.player.armor, 3, 'never above the worn capacity');
  assert.equal(c.coins, 7);
});

test('a saved shop keeps its whole stalls so staples and floor prices survive a resume', () => {
  const source = readSource('dbmanager.js');
  assert.ok(/shopStock: room\.shopStock\?\.map\(\(stall\) => JSON\.parse\(JSON\.stringify\(stall\)\)\)/.test(source));
  assert.ok(source.includes("if (stock.kind && Number.isFinite(stock.cost)) return { ...(item || {}), ...stock };"));
});

// Scripts load in GAME_SCRIPTS order and `artwork` (needed by loadAsset) is declared in game.js, the last one.
// A top-level loadAsset call in an earlier script throws at startup and leaves its constants uninitialised.
test('no script that loads before game.js calls loadAsset at top level', () => {
  const list = /const GAME_SCRIPTS = \[([^\]]*)\]/.exec(readSource('cachemanager.js'));
  assert.ok(list, 'GAME_SCRIPTS not found');
  const scripts = [...list[1].matchAll(/'([^']+\.js)'/g)].map((match) => match[1]);
  const early = scripts.slice(0, scripts.indexOf('game.js'));
  assert.ok(early.includes('shopart.js'), 'expected shopart.js to load before game.js');
  const offenders = [];
  for (const file of early) {
    readSource(file).split('\n').forEach((line, index) => {
      if (/^(?!function\b|\/\/|\s|\*)[^\n]*\bload(?:Dyed)?Asset\(/.test(line)) offenders.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('the shop sheet helpers draw without throwing once game.js supplies the sheet', () => {
  const calls = [];
  const c = vm.createContext({
    SHOP_ART: { scale: 1.5, pieces: { stall: [0, 0, 128, 96] } },
    ctx: { save: () => {}, restore: () => {}, drawImage: (...args) => calls.push(args) },
    shopMarketSheet: { complete: true, naturalWidth: 512 },
  });
  loadFunctions(c, 'shopart.js', ['shopSheetReady', 'drawShopPiece']);
  assert.equal(c.shopSheetReady(), true);
  c.drawShopPiece('stall', 100, 100);
  assert.equal(calls.length, 1);
  c.shopMarketSheet = { complete: false, naturalWidth: 0 };
  assert.equal(c.shopSheetReady(), false);
  c.drawShopPiece('stall', 100, 100);
  assert.equal(calls.length, 1, 'nothing is drawn while the sheet is still loading');
});

test('shop cards pack bonus lines into two rows, coloured by sign, and keep every line inside the card', () => {
  const widest = 156;
  const painted = [];
  const c = vm.createContext({
    ctx: { measureText: (text) => ({ width: String(text).length * 5.4 }), fillText: (...args) => painted.push(args) },
    coins: 20,
  });
  loadFunctions(c, 'shopart.js', ['wrapShopText', 'packShopTags', 'shopTagColor']);
  const rows = c.packShopTags(['+40% Fire rate', '+15% Shot speed', '-10% Shot damage', 'Auto frost pulse every 12 s'], widest - 20, 2);
  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map((row) => row.map((entry) => entry.tag)))), [['+40% Fire rate'], ['+15% Shot speed']],
    'on the narrowest card each wide tag takes a row and the rest are dropped');
  assert.deepEqual([...c.packShopTags(['+50% Shot size', '+1 Attack'], widest - 20, 2).map((row) => row.length)], [2],
    'short tags share a row');
  for (const row of rows) {
    const last = row.at(-1);
    assert.ok(last.x + last.tag.length * 5.4 <= widest - 20 + 1e-9, `${last.tag} fits`);
  }
  assert.equal(c.packShopTags([], 100, 2).length, 0);
  assert.equal(c.wrapShopText('Melee: lightning-fast jabs, lighter hits', widest - 20, 1).length, 1,
    'a one-line allowance stays one line');
  assert.ok(c.wrapShopText('Melee: lightning-fast jabs, lighter hits', widest - 20, 1)[0].endsWith('…'));
  assert.notEqual(c.shopTagColor('+5% Speed'), c.shopTagColor('-5% Speed'));
  assert.equal(c.shopTagColor('Blocks 3 hits'), '#d4c7ae');
});
