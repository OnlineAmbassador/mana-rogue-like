const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceText, loadBetween, loadFunctions } = require('./helpers/load');

function presentation() {
  const calls = [];
  const makeContext = (layer) => new Proxy({
    createLinearGradient(...args) {
      calls.push({ layer, method: 'createLinearGradient', args });
      return { addColorStop() {} };
    },
  }, {
    get(target, method) {
      return target[method] || ((...args) => calls.push({ layer, method, args }));
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  const image = (name) => ({ name, complete: true, naturalWidth: 512, naturalHeight: 512 });
  const c = vm.createContext({
    ctx: makeContext('screen'), calls,
    materialCatalog: { ironOre: { id: 'iron-ore', name: 'Iron Ore', price: 1 }, darkCrystal: { id: 'dark-crystal', name: 'Dark Crystal', price: 3 } },
    materials: { ironOre: 0, darkCrystal: 0 },
    document: { createElement: () => ({ getContext: () => makeContext('cache') }) },
    window: { matchMedia: () => ({ matches: false }) },
    ROOM_W: 960, ROOM_H: 540, VIEW_W: 960, VIEW_H: 540,
    camera: { x: 0, y: 0 }, elapsed: 10, quality: { low: false },
    region: 'tulimshar',
    currentRegionId: () => c.region,
    currentFloorTheme: () => ({ wall: '#30383a' }),
    currentRoom: { x: 1, y: 2, type: 'normal', links: {}, lockedDoors: {}, cleared: true },
    rooms: [], directions: [
      { name: 'up', dx: 0, dy: -1 }, { name: 'down', dx: 0, dy: 1 },
      { name: 'left', dx: -1, dy: 0 }, { name: 'right', dx: 1, dy: 0 },
    ],
    terrainTiles: {
      tulimshar: { image: image('dunes'), tileIds: [136, 137, 138, 139] },
      artis: { image: image('paving'), tileIds: [0] },
    },
    terrainBackgroundCache: new Map(),
    sacredRoomTiles: image('sanctum'), sacredRoomFloorTileIds: [65, 49, 81],
    castleWallTiles: image('walls'), desertSandstormImage: image('sandstorm'),
    sandstoneWallTiles: image('som-walls'), soulMenhirImage: image('som-menhir'),
    sandFootprintImage: image('footprints'),
    sandFootprints: { room: null, marks: [], x: 0, y: 0, distance: 0 },
    player: { x: 100, y: 140, moving: false },
    soulMenhirPosition: () => ({ x: 480, y: 166 }),
    keysHeld: 0,
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'gameui.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function drawManaPanel(', 'function drawPlayerMagicMark(', 'source'), c);
  vm.runInContext(sliceText(source, 'function drawSoulMenhir(', 'function drawRewardTrial(', 'source'), c);
  loadFunctions(c, 'gameui.js', ['prefersReducedMotion']);
  loadBetween(c, 'desertart.js', 'const DESERT_ART');
  return c;
}

// The reduced-motion query is created once per page, so tests that change the preference reset it.
function setReducedMotion(c, matches) {
  c.window.matchMedia = () => ({ matches });
  c.prefersReducedMotion.query = undefined;
}

function productionTerrain(c) {
  c.loadAsset = (name) => {
    const png = fs.readFileSync(path.join(__dirname, '..', 'assets', 'tmw', 'clientdata', 'graphics', name));
    return { name, complete: true, naturalWidth: png.readUInt32BE(16), naturalHeight: png.readUInt32BE(20) };
  };
  c.desertGroundTiles = c.loadAsset('tilesets/desert2.png');
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  c.terrainTiles = vm.runInContext(`(() => {
    ${sliceText(game, 'const terrainTiles =', 'const terrainBackgroundCache', 'game')}
    return terrainTiles;
  })()`, c);
}

function mapPatch(file, layerName, x, y, patchWidth = 2, patchHeight = 2) {
  const full = path.join(__dirname, '..', 'assets', 'tmw', 'clientdata', 'maps', file);
  const text = fs.readFileSync(full, 'utf8');
  const sets = [...text.matchAll(/<tileset\b([^>]*?)(?:\/>|>([\s\S]*?)<\/tileset>)/g)].map((match) => {
    const external = match[1].match(/\bsource="([^"]*)"/);
    const body = external
      ? fs.readFileSync(path.resolve(path.dirname(full), external[1]), 'utf8')
      : match[2];
    return {
      first: Number(match[1].match(/\bfirstgid="(\d+)"/)[1]),
      image: body.match(/<image\b[^>]*\bsource="([^"]*)"/)[1],
    };
  });
  const layer = [...text.matchAll(/<layer\b([^>]*)>[\s\S]*?<data encoding="csv">([\s\S]*?)<\/data>[\s\S]*?<\/layer>/g)]
    .find((match) => match[1].includes(`name="${layerName}"`));
  assert.ok(layer, `${file} must contain ${layerName}`);
  const width = Number(layer[1].match(/\bwidth="(\d+)"/)[1]);
  const values = layer[2].trim().split(/[,\s]+/).map(Number);
  return Array.from({ length: patchHeight }, (_, dy) => Array.from({ length: patchWidth }, (_, dx) => {
    const gid = values[(y + dy) * width + x + dx];
    assert.equal(gid >>> 28, 0, 'selected motif must not require tile transforms');
    const set = sets.findLast((s) => s.first <= gid);
    return { id: gid - set.first, image: set.image };
  }));
}

test('desert floor uses intact dune patches and translucent paving within atlas bounds', () => {
  const c = presentation();
  c.drawRoomFloor();
  const images = c.calls.filter((call) => call.layer === 'cache' && call.method === 'drawImage');
  assert.ok(images.some(({ args }) => args[0].name === 'dunes' && args[3] === 128));
  assert.ok(images.some(({ args }) => args[0].name === 'paving'));
  for (const { args: [image, x, y, width, height] } of images) {
    assert.ok(x >= 0 && y >= 0);
    assert.ok(x + width <= image.naturalWidth && y + height <= image.naturalHeight);
  }
  const shades = c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'createLinearGradient');
  assert.equal(shades.length, 1, 'wall shadow must not accumulate once per wall tile');
});

test('desert backdrop is cached, with distinct entries for room layouts and late artwork loads', () => {
  const c = presentation();
  c.terrainTiles.artis.image.complete = false;
  c.drawRoomFloor();
  const cachedCalls = () => c.calls.filter(({ layer }) => layer === 'cache').length;
  const first = cachedCalls();
  c.drawRoomFloor();
  assert.equal(cachedCalls(), first);
  c.terrainTiles.artis.image.complete = true;
  c.drawRoomFloor();
  assert.equal(c.terrainBackgroundCache.size, 2);
  c.currentRoom.links.up = true;
  c.drawRoomFloor();
  assert.equal(c.terrainBackgroundCache.size, 3);
  c.ROOM_W = 1504;
  c.ROOM_H = 804;
  c.drawRoomFloor();
  assert.equal(c.terrainBackgroundCache.size, 4);
});

test('sand ambience stays at world edges, outside the central combat area', () => {
  const c = presentation();
  c.camera = { x: 200, y: 100 };
  c.ROOM_W = 1504;
  c.ROOM_H = 804;
  c.drawRegionAtmosphere();
  const fills = c.calls.filter(({ method }) => method === 'fillRect');
  assert.equal(fills.length, 4);
  for (const { args: [, , width, height] } of fills) {
    assert.ok(width === 100 || height === 100);
  }
  const rects = c.calls.filter(({ method }) => method === 'rect');
  assert.deepEqual(rects[0].args, [-200, -100, 1504, 804]);
  assert.deepEqual(rects[1].args, [-114, -14, 1332, 632]);
  assert.ok(c.calls.some(({ method, args }) => method === 'clip' && args[0] === 'evenodd'));
  assert.equal(c.calls[0].method, 'save');
  assert.equal(c.calls.at(-1).method, 'restore');
});

test('room-specific terrain caching stays bounded across a long descent', () => {
  const c = presentation();
  for (let room = 0; room < 24; room += 1) {
    c.currentRoom.x = room;
    c.drawRoomFloor();
  }
  assert.equal(c.terrainBackgroundCache.size, 12);
});

test('sand haze excludes other regions and secret rooms; low quality skips texture', () => {
  const c = presentation();
  c.region = 'hurnscald';
  c.drawRegionAtmosphere();
  assert.equal(c.calls.length, 0);
  c.region = 'candor';
  c.drawRegionAtmosphere();
  assert.equal(c.calls.length, 0);
  c.region = 'tulimshar';
  c.currentRoom.type = 'secret';
  c.drawRegionAtmosphere();
  assert.equal(c.calls.length, 0);
  c.currentRoom.type = 'normal';
  c.quality.low = true;
  c.drawRegionAtmosphere();
  assert.equal(c.calls.filter(({ method }) => method === 'fillRect').length, 4);
  assert.equal(c.calls.filter(({ method }) => method === 'drawImage').length, 0);
});

test('reduced motion freezes drifting sand while ordinary motion follows elapsed time', () => {
  const c = presentation();
  const positions = () => c.calls.filter(({ method }) => method === 'drawImage').map(({ args }) => args.slice(1));
  setReducedMotion(c, true);
  c.drawRegionAtmosphere();
  const first = positions();
  c.calls.length = 0;
  c.elapsed += 2;
  c.drawRegionAtmosphere();
  assert.deepEqual(positions(), first);
  c.calls.length = 0;
  setReducedMotion(c, false);
  c.drawRegionAtmosphere();
  assert.notDeepEqual(positions(), first);
});

test('gold panel rendering balances canvas state without changing room data', () => {
  const c = presentation();
  const room = JSON.stringify(c.currentRoom);
  c.drawManaPanel(20, 20, 200, 100);
  assert.equal(c.calls[0].method, 'save');
  assert.equal(c.calls.at(-1).method, 'restore');
  assert.equal(JSON.stringify(c.currentRoom), room);
});

test('windblown ground sand and wall scenery animate without changing room or floor data', () => {
  const c = presentation();
  const room = JSON.stringify(c.currentRoom);
  const render = () => {
    c.calls.length = 0;
    c.drawDesertWind();
    c.drawDesertScenery();
    return JSON.stringify(c.calls);
  };
  const first = render();
  c.elapsed += 0.5;
  assert.notEqual(render(), first);
  assert.equal(JSON.stringify(c.currentRoom), room);
  assert.equal(c.terrainBackgroundCache.size, 0);
  const wind = c.calls.filter(({ method }) => method === 'quadraticCurveTo');
  assert.ok(wind.length > 10);
  assert.ok(wind.length <= 56, 'ambient drawing remains bounded');
});

test('reduced motion freezes ground sand and decorative cloth/flames at either quality level', () => {
  for (const low of [false, true]) {
    const c = presentation();
    c.quality.low = low;
    setReducedMotion(c, true);
    c.drawDesertWind();
    c.drawDesertScenery();
    const first = JSON.stringify(c.calls);
    c.calls.length = 0;
    c.elapsed += 10;
    c.drawDesertWind();
    c.drawDesertScenery();
    assert.equal(JSON.stringify(c.calls), first);
  }
});

test('new scenery skips non-desert and secret rooms but keeps lightweight animation in low quality', () => {
  const c = presentation();
  for (const [region, type] of [['hurnscald', 'normal'], ['tulimshar', 'secret']]) {
    c.region = region;
    c.currentRoom.type = type;
    c.drawDesertWind();
    c.drawDesertScenery();
    assert.equal(c.calls.length, 0);
  }
  c.currentRoom.type = 'normal';
  c.quality.low = true;
  c.drawDesertWind();
  assert.equal(c.calls.filter(({ method }) => method === 'quadraticCurveTo').length, 4);
  const wind = JSON.stringify(c.calls);
  c.calls.length = 0;
  c.elapsed += 0.5;
  c.drawDesertWind();
  assert.notEqual(JSON.stringify(c.calls), wind);
  c.calls.length = 0;
  c.drawDesertScenery();
  const first = JSON.stringify(c.calls);
  c.calls.length = 0;
  c.elapsed += 5;
  c.drawDesertScenery();
  assert.notEqual(JSON.stringify(c.calls), first);
});

test('automatic quality changes never reset cloth or flame animation phase', () => {
  const c = presentation();
  const render = (low) => {
    c.quality.low = low;
    c.calls.length = 0;
    c.drawDesertScenery();
    return JSON.stringify(c.calls);
  };
  assert.equal(render(true), render(false));
  c.elapsed += 0.5;
  assert.equal(render(false), render(true));
});

test('pause inventory frames every equipment/supply icon and retains stack counts', () => {
  const c = presentation();
  const icons = [];
  c.shopItemCatalog = Array.from({ length: 160 }, (_, index) => ({ id: `item-${index}`, name: `Item ${index}` }));
  c.ownedItems = new Set(c.shopItemCatalog.map((item) => item.id));
  c.consumables = [{ id: 'potion', name: 'Potion', count: 4 }, { id: 'empty', count: 0 }];
  c.lastInputMode = 'touch';
  c.pointer = { x: 0, y: 0 };
  c.drawShopItemIcon = (item) => icons.push(item.id);
  const before = JSON.stringify(c.consumables);
  c.drawPauseEquipment();
  assert.equal(icons.length, 161);
  assert.equal(icons.at(-1), 'potion');
  assert.equal(JSON.stringify(c.consumables), before);
  const positions = c.calls.filter(({ method }) => method === 'translate');
  for (const { args: [x, y] } of positions) {
    assert.ok(x > 104 && x < 856);
    assert.ok(y > 432 && y < 528, 'even a large inventory stays on screen');
  }
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0] === '4'));
});

test('pause inventory reveals hovered item names and handles an empty inventory', () => {
  const c = presentation();
  c.shopItemCatalog = [{ id: 'sigil', name: 'Mana Sigil' }];
  c.ownedItems = new Set(['sigil']);
  c.consumables = [];
  c.lastInputMode = 'keyboard';
  c.pointer = { x: 125, y: 440 };
  c.drawShopItemIcon = () => {};
  c.drawPauseEquipment();
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0] === 'Mana Sigil'));
  c.ownedItems.clear();
  c.calls.length = 0;
  c.drawPauseEquipment();
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0].includes('Equipped 0')));
});

test('desert walls follow the actual SoM TMX face courses and side walkway, not random face tiles', () => {
  // tulimshar.tmx is not loaded by the game; it is the unmodified source this test checks the wall tile ids against.
  const map = fs.readFileSync(path.join(__dirname, '..', 'assets', 'som', 'maps', 'tulimshar.tmx'), 'utf8');
  const layers = [...map.matchAll(/<layer\b([^>]*)>[\s\S]*?<data encoding="csv">([\s\S]*?)<\/data>[\s\S]*?<\/layer>/g)];
  const tileAt = (name, x, y) => {
    const layer = layers.find((match) => match[1].includes(`name="${name}"`));
    return Number(layer[2].trim().split(/[,\s]+/)[y * 186 + x]) - 1;
  };
  const face = [25, 26, 27, 28].map((y) => tileAt('Over', 39, y));
  const walkway = [35, 36, 37, 38].map((x) => tileAt('Ground', x, 0));
  const c = presentation();
  const art = vm.runInContext('DESERT_ART', c);
  assert.deepEqual(face, [...art.walls.face], 'face courses come from the map');
  assert.deepEqual(walkway, [...art.walls.walkway], 'side walkway comes from the map');
  c.drawRoomFloor();
  const tiles = c.calls.filter(({ method, args }) => method === 'drawImage' && args[0].name === 'som-walls');
  const id = ({ args }) => args[1] / 32 + args[2] / 32 * 16;
  assert.deepEqual(tiles.filter(({ args }) => args[5] === 96 && args[6] < 64).map(id), face);
  assert.deepEqual(tiles.filter(({ args }) => args[5] < 64 && args[6] === 64).map(id), walkway);
  assert.ok(!c.calls.some(({ method, args }) => method === 'drawImage' && args[0].name === 'walls'));
  assert.ok(tiles.some(({ args }) => args[5] === 48 && args[6] === 0 && id({ args }) === 1));
  assert.ok(tiles.some(({ args }) => args[5] === 896 && args[6] === 0 && id({ args }) === 3));
  assert.deepEqual([54, 55, 56].map((y) => tileAt('Over', 35, y)), [1, 8, 24]);
  assert.equal(tileAt('Ground', 35, 57), 40);
  assert.deepEqual([[47, 54], [48, 55], [48, 56]].map(([x, y]) =>
    tileAt('Over', x, y)), [3, 11, 27]);
  assert.equal(tileAt('Ground', 48, 57), 43);
  assert.equal(tileAt('Over', 36, 27), 25);
  assert.equal(tileAt('Over', 36, 28), 41);
  assert.equal(tileAt('Over', 47, 56), 26);
  assert.equal(tileAt('Over', 47, 57), 42);
  for (const [x, y, curves] of [
    [0, 0, [8, 24, 40]], [896, 0, [11, 27, 43]],
    [0, 476, [25, 41]], [896, 476, [26, 42]],
  ]) {
    const corner = tiles.filter(({ args }) => args[5] >= x && args[5] < x + 64 &&
      args[6] >= y && args[6] < y + 64);
    assert.equal(corner.length, 32, 'each 4x4 corner overlays its supporting wall-top ground');
    assert.deepEqual(corner.slice(0, 4).map(id), walkway);
    assert.ok(curves.every((curve) => corner.slice(16).some((tile) => id(tile) === curve)));
    assert.ok(corner.every(({ args }) => args[7] === 16 && args[8] === 16));
  }
});

test('castle side walls use authored vertical edges and connected caps instead of stacked horizontal facades', () => {
  const ids = (patch) => patch.map((row) => row.map(({ id, image }) => {
    assert.ok(image.endsWith('/desert_castle.png'));
    return id;
  }));
  assert.deepEqual(ids(mapPatch('001-3.tmx', 'Over 2', 102, 100, 4, 2)), [
    [0, 1, 1, 2], [16, 17, 17, 18],
  ]);
  assert.deepEqual(ids(mapPatch('001-3.tmx', 'Over 2', 102, 102, 1, 2)), [[32], [32]]);
  assert.deepEqual(ids(mapPatch('001-3.tmx', 'Over 2', 105, 102, 1, 2)), [[34], [34]]);
  assert.deepEqual(ids(mapPatch('011-4.tmx', 'Ground 2', 271, 60, 3, 3)), [
    [48, 49, 50], [64, 65, 66], [80, 81, 82],
  ]);
  const c = presentation();
  c.region = 'hurnscald';
  c.drawRoomFloor();
  const tiles = c.calls.filter(({ method, args }) => method === 'drawImage' && args[0].name === 'walls');
  const id = ({ args }) => args[1] / 32 + args[2] / 32 * 16;
  const sides = tiles.filter(({ args }) => args[6] >= 64 && args[6] < c.ROOM_H - 64);
  assert.equal(sides.length, 2 * Math.ceil((c.ROOM_H - 128) / 32));
  for (const tile of sides) {
    assert.equal(id(tile), tile.args[5] === 0 ? 32 : 34);
    assert.equal(tile.args[7], 64);
    assert.ok(tile.args[6] + tile.args[8] <= c.ROOM_H - 64);
  }
  assert.deepEqual(tiles.filter(({ args }) => args[5] === 96).map(id), [1, 17, 49, 65, 81]);
  assert.ok(!c.calls.some(({ method, args }) => method === 'drawImage' && args[0].name === 'som-walls'));
  assert.ok(tiles.every(({ args }) => args[3] === 32 && args[4] === 32),
    'do not stamp window/facade blocks over the wall courses');
});

['drawSandstoneWalls', 'drawCastleWalls'].forEach((renderer) => test(`${renderer} clips exactly to the collision band and cleared unlocked doorways at any room size`, () => {
  const c = presentation();
  const band = vm.runInContext('ROOM_WALL_BAND', c);
  const half = vm.runInContext('DOOR_OPENING_HALF_WIDTH', c);
  c.currentRoom.links = { up: true, down: true, left: true, right: true };
  for (const [width, height] of [[960, 540], [1504, 804], [997, 573]]) {
    c.ROOM_W = width;
    c.ROOM_H = height;
    c.calls.length = 0;
    c[renderer]();
    const rects = c.calls.filter(({ method }) => method === 'rect').map(({ args }) => args);
    assert.deepEqual(rects, [
      [0, 0, width, height], [band, band, width - band * 2, height - band * 2],
      [width / 2 - half, 0, half * 2, band], [width / 2 - half, height - band, half * 2, band],
      [0, height / 2 - half, band, half * 2], [width - band, height / 2 - half, band, half * 2],
    ]);
    assert.ok(c.calls.some(({ method, args }) => method === 'clip' && args[0] === 'evenodd'));
    assert.equal(c.calls[0].method, 'save');
    assert.equal(c.calls.at(-1).method, 'restore');
  }
  c.currentRoom.lockedDoors.up = true;
  c.calls.length = 0;
  c[renderer]();
  assert.equal(c.calls.filter(({ method }) => method === 'rect').length, 5);
  c.currentRoom.cleared = false;
  c.calls.length = 0;
  c[renderer]();
  assert.equal(c.calls.filter(({ method }) => method === 'rect').length, 2);
  c.currentRoom.cleared = true;
  c.currentRoom.links = {};
  c.currentRoom.secretExit = { direction: 'left', room: { hidden: true } };
  c.calls.length = 0;
  c[renderer]();
  assert.equal(c.calls.filter(({ method }) => method === 'rect').length, 2);
  c.currentRoom.secretExit.room.hidden = false;
  c.calls.length = 0;
  c[renderer]();
  assert.equal(c.calls.filter(({ method }) => method === 'rect').length, 3);
}));

test('sand footprints are distance-based, directional and do not accumulate while standing', () => {
  const walk = (interval) => {
    const c = presentation();
    c.updateSandFootprints(0);
    c.player.moving = true;
    for (let distance = interval; distance <= 100; distance += interval) {
      c.player.x = 100 + distance;
      c.updateSandFootprints(interval / 100);
    }
    return c;
  };
  const c = walk(10);
  assert.deepEqual(c.sandFootprints.marks.map(({ x }) => x), [120, 140, 160, 180, 200]);
  assert.deepEqual(c.sandFootprints.marks.map(({ x }) => x), walk(25).sandFootprints.marks.map(({ x }) => x));
  c.player.moving = false;
  c.updateSandFootprints(1);
  assert.equal(c.sandFootprints.marks.length, 5);
  c.drawSandFootprints();
  const sprites = c.calls.filter(({ method }) => method === 'drawImage');
  assert.equal(sprites.length, 5);
  assert.ok(sprites.every(({ args }) => args[1] === 64 && args[2] === 32));
  c.player.moving = true;
  c.player.y += 20;
  c.updateSandFootprints(0.1);
  assert.equal(c.sandFootprints.marks.at(-1).heading, 2);
});

test('sand footprints expire, stay bounded, and reset for room transitions and teleports', () => {
  const c = presentation();
  c.updateSandFootprints(0);
  c.player.moving = true;
  for (let step = 0; step < 220; step += 1) {
    c.player.x += step % 20 < 10 ? 20 : -20;
    c.updateSandFootprints(0.001);
  }
  assert.equal(c.sandFootprints.marks.length, 96);
  c.player.moving = false;
  c.updateSandFootprints(9);
  assert.equal(c.sandFootprints.marks.length, 0);
  c.player.moving = true;
  c.player.x += 20;
  c.updateSandFootprints(0.1);
  assert.equal(c.sandFootprints.marks.length, 1);
  c.player.x += 200;
  c.updateSandFootprints(0.1);
  assert.equal(c.sandFootprints.marks.length, 0);
  c.sandFootprints.marks.push({ ttl: 8 });
  c.currentRoom = { ...c.currentRoom };
  c.updateSandFootprints(0.1);
  assert.equal(c.sandFootprints.marks.length, 0);
});

test('footprints exclude paving, secret rooms and non-desert regions without changing player state', () => {
  const c = presentation();
  c.player.x = 440;
  c.player.y = 260;
  c.updateSandFootprints(0);
  c.player.moving = true;
  c.player.x += 40;
  const before = JSON.stringify(c.player);
  c.updateSandFootprints(0.1);
  assert.equal(c.sandFootprints.marks.length, 0);
  assert.equal(JSON.stringify(c.player), before);
  for (const [region, type] of [['tulimshar', 'secret'], ['hurnscald', 'normal']]) {
    c.region = region;
    c.currentRoom.type = type;
    c.sandFootprints.marks.push({ ttl: 8 });
    c.updateSandFootprints(0.1);
    c.drawSandFootprints();
    assert.equal(c.sandFootprints.marks.length, 0);
    assert.equal(c.calls.length, 0);
  }
});

test('SoM soul menhir uses its full native image and freezes its aura for reduced motion', () => {
  const c = presentation();
  c.ctx.createRadialGradient = () => ({ addColorStop() {} });
  setReducedMotion(c, true);
  c.drawSoulMenhir();
  const first = JSON.stringify(c.calls);
  const sprite = c.calls.find(({ method }) => method === 'drawImage');
  assert.deepEqual(sprite.args.slice(1), [0, 0, 64, 64, 448, 106, 64, 64]);
  c.calls.length = 0;
  c.elapsed += 2;
  c.drawSoulMenhir();
  assert.equal(JSON.stringify(c.calls), first);
  c.calls.length = 0;
  setReducedMotion(c, false);
  c.drawSoulMenhir();
  assert.notEqual(JSON.stringify(c.calls), first);
  c.quality.low = true;
  c.calls.length = 0;
  c.drawSoulMenhir();
  const low = JSON.stringify(c.calls);
  c.calls.length = 0;
  c.elapsed += 0.5;
  c.drawSoulMenhir();
  assert.notEqual(JSON.stringify(c.calls), low);
});

test('regional floor selections reproduce verified TMX interiors in their authored 2D order', () => {
  const c = presentation();
  productionTerrain(c);
  const sources = [
    ['graveyard', '029-6.tmx', 'Ground', 140, 32, [[36, 20], [6, 37]]],
    ['artis', '005-1-1.tmx', 'Ground', 9, 7, [[113, 114], [113, 114]]],
    ['halinarzo', '011-4.tmx', 'Ground', 57, 49, [[241, 241], [241, 241]]],
    ['nivalis', '019-1.tmx', 'Ground', 0, 0, [[83, 83], [83, 83]]],
    ['frostia', '001-13-1.tmx', 'Ground', 23, 28, [[4, 4], [4, 4]]],
    ['candor', '004-2-1.tmx', 'Ground1', 56, 23, [[4, 4], [4, 4]]],
    ['worldedge', '006-8.tmx', 'Ground', 32, 22, [[32, 33], [47, 48]]],
  ];
  for (const [region, file, layer, x, y, expected] of sources) {
    const patch = mapPatch(file, layer, x, y);
    assert.deepEqual(patch.map((row) => row.map((tile) => tile.id)), expected, `${region}: source map changed`);
    const terrain = c.terrainTiles[region];
    assert.ok(patch.every((row) => row.every((tile) => tile.image.endsWith(path.basename(terrain.image.name)))));
    const sampled = [0, 1].map((row) => [0, 1].map((column) => c.terrainTileAt(terrain, column, row)));
    assert.deepEqual(sampled, expected, `${region}: do not shuffle rows, edges or individual tiles`);
    c.region = region;
    for (const [width, height] of [[960, 540], [1504, 804], [997, 573]]) {
      c.ROOM_W = width;
      c.ROOM_H = height;
      c.calls.length = 0;
      c.drawRoomFloor();
      const tiles = c.calls.filter(({ layer, method }) => layer === 'cache' && method === 'drawImage');
      const columns = Math.floor(terrain.image.naturalWidth / 32);
      for (const { args: [image, sx, sy, sw, sh, dx, dy] } of tiles) {
        assert.ok(sx >= 0 && sy >= 0 && sx + sw <= image.naturalWidth && sy + sh <= image.naturalHeight);
        const column = (dx - 64) / 32;
        const row = (dy - 64) / 32;
        assert.equal(sx / 32 + sy / 32 * columns, expected[row % 2][column % 2]);
      }
      assert.ok(tiles.length > 100, 'actual floor, not just the lookup helper, must use the motif');
    }
  }
});

test('desert paving uses the same authored cobblestone motif as Artis, not ornamental border tiles', () => {
  const c = presentation();
  productionTerrain(c);
  c.currentRoom.links = { up: true, down: true, left: true, right: true };
  c.drawRoomFloor();
  const paving = c.calls.filter(({ layer, method, args }) =>
    layer === 'cache' && method === 'drawImage' && args[0].name.endsWith('artis-pavement.png'));
  assert.ok(paving.length > 40);
  for (const { args: [image, sx, sy, sw, sh, x, y, width, height] } of paving) {
    assert.equal(Math.floor(sx / 32) + Math.floor(sy / 32) * (image.naturalWidth / 32),
      c.terrainTileAt(c.terrainTiles.artis, Math.floor(x / 32) - 2, Math.floor(y / 32) - 2));
    assert.equal(sx % 32, x % 32);
    assert.equal(sy % 32, y % 32);
    assert.deepEqual([sw, sh], [width, height], 'masking must not stretch the source motif');
    assert.ok(sw % 4 === 0 && sh % 4 === 0 && sw <= 32 && sh <= 32);
    assert.ok(c.desertPavingCoverage(x, y) > 0);
    assert.ok(sx + sw <= image.naturalWidth && sy + sh <= image.naturalHeight);
    assert.ok(sy >= 224, 'pavement must not stamp the atlas top-row ornamental edges');
  }
});

test('desert paths meander with uneven widths and sub-tile erosion instead of a square hub', () => {
  const c = presentation();
  c.currentRoom.links = { up: true, down: true, left: true, right: true };
  const sample = () => {
    const rows = [];
    for (let y = 100; y < 230; y += 12) {
      const xs = [];
      for (let x = 340; x < 620; x += 4) {
        if (c.desertPavingCoverage(x, y) >= 0.5) xs.push(x);
      }
      assert.ok(xs.length > 8, 'connected arm has a continuous usable width');
      rows.push({ center: (xs[0] + xs.at(-1)) / 2, width: xs.length * 4 });
    }
    return rows;
  };
  const rows = sample();
  assert.deepEqual(sample(), rows, 'layout must not flicker or depend on random draws');
  assert.ok(Math.max(...rows.map((r) => r.center)) - Math.min(...rows.map((r) => r.center)) >= 12);
  assert.ok(Math.max(...rows.map((r) => r.width)) - Math.min(...rows.map((r) => r.width)) >= 8);
  assert.equal(c.desertPavingCoverage(480 + 64, 270 + 64), 0);
  let feathered = 0;
  for (let y = 100; y < 220; y += 4) {
    for (let x = 400; x < 560; x += 4) {
      const coverage = c.desertPavingCoverage(x, y);
      if (coverage > 0 && coverage < 1) feathered++;
    }
  }
  assert.ok(feathered > 25, 'worn edge has partial coverage within tile boundaries');
  c.currentRoom.x += 1;
  assert.notDeepEqual(sample(), rows, 'neighboring rooms should not reuse the same silhouette');
});

test('natural paving reaches only connected door approaches at different room sizes', () => {
  const c = presentation();
  for (const [width, height] of [[960, 540], [1504, 804], [997, 573]]) {
    c.ROOM_W = width;
    c.ROOM_H = height;
    for (let mask = 0; mask < 16; mask++) {
      c.currentRoom.links = {};
      c.directions.forEach(({ name }, index) => { c.currentRoom.links[name] = Boolean(mask & (1 << index)); });
      for (const { name, dx, dy } of c.directions) {
        const x = dx ? dx > 0 ? width - 68 : 68 : width / 2;
        const y = dy ? dy > 0 ? height - 68 : 68 : height / 2;
        assert.equal(c.desertPavingCoverage(x, y) >= 0.5, c.currentRoom.links[name], name);
      }
    }
  }
});

test('curved paths stay connected from each door to the center without solid rectangular shoulders', () => {
  const c = presentation();
  c.currentRoom.links = { up: true, down: true, left: true, right: true };
  for (const [width, height] of [[960, 540], [1504, 804], [997, 573]]) {
    c.ROOM_W = width;
    c.ROOM_H = height;
    const columns = Math.floor((width - 128) / 8);
    const rows = Math.floor((height - 128) / 8);
    const paving = Array.from({ length: columns * rows }, (_, index) =>
      c.desertPavingCoverage(68 + index % columns * 8, 68 + Math.floor(index / columns) * 8) >= 0.5);
    const center = Math.round((height / 2 - 68) / 8) * columns + Math.round((width / 2 - 68) / 8);
    const seen = new Set([center]);
    const queue = [center];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      const x = index % columns;
      const y = Math.floor(index / columns);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        const next = ny * columns + nx;
        if (nx < 0 || nx >= columns || ny < 0 || ny >= rows || !paving[next] || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    for (const { dx, dy } of c.directions) {
      const column = dx ? dx > 0 ? columns - 1 : 0 : center % columns;
      const row = dy ? dy > 0 ? rows - 1 : 0 : Math.floor(center / columns);
      assert.ok(seen.has(row * columns + column), `continuous approach at ${width}x${height}`);
    }
  }
});

test('footprints follow the eroded paving silhouette rather than its enclosing tile squares', () => {
  const c = presentation();
  c.currentRoom.links = { up: true };
  c.player.x = 340;
  c.player.y = 142;
  c.updateSandFootprints(0);
  c.player.moving = true;
  let excluded = 0;
  let sand = 0;
  for (let x = 360; x <= 600; x += 20) {
    c.player.x = x;
    c.updateSandFootprints(0.01);
    if (c.desertPavingCoverage(x, 142) >= 0.25) excluded++;
    else sand++;
  }
  assert.ok(excluded >= 2 && sand >= 4, 'walk crosses both paving and exposed sand');
  assert.equal(c.sandFootprints.marks.length, sand);
  assert.ok(c.sandFootprints.marks.every(({ x, y }) => c.desertPavingCoverage(x, y) < 0.25));
});

test('wide pulse warns early and gives the dash cue inside the existing invulnerability window', () => {
  const c = presentation();
  const source = fs.readFileSync(path.join(__dirname, '..', 'gameui.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function drawGroundHazards(', 'function withTextOutline(', 'source'), c);
  loadBetween(c, 'mobmanager.js', 'const ADAPTIVE_AI_TUNING = {', '// Largest sideways component');
  const cue = vm.runInContext('ADAPTIVE_AI_TUNING.pulse.dashCueSeconds', c);
  c.groundHazards = [];
  c.bossStrikes = [{ x: 480, y: 270, radius: 300, duration: 1.1, timer: cue + 0.6, damage: 2, dashCheck: true }];
  c.drawGroundHazards();
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0] === 'WIDE PULSE - PREPARE TO DASH'));
  c.calls.length = 0;
  c.bossStrikes[0].timer = cue - 0.02;
  c.drawGroundHazards();
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0] === 'DASH NOW'));
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0] === 'HEAVY - 2 HEARTS'));
});
