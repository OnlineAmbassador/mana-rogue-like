const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  vm.runInContext(source.slice(source.indexOf('function drawManaPanel('),
    source.indexOf('function drawPlayerMagicMark(')), c);
  vm.runInContext(source.slice(source.indexOf('function drawSoulMenhir('),
    source.indexOf('function drawRewardTrial(')), c);
  return c;
}

function productionTerrain(c) {
  c.loadAsset = (name) => {
    const png = fs.readFileSync(path.join(__dirname, '..', 'assets', 'tmw', 'clientdata', 'graphics', name));
    return { name, complete: true, naturalWidth: png.readUInt32BE(16), naturalHeight: png.readUInt32BE(20) };
  };
  c.desertGroundTiles = c.loadAsset('tilesets/desert2.png');
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  c.terrainTiles = vm.runInContext(`(() => {
    ${game.slice(game.indexOf('const terrainTiles ='), game.indexOf('const terrainBackgroundCache'))}
    return terrainTiles;
  })()`, c);
}

function mapPatch(file, layerName, x, y) {
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
  return [0, 1].map((dy) => [0, 1].map((dx) => {
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
  c.window.matchMedia = () => ({ matches: true });
  c.drawRegionAtmosphere();
  const first = positions();
  c.calls.length = 0;
  c.elapsed += 2;
  c.drawRegionAtmosphere();
  assert.deepEqual(positions(), first);
  c.calls.length = 0;
  c.window.matchMedia = () => ({ matches: false });
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

test('reduced motion freezes both ground sand and decorative cloth/flames', () => {
  const c = presentation();
  c.window.matchMedia = () => ({ matches: true });
  c.drawDesertWind();
  c.drawDesertScenery();
  const first = JSON.stringify(c.calls);
  c.calls.length = 0;
  c.elapsed += 10;
  c.drawDesertWind();
  c.drawDesertScenery();
  assert.equal(JSON.stringify(c.calls), first);
});

test('new scenery skips non-desert and secret rooms and stays static in low quality', () => {
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
  assert.equal(c.calls.length, 0);
  c.drawDesertScenery();
  const first = JSON.stringify(c.calls);
  c.calls.length = 0;
  c.elapsed += 5;
  c.drawDesertScenery();
  assert.equal(JSON.stringify(c.calls), first);
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
  const map = fs.readFileSync(path.join(__dirname, '..', 'assets', 'som', 'maps', 'tulimshar.tmx'), 'utf8');
  const layers = [...map.matchAll(/<layer\b([^>]*)>[\s\S]*?<data encoding="csv">([\s\S]*?)<\/data>[\s\S]*?<\/layer>/g)];
  const tileAt = (name, x, y) => {
    const layer = layers.find((match) => match[1].includes(`name="${name}"`));
    return Number(layer[2].trim().split(/[,\s]+/)[y * 186 + x]) - 1;
  };
  const face = [25, 26, 27, 28].map((y) => tileAt('Over', 39, y));
  const walkway = [35, 36, 37, 38].map((x) => tileAt('Ground', x, 0));
  assert.deepEqual(face, [2, 18, 34, 50]);
  assert.deepEqual(walkway, [0, 6, 6, 4]);
  const c = presentation();
  c.drawRoomFloor();
  const tiles = c.calls.filter(({ method, args }) => method === 'drawImage' && args[0].name === 'som-walls');
  const id = ({ args }) => args[1] / 32 + args[2] / 32 * 16;
  assert.deepEqual(tiles.filter(({ args }) => args[5] === 96 && args[6] < 64).map(id), face);
  assert.deepEqual(tiles.filter(({ args }) => args[5] < 64 && args[6] === 64).map(id), walkway);
  assert.ok(!c.calls.some(({ method, args }) => method === 'drawImage' && args[0].name === 'walls'));
  assert.ok(tiles.some(({ args }) => args[5] === 0 && args[6] === 0 && id({ args }) === 1));
  assert.ok(tiles.some(({ args }) => args[5] === 928 && args[6] === 0 && id({ args }) === 3));
});

test('authored walls clip exactly to the collision band and cleared unlocked doorways at any room size', () => {
  const c = presentation();
  c.currentRoom.links = { up: true, down: true, left: true, right: true };
  for (const [width, height] of [[960, 540], [1504, 804], [997, 573]]) {
    c.ROOM_W = width;
    c.ROOM_H = height;
    c.calls.length = 0;
    c.drawSandstoneWalls();
    const rects = c.calls.filter(({ method }) => method === 'rect').map(({ args }) => args);
    assert.deepEqual(rects, [
      [0, 0, width, height], [64, 64, width - 128, height - 128],
      [width / 2 - 48, 0, 96, 64], [width / 2 - 48, height - 64, 96, 64],
      [0, height / 2 - 48, 64, 96], [width - 64, height / 2 - 48, 64, 96],
    ]);
    assert.ok(c.calls.some(({ method, args }) => method === 'clip' && args[0] === 'evenodd'));
    assert.equal(c.calls[0].method, 'save');
    assert.equal(c.calls.at(-1).method, 'restore');
  }
  c.currentRoom.lockedDoors.up = true;
  c.calls.length = 0;
  c.drawSandstoneWalls();
  assert.equal(c.calls.filter(({ method }) => method === 'rect').length, 5);
  c.currentRoom.cleared = false;
  c.calls.length = 0;
  c.drawSandstoneWalls();
  assert.equal(c.calls.filter(({ method }) => method === 'rect').length, 2);
  c.currentRoom.cleared = true;
  c.currentRoom.links = {};
  c.currentRoom.secretExit = { direction: 'left', room: { hidden: true } };
  c.calls.length = 0;
  c.drawSandstoneWalls();
  assert.equal(c.calls.filter(({ method }) => method === 'rect').length, 2);
  c.currentRoom.secretExit.room.hidden = false;
  c.calls.length = 0;
  c.drawSandstoneWalls();
  assert.equal(c.calls.filter(({ method }) => method === 'rect').length, 3);
});

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
  c.window.matchMedia = () => ({ matches: true });
  c.drawSoulMenhir();
  const first = JSON.stringify(c.calls);
  const sprite = c.calls.find(({ method }) => method === 'drawImage');
  assert.deepEqual(sprite.args.slice(1), [0, 0, 64, 64, 448, 106, 64, 64]);
  c.calls.length = 0;
  c.elapsed += 2;
  c.drawSoulMenhir();
  assert.equal(JSON.stringify(c.calls), first);
  c.calls.length = 0;
  c.window.matchMedia = () => ({ matches: false });
  c.drawSoulMenhir();
  assert.notEqual(JSON.stringify(c.calls), first);
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
    ['fortress', '004-2-1.tmx', 'Ground1', 56, 23, [[4, 4], [4, 4]]],
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
  for (const { args: [image, sx, sy, sw, sh, x, y] } of paving) {
    assert.equal(sx / 32 + sy / 32 * (image.naturalWidth / 32),
      c.terrainTileAt(c.terrainTiles.artis, x / 32 - 2, y / 32 - 2));
    assert.ok(sx + sw <= image.naturalWidth && sy + sh <= image.naturalHeight);
    assert.ok(sy >= 224, 'pavement must not stamp the atlas top-row ornamental edges');
  }
});

test('wide pulse warns early and gives the dash cue inside the existing invulnerability window', () => {
  const c = presentation();
  const source = fs.readFileSync(path.join(__dirname, '..', 'gameui.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function drawGroundHazards('),
    source.indexOf('function withTextOutline(')), c);
  c.groundHazards = [];
  c.bossStrikes = [{ x: 480, y: 270, radius: 300, duration: 1.1, timer: 0.8, damage: 2, dashCheck: true }];
  c.drawGroundHazards();
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0] === 'WIDE PULSE - PREPARE TO DASH'));
  c.calls.length = 0;
  c.bossStrikes[0].timer = 0.18;
  c.drawGroundHazards();
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0] === 'DASH NOW'));
  assert.ok(c.calls.some(({ method, args }) => method === 'fillText' && args[0] === 'HEAVY - 2 HEARTS'));
});
