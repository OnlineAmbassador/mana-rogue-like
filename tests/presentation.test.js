const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceText, loadBetween, loadFunctions } = require('./helpers/load');

function presentation() {
  const calls = [];
  const styles = [];
  const makeContext = (layer) => new Proxy({
    globalAlpha: 1, filter: 'none',
    getImageData(x, y, width, height) {
      calls.push({ layer, method: 'getImageData', args: [x, y, width, height] });
      const data = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < (c.maskFootRow ?? height); row += 1) {
        for (let column = 0; column < (c.maskWidth ?? width); column += 1) data[(row * width + column) * 4 + 3] = 255;
      }
      return { data };
    },
    createRadialGradient(...args) {
      calls.push({ layer, method: 'createRadialGradient', args });
      return { addColorStop() {} };
    },
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
      styles.push({ layer, property, value });
      return true;
    },
  });
  const image = (name) => ({ name, complete: true, naturalWidth: 512, naturalHeight: 512 });
  const c = vm.createContext({
    ctx: makeContext('screen'), calls, styles,
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
    soulMenhirImage: image('som-menhir'),
    tulimsharCastleTiles: { name: 'evol-castle', complete: true, naturalWidth: 544, naturalHeight: 704 },
    sandFootprintImage: image('footprints'),
    sandFootprints: { room: null, marks: [], x: 0, y: 0, distance: 0 },
    player: { x: 100, y: 140, moving: false },
    projectiles: [], enemyProjectiles: [], groundHazards: [],
    magicElementPalette: { fire: '#ff8042', lightning: '#cfeaff', bubble: '#8bdfff' },
    shopItemIconImages: {}, heartImage: image('heart'),
    currentAttackStyle: () => 'magic', styleGlowColor: () => null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    soulMenhirPosition: () => ({ x: 480, y: 166 }),
    keysHeld: 0,
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'gameui.js'), 'utf8');
  vm.runInContext(sliceText(source, 'function drawManaPanel(', 'function drawPlayerMagicMark(', 'source'), c);
  vm.runInContext(sliceText(source, 'function drawSoulMenhir(', 'function drawRewardTrial(', 'source'), c);
  loadFunctions(c, 'gameui.js', ['prefersReducedMotion']);
  loadFunctions(c, 'lightingmanager.js', ['roomUsesCreviceLight', 'roomLightShafts', 'sunlightStrength',
    'sunlightMask', 'drawSunSpriteShadow', 'drawSunGroundShadow', 'drawRoomSunlight',
    'worldLightExposure', 'collectWorldLights', 'drawWorldLightSources',
    'drawProjectileGroundShadow', 'drawTrunkShadow']);
  loadFunctions(c, 'gameui.js', ['drawGroundHazards', 'outlinedItemTexture', 'drawOutlinedItemImage',
    'drawShopItemIcon', 'drawShopItemIconArt', 'drawPickupItem', 'withTextOutline']);
  loadFunctions(c, 'gameui.js', ['mobDrawScale']);
  loadFunctions(c, 'playermanager.js', ['projectileArcState']);
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
    if (width === undefined) continue;
    assert.ok(x >= 0 && y >= 0);
    assert.ok(x + width <= (image.naturalWidth || image.width) && y + height <= (image.naturalHeight || image.height));
  }
  const shades = c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'createLinearGradient');
  assert.equal(shades.length, 0, 'directional lighting replaces the old vertical wall-shadow strip');
});

test('sand continues beneath walls and transparent doorway corners while paving stays inside the collision border', () => {
  const c = presentation();
  for (const [width, height] of [[960, 540], [1504, 804], [997, 573]]) {
    c.ROOM_W = width;
    c.ROOM_H = height;
    c.calls.length = 0;
    c.drawDesertGround(c.ctx, c.terrainTiles.tulimshar.image);
    const clips = c.calls.filter(({ method }) => method === 'rect').map(({ args }) => args);
    assert.deepEqual(clips, [[0, 0, width, height], [32, 32, width - 64, height - 64]]);
    const dunes = c.calls.filter(({ method, args }) => method === 'drawImage' && args[0].name === 'dunes');
    assert.ok(dunes.some(({ args }) => args[5] < 0 && args[5] + args[7] >= 32),
      'sand extends beneath the west wall without shifting the interior dune pattern');
    assert.ok(dunes.some(({ args }) => args[5] <= width - 32 && args[5] + args[7] >= width),
      'sand extends beneath the east wall');
    assert.ok(dunes.some(({ args }) => args[6] < 0 && args[6] + args[8] >= 32));
    assert.ok(dunes.some(({ args }) => args[6] < height && args[6] + args[8] >= height));
    assert.equal(c.roomWallBand(), 32, 'visual overlap does not change collision');
  }
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

test('sunlight projects sprite silhouettes equally down and right and reuses bounded native-frame masks', () => {
  const c = presentation();
  const image = { complete: true, naturalWidth: 512, naturalHeight: 512 };
  const render = (x = 200, y = 200, lift = 0) =>
    c.drawSunSpriteShadow(image, 0, 0, 32, 64, x, y, 32, 64, lift);
  render();
  const frames = c.sunlightMask.images.get(image);
  assert.equal(frames.size, 1);
  const mask = frames.values().next().value;
  assert.deepEqual([mask.width, mask.height], [32, 64]);
  assert.ok(c.calls.some(({ method, args }) => method === 'transform' &&
    JSON.stringify(args) === JSON.stringify([1, 0, -0.55, -0.55, 0, 0])));
  const before = c.calls.filter(({ layer }) => layer === 'cache').length;
  render(240, 260);
  assert.equal(c.calls.filter(({ layer }) => layer === 'cache').length, before);
  assert.equal(frames.values().next().value, mask, 'moving does not rebuild a sprite shadow');
  c.calls.length = 0;
  render(200, 200, 40);
  assert.deepEqual(c.calls.find(({ method }) => method === 'translate').args, [222, 222]);
  c.calls.length = 0;
  c.drawSunSpriteShadow(image, 0, 0, 32, 64, 200, 200, 32, 64, 0, 1, 0.8);
  assert.equal(c.calls.find(({ method }) => method === 'rotate').args[0], 0.8,
    'rolling sprites rotate their projected silhouettes around the same center');
  const transform = [1, 0, -0.55, -0.55];
  const topX = transform[2] * -64;
  const topY = transform[3] * -64;
  assert.ok(topX > 0);
  assert.equal(topX, topY, '45-degree light produces equal bottom-right projection');
  for (let frame = 0; frame < 150; frame += 1) c.sunlightMask(image, frame, 0, 1, 1);
  assert.equal(frames.size, 128);
  c.calls.length = 0;
  render(-1000, -1000);
  assert.equal(c.calls.length, 0, 'offscreen shadows add no drawing or cache work');
});

test('transparent frame padding never separates a shadow from the rendered feet', () => {
  const c = presentation();
  c.maskFootRow = 48;
  const image = { complete: true, naturalWidth: 64, naturalHeight: 64 };
  c.drawSunSpriteShadow(image, 0, 0, 64, 64, 200, 200, 96, 96);
  const mask = c.sunlightMask.images.get(image).values().next().value;
  assert.equal(mask.footRow, 48);
  const translations = c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'translate');
  assert.deepEqual(translations.map(({ args }) => args), [[200, 176], [0, -24]]);
  const destination = c.calls.find(({ layer, method }) => layer === 'screen' && method === 'drawImage').args;
  const footLocalY = translations[1].args[1] + destination[2] + mask.footRow / 64 * destination[4];
  assert.equal(footLocalY, 0, 'last opaque foot row projects exactly from its on-screen feet');
  c.drawSunSpriteShadow(image, 0, 0, 64, 64, 250, 240, 96, 96);
  assert.equal(c.calls.filter(({ method }) => method === 'getImageData').length, 1,
    'alpha bounds are sampled once per cached frame, not per draw');
});

test('bat and Road Captain attacks match visible bodies rather than ground circles', () => {
  const c = presentation();
  const bat = { y: -18, radius: 17, radiusX: 17, radiusY: 11 };
  const bandit = { y: -2, radius: 27, radiusX: 11, radiusY: 27 };
  c.monsterSprites = {
    bat: { scale: 1.05, hitbox: bat }, vampirebat: { scale: 1, hitbox: bat },
    bandit: { scale: 1, hitbox: bandit }, banditlord: { scale: 1.05, hitbox: bandit },
  };
  c.distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  loadFunctions(c, 'playermanager.js', ['enemyAttackTarget', 'projectileArcState', 'projectileHitsEnemy',
    'attackOriginY', 'nearestTouchTargetAngle']);
  for (const kind of ['bat', 'vampirebat', 'bandit', 'banditlord']) {
    for (const variant of [{}, { miniBoss: true }, { boss: true }]) {
      const enemy = { kind, x: 400, y: 300, radius: 14, hp: 10, ...variant };
      const original = JSON.stringify(enemy);
      const target = c.enemyAttackTarget(enemy);
      const scale = c.mobDrawScale(enemy, c.monsterSprites[kind]);
      const bat = kind === 'bat' || kind === 'vampirebat';
      assert.equal(target.y, 300 - (bat ? 18 : 2) * scale);
      const shot = { type: 'arrow', x: target.x, y: target.y, vx: 0, vy: 0, ttl: 1, ttl0: 1, radius: 2 };
      assert.equal(c.projectileHitsEnemy(shot, enemy, 0), true);
      assert.equal(c.projectileHitsEnemy({ ...shot, x: target.x + target.radiusX + 5 }, enemy, 0), false);
      assert.equal(c.projectileHitsEnemy({ ...shot, x: target.x + 100, vx: 1000 }, enemy, 0.2), true,
        'a fast projectile crossing the body cannot tunnel through between frames');
      if (bat) {
        assert.equal(c.projectileHitsEnemy({ ...shot, y: enemy.y + 15 }, enemy, 0), false,
          'empty space below the cropped bat is not its body');
      }
      c.enemies = [enemy];
      assert.equal(c.nearestTouchTargetAngle(),
        Math.atan2(target.y - c.attackOriginY(), target.x - c.player.x));
      assert.equal(JSON.stringify(enemy), original, 'movement and contact radius are untouched');
    }
  }
  const ordinary = { kind: 'slime', x: 300, y: 300, radius: 12 };
  assert.equal(c.enemyAttackTarget(ordinary), ordinary);
  assert.equal(c.projectileHitsEnemy({ x: 300, y: 300, radius: 2 }, ordinary, 0), true);
});

test('spider shadows project from the abdomen for mobs and companions', () => {
  const c = presentation();
  c.loadAsset = (name) => ({ name, complete: true, naturalWidth: 245, naturalHeight: 140 });
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  c.monsterSprites = vm.runInContext(`(() => {
    ${sliceText(game, 'const monsterSprites =', 'const ', 'game')}
    return monsterSprites;
  })()`, c);
  assert.equal(c.monsterSprites.spider.shadowAnchorY, 0.35);
  loadFunctions(c, 'gameui.js', ['drawEnemyBody', 'drawCompanion']);
  const shadows = [];
  c.drawSunSpriteShadow = (...args) => shadows.push(args);
  c.drawEnemyBody({ kind: 'spider', x: 200, y: 240, hp: 4, maxHp: 4, radius: 14 });
  c.drawCompanion({ kind: 'spider', x: 200, y: 240, hp: 4 });
  assert.equal(shadows.length, 2);
  assert.ok(shadows.every((args) => args[12] === 0.35));
  loadFunctions(c, 'lightingmanager.js', ['drawSunSpriteShadow']);
  c.calls.length = 0;
  c.drawSunSpriteShadow(c.monsterSprites.spider.image, 0, 0, 35, 35,
    200, 240, 70, 70, 0, 1, 0, 0.35);
  const translations = c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'translate');
  assert.deepEqual(translations.map(({ args }) => args), [[200, 194.5], [0, 10.5]]);
});

test('mouse mobs and companions anchor their shadows beneath the abdomen', () => {
  const c = presentation();
  c.loadAsset = (name) => ({ name, complete: true, naturalWidth: 224, naturalHeight: 320 });
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  c.monsterSprites = vm.runInContext(`(() => {
    ${sliceText(game, 'const monsterSprites =', 'const ', 'game')}
    return monsterSprites;
  })()`, c);
  assert.equal(c.monsterSprites.ratto.shadowAnchorY, 0.5);
  loadFunctions(c, 'gameui.js', ['drawEnemyBody', 'drawCompanion']);
  const shadows = [];
  c.drawSunSpriteShadow = (...args) => shadows.push(args);
  c.drawEnemyBody({ kind: 'ratto', x: 200, y: 240, hp: 4, maxHp: 4, radius: 14 });
  c.drawCompanion({ kind: 'ratto', x: 200, y: 240, hp: 4 });
  assert.equal(shadows.length, 2);
  assert.ok(shadows.every((args) => args[12] === 0.5));
  loadFunctions(c, 'lightingmanager.js', ['drawSunSpriteShadow']);
  c.calls.length = 0;
  c.drawSunSpriteShadow(c.monsterSprites.ratto.image, 0, 0, 32, 32,
    200, 272, 64, 64, 0, 1, 0, 0.5);
  assert.deepEqual(c.calls.filter(({ layer, method }) => layer === 'screen' &&
    method === 'translate').map(({ args }) => args), [[200, 240], [0, 0]]);
});

test('every airborne projectile has a separated shadow that converges on landing', () => {
  const c = presentation();
  const shot = { type: 'arrow', x: 200, y: 180, vx: 200, vy: 0, ttl: 1, ttl0: 1, radius: 6 };
  const render = (projectile) => {
    c.calls.length = 0;
    c.drawProjectileGroundShadow(projectile);
    return c.calls.find(({ method }) => method === 'ellipse').args;
  };
  const airborne = render(shot);
  const landing = render({ ...shot, ttl: 0 });
  assert.ok(airborne[0] > landing[0]);
  assert.ok(airborne[1] > landing[1]);
  assert.equal(landing[0], 200);
  assert.equal(landing[1], 214);
  assert.ok(airborne[2] > landing[2] && airborne[3] > landing[3]);
  assert.equal(c.projectileArcState(shot).y, 180);
  assert.equal(c.projectileArcState({ ...shot, ttl: 0 }).y, 214);
  assert.equal(c.projectileArcState({ ...shot, vx: 0, vy: 200, ttl: 0 }).y, 180,
    'vertical shots retain the existing visual flight path');
  for (const kind of ['arrow', 'fire', 'spore-orb', 'spore-shard']) {
    const shadow = render({ kind, x: 200, y: 180, vx: 200, vy: 0, radius: 7 });
    assert.ok(shadow[0] > 200 && shadow[1] > 204);
    assert.equal(shadow[4], Math.PI / 4);
  }
  c.calls.length = 0;
  c.drawProjectileGroundShadow({ type: 'charge-beam' });
  assert.equal(c.calls.length, 0, 'pure light beams illuminate instead of casting a solid blob');
});

test('soul menhir uses a solid base-connected shadow with artwork and fallback', () => {
  const c = presentation();
  for (const complete of [true, false]) {
    c.soulMenhirImage.complete = complete;
    c.calls.length = 0;
    c.drawSoulMenhir();
    const base = c.calls.find(({ method }) => method === 'ellipse');
    assert.deepEqual(base.args.slice(0, 2), [480, 170]);
    assert.equal(base.args[2], 80 * 0.22, 'menhir contact and cast silhouette are wider than the tree shadow');
    assert.ok(!c.calls.some(({ method }) => method === 'transform'),
      'menhir does not project gaps from its sprite alpha');
    assert.ok(c.calls.some(({ method }) => method === 'createRadialGradient'),
      'magical glow remains separate from the solid shadow');
  }
});

test('tree shadows form one solid trunk-rooted shape projected down and right', () => {
  const c = presentation();
  loadFunctions(c, 'lightingmanager.js', ['drawTrunkShadow']);
  c.drawTrunkShadow(200, 240, 70, 66);
  const rootY = 240 + 66 * 0.34;
  const reach = 66 * 0.55;
  assert.deepEqual(c.calls.find(({ method }) => method === 'ellipse').args.slice(0, 2), [200, rootY]);
  assert.ok(c.calls.some(({ method, args }) => method === 'lineTo' &&
    args[0] === 200 + reach + 70 * 0.22 && args[1] === rootY + reach));
  assert.equal(c.calls.filter(({ method }) => method === 'fill').length, 1,
    'root contact and cast shadow fill together without doubled opacity or light gaps');
  assert.ok(!c.calls.some(({ method }) => method === 'drawImage'));
  assert.equal(c.calls.filter(({ method }) => method === 'save').length,
    c.calls.filter(({ method }) => method === 'restore').length);
});

test('grounded shadows start under objects and grow monotonically with elevation', () => {
  const c = presentation();
  const image = { complete: true, naturalWidth: 32, naturalHeight: 64 };
  const sizes = [];
  for (const elevation of [0, 16, 40, 85]) {
    c.calls.length = 0;
    c.drawSunGroundShadow(200, 240, 12, elevation);
    const ellipse = c.calls.find(({ method }) => method === 'ellipse').args;
    assert.equal(ellipse[0], 200 + elevation * 0.55);
    assert.equal(ellipse[1], 240 + elevation * 0.55);
    c.calls.length = 0;
    c.drawSunSpriteShadow(image, 0, 0, 32, 64, 200, 240, 32, 64, elevation);
    const scale = c.calls.find(({ method }) => method === 'scale').args;
    assert.equal(scale[0], scale[1]);
    sizes.push([ellipse[2], ellipse[3], scale[0]]);
  }
  assert.deepEqual(sizes[0], [12, 6, 1]);
  for (let index = 1; index < sizes.length; index += 1) {
    assert.ok(sizes[index].every((value, axis) => value > sizes[index - 1][axis]));
  }
});

test('blue item outlines use cached alpha silhouettes without copying or recoloring artwork', () => {
  const c = presentation();
  const image = { complete: true, naturalWidth: 32, naturalHeight: 32 };
  c.drawOutlinedItemImage(image, 200, 180, 32, 32);
  const texture = c.outlinedItemTexture.images.get(image);
  assert.deepEqual([texture.width, texture.height], [34, 34]);
  assert.ok(c.styles.some(({ property, value }) => property === 'fillStyle' && value === '#0e0868'));
  assert.ok(c.styles.some(({ property, value }) => property === 'globalCompositeOperation' && value === 'source-in'));
  const sourceDraw = c.calls.filter(({ layer, method }) => layer === 'cache' && method === 'drawImage').at(-1);
  assert.equal(sourceDraw.args[0], image, 'unmodified original art is drawn above the blue silhouette');
  assert.deepEqual(sourceDraw.args.slice(1), [0, 0, 32, 32, 1, 1, 32, 32]);
  const before = c.calls.filter(({ layer }) => layer === 'cache').length;
  c.drawOutlinedItemImage(image, 240, 200, 32, 32);
  assert.equal(c.calls.filter(({ layer }) => layer === 'cache').length, before);
  assert.equal(c.calls.filter(({ method }) => method === 'getImageData').length, 1,
    'padding is sampled once and never rescanned while drawing');
});

test('keys, bombs and other drops grow with shared blue outlines and bounded caches', () => {
  const c = presentation();
  for (const kind of ['key', 'bomb', 'coin', 'xp', 'heart', 'curio', 'consumable']) {
    c.calls.length = 0;
    const pickup = { kind, x: 200, y: 180 };
    if (['curio', 'consumable'].includes(kind)) {
      pickup.item = { id: kind, kind };
      c.shopItemIconImages[kind] = { complete: true, naturalWidth: 32, naturalHeight: 32 };
    }
    assert.equal(c.drawPickupItem(pickup), true);
    const draw = c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'drawImage').at(-1);
    assert.ok(draw.args[3] >= 32 && draw.args[4] >= 32);
    assert.ok(c.styles.some(({ property, value }) => property === 'imageSmoothingEnabled' && value === false));
  }
  c.calls.length = 0;
  c.drawPickupItem({ kind: 'key', x: 220, y: 200 });
  assert.equal(c.calls.filter(({ layer }) => layer === 'cache').length, 0);
  for (let index = 0; index < 140; index += 1) {
    c.drawShopItemIcon({ id: `fallback-${index}`, kind: 'passive' }, 200, 180);
  }
  assert.equal(c.drawShopItemIcon.cache.size, 128);
  c.shopItemIconImages['fallback-139'] = { complete: true, naturalWidth: 32, naturalHeight: 32 };
  c.calls.length = 0;
  c.drawShopItemIcon({ id: 'fallback-139', kind: 'passive' }, 200, 180);
  assert.equal(c.calls.filter(({ method }) => method === 'drawImage').at(-1).args[3], 34,
    'late loaded artwork replaces the procedural icon');
});

test('Guardian Heart and healing-heart icons share the smaller drop scale', () => {
  const c = presentation();
  loadFunctions(c, 'gameui.js', ['drawDropIcon']);
  c.drawDropIcon(200, 180, () => {}, 0.6);
  assert.deepEqual(c.calls.find(({ method }) => method === 'scale').args, [0.6, 0.6]);
  for (const complete of [true, false]) {
    c.heartImage.complete = complete;
    c.calls.length = 0;
    c.drawDropIcon(200, 180, () => c.drawPickupItem({ kind: 'heart', x: 200, y: 180 }), 0.6);
    assert.deepEqual(c.calls.find(({ method }) => method === 'scale').args, [0.6, 0.6]);
    assert.equal(c.calls.filter(({ method }) => method === 'save').length,
      c.calls.filter(({ method }) => method === 'restore').length);
  }
});

test('padded item artwork is cropped and enlarged with uniform whole-pixel scale', () => {
  const c = presentation();
  c.maskWidth = 16;
  c.maskFootRow = 12;
  const image = { complete: true, naturalWidth: 32, naturalHeight: 32 };
  c.drawOutlinedItemImage(image, 200, 180, 32, 32);
  const texture = c.outlinedItemTexture.images.get(image);
  assert.deepEqual([texture.width, texture.height], [18, 14]);
  const draw = c.calls.find(({ layer, method }) => layer === 'screen' && method === 'drawImage').args;
  assert.deepEqual(draw.slice(3), [36, 28]);
  assert.equal(draw[3] / texture.width, draw[4] / texture.height);
});

test('drop icons shrink slightly without smoothing or resizing labels and shop icons', () => {
  const c = presentation();
  loadFunctions(c, 'gameui.js', ['drawDropIcon']);
  const result = c.drawDropIcon(200, 180, () => {
    c.ctx.drawImage('icon', 184, 164, 32, 32);
    return true;
  });
  assert.equal(result, true);
  assert.deepEqual(c.calls.filter(({ method }) => method === 'translate').map(({ args }) => args),
    [[200, 180], [-200, -180]]);
  assert.deepEqual(c.calls.find(({ method }) => method === 'scale').args, [0.8, 0.8]);
  assert.ok(c.styles.some(({ property, value }) => property === 'imageSmoothingEnabled' && value === false));
  assert.ok(!c.styles.some(({ property, value }) => property === 'imageSmoothingEnabled' && value === true));
  assert.equal(c.calls.filter(({ method }) => method === 'save').length,
    c.calls.filter(({ method }) => method === 'restore').length);
});

test('shop pedestal icons shrink around their center without changing other item surfaces', () => {
  const c = presentation();
  loadFunctions(c, 'gameui.js', ['drawShopStockIcon']);
  const items = [];
  c.drawShopItemIcon = (...args) => items.push(args);
  const item = { id: 'shop-bomb', kind: 'shop-bomb' };
  c.drawShopStockIcon(item, 200, 180);
  assert.deepEqual(items, [[item, 0, 0]]);
  assert.deepEqual(c.calls.find(({ method }) => method === 'translate').args, [200, 180]);
  assert.deepEqual(c.calls.find(({ method }) => method === 'scale').args, [0.875, 0.875]);
  assert.equal(c.calls.filter(({ method }) => method === 'save').length,
    c.calls.filter(({ method }) => method === 'restore').length);
});

test('shop text gets one thin blue outline instead of stacked heavy highlighting', () => {
  const c = presentation();
  const original = c.ctx.fillText;
  c.ctx.fillText = original;
  c.withTextOutline(() => c.withTextOutline(() => c.ctx.fillText('Item 10z', 200, 180), '#0e0868', 1));
  assert.equal(c.calls.filter(({ method }) => method === 'strokeText').length, 1);
  assert.equal(c.calls.filter(({ method }) => method === 'fillText').length, 1);
  assert.ok(c.styles.some(({ property, value }) => property === 'strokeStyle' && value === '#0e0868'));
  assert.ok(c.styles.some(({ property, value }) => property === 'lineWidth' && value === 1));
  assert.equal(c.ctx.fillText, original);
});

test('world labels share the door font and dark outline without changing HUD defaults', () => {
  const c = presentation();
  c.withTextOutline(() => {
    for (const label of ['OPEN', 'MERCHANT', 'Bomb Bundle', 'Three bombs', '[E] BUY']) {
      c.ctx.font = '18px Georgia';
      c.ctx.fillText(label, 200, 180);
    }
  }, 'rgba(8, 6, 10, 0.92)', 3.5, 'bold 10px Arial');
  assert.equal(c.styles.filter(({ property, value }) => property === 'font' && value === 'bold 10px Arial').length, 5);
  assert.equal(c.calls.filter(({ method }) => method === 'fillText').length, 5);
  assert.equal(c.calls.filter(({ method }) => method === 'strokeText').length, 5);
  assert.ok(!c.styles.some(({ property, value }) => property === 'strokeStyle' && value === '#0e0868'));
  c.styles.length = 0;
  c.withTextOutline(() => c.ctx.fillText('HUD', 20, 20));
  assert.ok(!c.styles.some(({ property }) => property === 'font'));
});
test('player body, clothing and head retain their original size and attack pulse', () => {
  const c = presentation();
  const layers = [];
  c.character = { sprite: 'test', hue: 0, hairStyle: 'test' };
  c.humanoidSprites = { test: { image: { complete: true, naturalWidth: 1024 }, framesPerDirection: 16 } };
  Object.assign(c.player, { lookX: 0, lookY: 1, attackPulse: 0.14, attackAnimationTimer: 0,
    chargeFraction: 0, swordParryFlash: 0, invuln: 0, damageFlashTimer: 0 });
  c.equippedClothing = { legs: { sprite: 'pants' }, chest: { sprite: 'shirt' } };
  c.meleeWeapons = new Set();
  c.nativeStyle = () => 'magic';
  c.drawOrbitGuard = () => {};
  c.drawHumanoid = (...args) => layers.push(['body', args[4]]);
  c.drawClothing = (...args) => layers.push(['clothing', args[4]]);
  c.drawHead = (...args) => layers.push(['head', args[4]]);
  c.drawCastingHands = () => {};
  c.wornHat = () => null;
  loadFunctions(c, 'gameui.js', ['drawPlayer']);
  c.drawPlayer();
  assert.deepEqual(layers, [['body', 1.45], ['clothing', 1.45], ['clothing', 1.45], ['head', 1.45]]);
  const shadow = c.calls.find(({ layer, method }) => layer === 'screen' && method === 'drawImage');
  assert.deepEqual(shadow.args.slice(-2), [64 * 1.45 * 1.08, 64 * 1.45 * 0.955]);
  assert.ok(c.calls.some(({ method, args }) => method === 'scale' && args[0] === 1.08 && args[1] === 0.955));
});

test('ordinary mobs, bosses and offspring draw halfway between original and enlarged sizes', () => {
  const c = presentation();
  loadFunctions(c, 'gameui.js', ['drawEnemyBody']);
  for (const base of [0.45, 1, 1.5, 2, 3.2]) {
    const image = { complete: true, naturalWidth: 208, naturalHeight: 24 };
    c.monsterSprites = { slime: { image, frameWidth: 52, frameHeight: 24, scale: base, frames: [0] } };
    for (const variant of [{}, { boss: true }, { miniBoss: true }, { isOffspring: true }]) {
      c.calls.length = 0;
      c.drawEnemyBody({ kind: 'slime', x: 200, y: 240, hp: 4, maxHp: 4, radius: 14, ...variant });
      const body = c.calls.find(({ layer, method, args }) => layer === 'screen' &&
        method === 'drawImage' && args[0] === image).args;
      const original = base * (variant.boss ? 1.4 : 1) * (variant.miniBoss ? 1.5 : 1) *
        (variant.isOffspring ? 0.58 : 1);
      const expected = (original + Math.max(1, Math.ceil(original * 1.15))) / 2;
      assert.ok(Math.abs(body[7] / 52 - expected) < 1e-10);
      assert.ok(Math.abs(body[7] / 52 - body[8] / 24) < 1e-10);
    }
  }
});

test('both bat atlases crop baked shadows for mobs and companions without shifting their bodies', () => {
  const c = presentation();
  c.loadAsset = (name) => ({ name, complete: true, naturalWidth: 370, naturalHeight: 232 });
  const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  c.monsterSprites = vm.runInContext(`(() => {
    ${sliceText(game, 'const monsterSprites =', 'const ', 'game')}
    return monsterSprites;
  })()`, c);
  loadFunctions(c, 'gameui.js', ['drawEnemyBody', 'drawCompanion']);
  for (const kind of ['bat', 'vampirebat']) {
    const sprite = c.monsterSprites[kind];
    assert.equal(sprite.frameHeight, 58, 'atlas row stride remains unchanged');
    assert.equal(sprite.cropHeight, 22, 'only body rows precede the baked shadow');
    for (const [index, render] of [
      () => c.drawEnemyBody({ kind, x: 200, y: 240, hp: 4, maxHp: 4, radius: 14 }),
      () => c.drawCompanion({ kind, x: 200, y: 240, hp: 4 }),
    ].entries()) {
      c.calls.length = 0;
      render();
      const body = c.calls.find(({ layer, method, args }) => layer === 'screen' &&
        method === 'drawImage' && args[0] === sprite.image);
      assert.equal(body.args[4], 22);
      const scale = body.args[7] / 37;
      assert.equal(body.args[8], 22 * scale, 'crop is not stretched back to the full frame');
      assert.equal(body.args[6], (index === 0 ? 0 : 240) - 29 * scale,
        'body retains its original top position');
      assert.equal(c.sunlightMask.images.get(sprite.image).values().next().value.height, 22,
        'new projected shadows also exclude baked artwork shadows');
    }
  }
});

test('fire and lightning illuminate nearby ground and actors; acid and webs do not emit light', () => {
  const c = presentation();
  c.groundHazards = [
    { kind: 'fire', x: 200, y: 180, color: '#ff8042', radius: 24, ttl: 4 },
    { kind: 'acid', x: 400, y: 180, color: '#9af264', radius: 24, ttl: 4 },
    { kind: 'web', x: 500, y: 180, color: '#fff', radius: 24, ttl: 4 },
  ];
  c.projectiles = [
    { type: 'elemental', element: 'lightning', x: 700, y: 180, vx: 200, vy: 0, ttl: 1 },
    { type: 'arrow', x: 800, y: 180, vx: 200, vy: 0, ttl: 1 },
  ];
  c.enemyProjectiles = [{ kind: 'spore-orb', color: '#f8daff', x: 300, y: 400, vx: 100, vy: 0 }];
  c.collectWorldLights();
  assert.equal(c.collectWorldLights.lights.length, 3);
  assert.ok(c.worldLightExposure(200, 180) > 0);
  assert.equal(c.worldLightExposure(500, 180), 0);
  assert.ok(c.sunlightStrength(200, 180) < c.sunlightStrength(500, 180),
    'emission lifts local shadow darkness without removing it');
  c.drawWorldLightSources();
  assert.equal(c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'drawImage').length, 3);
  const reads = c.calls.filter(({ layer }) => layer === 'cache').length;
  c.drawWorldLightSources();
  assert.equal(c.calls.filter(({ layer }) => layer === 'cache').length, reads);
  c.groundHazards = [];
  c.projectiles = [];
  c.enemyProjectiles = [];
  c.collectWorldLights();
  assert.equal(c.worldLightExposure(200, 180), 0, 'expired effects leave no stale illumination');
});

test('ground pools and webs gain only a thin down-right depth shadow', () => {
  const c = presentation();
  c.bossStrikes = [];
  for (const kind of ['acid', 'slime', 'web', 'fire', 'miasma']) {
    c.groundHazards = [{ kind, x: 200, y: 180, radius: 24, color: '#9af264', ttl: 4 }];
    c.calls.length = 0;
    c.drawGroundHazards();
    assert.deepEqual(c.calls.find(({ method }) => method === 'translate').args, [2, 2]);
    const ellipses = c.calls.filter(({ method }) => method === 'ellipse');
    if (kind === 'web') {
      assert.equal(ellipses.length, 0, 'web shadow follows strands, not a dark filled disc');
    } else {
      assert.equal(ellipses.length, 2);
      assert.deepEqual(ellipses[0].args, ellipses[1].args);
    }
  }
});

test('visible local lighting stays capped during busy fights and culls offscreen emitters', () => {
  const c = presentation();
  c.projectiles = Array.from({ length: 100 }, (_, index) => ({
    type: 'elemental', element: 'fire', color: '#ff8042',
    x: index < 50 ? -2000 : 400, y: 200, vx: 100, vy: 0, ttl: 1,
  }));
  c.collectWorldLights();
  assert.equal(c.collectWorldLights.lights.length, 24);
  assert.ok(c.collectWorldLights.lights.every(({ x }) => x === 400));
  c.drawWorldLightSources();
  assert.equal(c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'drawImage').length, 24);
  assert.equal(c.drawWorldLightSources.textures.size, 1);
  const cachedCalls = c.calls.filter(({ layer }) => layer === 'cache').length;
  c.drawWorldLightSources();
  assert.equal(c.calls.filter(({ layer }) => layer === 'cache').length, cachedCalls);
  for (let color = 0; color < 20; color += 1) {
    c.collectWorldLights.lights = [{ x: 400, y: 200, color: `#${color.toString(16).padStart(6, '0')}`, radius: 64, strength: 0.3 }];
    c.drawWorldLightSources();
  }
  assert.equal(c.drawWorldLightSources.textures.size, 16);
});

test('low quality caps visible light sources at eight', () => {
  const c = presentation();
  c.quality.low = true;
  c.projectiles = Array.from({ length: 30 }, () => ({
    type: 'elemental', element: 'fire', color: '#ff8042', x: 400, y: 200, vx: 100, vy: 0, ttl: 1,
  }));
  c.collectWorldLights();
  assert.equal(c.collectWorldLights.lights.length, 8);
});

test('all regions receive directional lighting; cave crevices use stable 45-degree shafts', () => {
  const c = presentation();
  for (const region of ['tulimshar', 'hurnscald', 'graveyard', 'artis', 'halinarzo',
    'nivalis', 'frostia', 'candor', 'worldedge']) {
    c.region = region;
    c.calls.length = 0;
    c.drawRoomSunlight();
    assert.ok(c.drawRoomSunlight.layer);
    const cave = ['frostia', 'candor', 'worldedge'].includes(region);
    assert.equal(c.roomUsesCreviceLight(), cave);
    const screenGradients = c.calls.filter(({ layer, method }) =>
      layer === 'screen' && method === 'createLinearGradient');
    assert.equal(screenGradients.length, cave ? 2 : 0);
    for (const { args: [x, y, endX, endY] } of screenGradients) {
      assert.ok(endX > x);
      assert.equal(endX - x, endY - y, 'ceiling rays shine down and right');
    }
  }
  c.region = 'tulimshar';
  c.currentRoom.type = 'secret';
  assert.equal(c.roomUsesCreviceLight(), true);
  const shafts = c.roomLightShafts();
  const first = shafts[0];
  assert.ok(c.sunlightStrength(first.x + 100, first.y + 100) >
    c.sunlightStrength(first.x + 100, first.y - 150));
  c.elapsed += 20;
  assert.deepEqual(c.roomLightShafts(), shafts, 'crevice positions do not drift with animation time');
});

test('cave crevice rays have cached irregular feathered edges rather than straight wedges', () => {
  const c = presentation();
  c.region = 'candor';
  const shafts = c.roomLightShafts();
  for (const shaft of shafts) {
    assert.equal(shaft.contours.length, 4);
    for (const contour of shaft.contours) {
      assert.equal(contour.length, 34);
      const offsets = contour.slice(0, 17).map(([x, y]) => (x - shaft.x - y + shaft.y) / 2);
      const changes = offsets.slice(1).map((offset, index) => offset - offsets[index]);
      assert.ok(Math.max(...changes) - Math.min(...changes) > 1,
        'edge widths vary along the shaft rather than tracing a perfect straight line');
    }
  }
  c.drawRoomSunlight();
  assert.equal(c.roomLightShafts(), shafts, 'contours are reused rather than regenerated per frame');
  assert.equal(c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'fill').length, 8);
  const stops = [];
  c.ctx.createLinearGradient = () => ({ addColorStop: (...args) => stops.push(args) });
  c.drawRoomSunlight();
  assert.deepEqual(stops[0], [0, 'rgba(255, 239, 193, 0)']);
  assert.equal(stops[1][0], 0.18, 'light fades in instead of exposing a hard upper cap');
  assert.deepEqual(stops[3], [1, 'rgba(255, 239, 193, 0)']);
});

test('room light cache invalidates for doors and room geometry, not moving actors or quality', () => {
  const c = presentation();
  c.drawRoomSunlight();
  let layer = c.drawRoomSunlight.layer;
  c.player.x += 40;
  c.quality.low = true;
  c.calls.length = 0;
  c.drawRoomSunlight();
  assert.equal(c.drawRoomSunlight.layer, layer);
  assert.equal(c.calls.filter(({ layer }) => layer === 'cache').length, 0);
  for (const change of [
    () => { c.currentRoom.links.up = true; },
    () => { c.currentRoom.lockedDoors.up = true; },
    () => { c.currentRoom.secretExit = { direction: 'left', room: { hidden: false } }; },
    () => { c.ROOM_W = 1504; },
    () => { c.currentRoom.x += 1; },
  ]) {
    change();
    c.drawRoomSunlight();
    assert.notEqual(c.drawRoomSunlight.layer, layer);
    layer = c.drawRoomSunlight.layer;
  }
  const polygons = c.calls.filter(({ layer, method }) => layer === 'cache' && method === 'lineTo');
  assert.ok(polygons.length > 0);
});

test('crevice rays respect reduced motion and low quality without changing light direction', () => {
  const c = presentation();
  c.region = 'candor';
  c.drawRoomSunlight();
  const render = () => {
    c.calls.length = 0;
    c.drawRoomSunlight();
    return JSON.stringify(c.calls);
  };
  setReducedMotion(c, true);
  const still = render();
  c.elapsed += 10;
  assert.equal(render(), still);
  setReducedMotion(c, false);
  const animated = render();
  c.elapsed += 10;
  assert.notEqual(render(), animated);
  const rays = () => c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'createLinearGradient')
    .map(({ args }) => args);
  const full = rays();
  c.quality.low = true;
  render();
  assert.deepEqual(rays(), full);
  assert.equal(c.calls.filter(({ layer, method }) => layer === 'screen' && method === 'fillRect').length, 4);
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

test('ambient sand gusts animate without flags, candles or changes to room and floor data', () => {
  const c = presentation();
  const room = JSON.stringify(c.currentRoom);
  const render = () => {
    c.calls.length = 0;
    c.drawDesertWind();
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
  assert.ok(!c.calls.some(({ method }) => method === 'fillRect' || method === 'fill'));
  assert.equal(c.drawDesertScenery, undefined);
});

test('reduced motion freezes sand gusts at either quality level', () => {
  for (const low of [false, true]) {
    const c = presentation();
    c.quality.low = low;
    setReducedMotion(c, true);
    c.drawDesertWind();
    const first = JSON.stringify(c.calls);
    c.calls.length = 0;
    c.elapsed += 10;
    c.drawDesertWind();
    assert.equal(JSON.stringify(c.calls), first);
  }
});

test('sand gusts skip non-desert and secret rooms but keep lightweight animation in low quality', () => {
  const c = presentation();
  for (const [region, type] of [['hurnscald', 'normal'], ['tulimshar', 'secret']]) {
    c.region = region;
    c.currentRoom.type = type;
    c.drawDesertWind();
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
});

test('automatic quality changes never reset sand gust positions', () => {
  const c = presentation();
  const render = (low) => {
    c.quality.low = low;
    c.calls.length = 0;
    c.drawDesertWind();
    return JSON.stringify(c.calls.filter(({ method }) => method === 'quadraticCurveTo').slice(0, 1));
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

test('Tulimshar uses only castle1 upper-left frame at native scale with complete corner coverage', () => {
  const c = presentation();
  const png = fs.readFileSync(path.join(__dirname, '..', 'assets', 'tmw', 'clientdata',
    'graphics', 'tilesets', 'castle1.png'));
  assert.equal(png.readUInt32BE(16), c.tulimsharCastleTiles.naturalWidth);
  for (const [width, height] of [[960, 540], [1504, 804], [2000, 720], [1000, 1440], [997, 573]]) {
    c.ROOM_W = width;
    c.ROOM_H = height;
    c.calls.length = 0;
    c.drawTulimsharCastleWalls();
    const coverage = new Uint8Array(width * height);
    const tiles = c.calls.filter(({ method, args }) => method === 'drawImage' && args[0].name === 'evol-castle');
    for (const { args: [, sx, sy, sw, sh, x, y, dw, dh] } of tiles) {
      assert.ok(sx + sw <= 96 && sy + sh <= 128);
      assert.equal(sw, dw);
      assert.equal(sh, dh);
      assert.ok(!(sx === 32 && sy === 64), 'do not repeat the centre window as a wall');
      for (let py = y; py < y + dh; py++) {
        for (let px = x; px < x + dw; px++) coverage[py * width + px]++;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const edge = x < 32 || y < 32 || x >= width - 32 || y >= height - 32;
        assert.equal(coverage[y * width + x], edge ? 1 : 0);
      }
    }
    assert.deepEqual(tiles.filter(({ args }) => (args[5] === 0 || args[5] === width - 32) &&
      (args[6] === 0 || args[6] === height - 32)).map(({ args }) => [args[1], args[2]]),
    [[0, 0], [64, 0], [0, 96], [64, 96]]);
  }
});

test('native castle layer is cached and refreshed for openings, secrets, size and artwork readiness', () => {
  const c = presentation();
  c.tulimsharCastleTiles.complete = false;
  c.drawCachedRoomWalls(true);
  assert.equal(c.drawCachedRoomWalls.layer, undefined);
  c.tulimsharCastleTiles.complete = true;
  c.drawCachedRoomWalls(true);
  let last = c.drawCachedRoomWalls.layer;
  c.calls.length = 0;
  c.drawCachedRoomWalls(true);
  assert.equal(c.drawCachedRoomWalls.layer, last);
  assert.equal(c.calls.filter(({ layer }) => layer === 'cache').length, 0);
  for (const change of [
    () => { c.currentRoom.links.up = true; },
    () => { c.currentRoom.lockedDoors.up = true; },
    () => { c.currentRoom.secretExit = { direction: 'left', room: { hidden: false } }; },
    () => { c.ROOM_W = 1504; },
  ]) {
    change();
    c.drawCachedRoomWalls(true);
    assert.notEqual(c.drawCachedRoomWalls.layer, last);
    last = c.drawCachedRoomWalls.layer;
  }
});

test('four native doorway corner tiles turn walls outward at passage edges without projecting pillars', () => {
  const c = presentation();
  c.currentRoom.links = { up: true, down: true, left: true, right: true };
  for (const [width, height] of [[960, 540], [1504, 804], [997, 573]]) {
    c.ROOM_W = width;
    c.ROOM_H = height;
    c.calls.length = 0;
    c.drawTulimsharDoorJambs();
    const posts = c.calls.filter(({ method }) => method === 'drawImage').map(({ args }) => args);
    assert.equal(posts.length, 8);
    for (const [, sx, sy, sw, sh, x, y, dw, dh] of posts) {
      assert.ok(sx === 32 || sx === 64);
      assert.equal(sy, 640);
      assert.deepEqual([sw, sh, dw, dh], [32, 32, 32, 32]);
      assert.ok(x === -80 || x === 48);
      assert.equal(y, -16);
    }
    assert.deepEqual(posts.map((args) => [args[1], args[2]]),
      [[32, 640], [64, 640], [32, 640], [64, 640],
        [32, 640], [64, 640], [32, 640], [64, 640]]);
    const rotations = c.calls.filter(({ method }) => method === 'rotate').map(({ args }) => args[0]);
    assert.deepEqual(rotations, [-Math.PI, -0, -Math.PI * 1.5, -Math.PI / 2]);
    const centers = c.calls.filter(({ method }) => method === 'translate').map(({ args }) => args);
    assert.deepEqual(centers, [[width / 2, 16], [width / 2, height - 16],
      [16, height / 2], [width - 16, height / 2]]);
    posts.forEach((args, index) => {
      const direction = Math.floor(index / 2);
      const [cx, cy] = centers[direction];
      const angle = rotations[direction];
      for (const px of [args[5], args[5] + 32]) {
        for (const py of [-16, 16]) {
          const x = Math.round(cx + px * Math.cos(angle) - py * Math.sin(angle));
          const y = Math.round(cy + px * Math.sin(angle) + py * Math.cos(angle));
          assert.ok(x >= 0 && x <= width && y >= 0 && y <= height);
          assert.ok(x <= 32 || x >= width - 32 || y <= 32 || y >= height - 32);
        }
      }
    });
    assert.deepEqual(c.calls.filter(({ method }) => method === 'clearRect').map(({ args }) => args),
      posts.map((args) => args.slice(5)), 'remove old straight wall pixels beneath each bevel');
    assert.equal(posts[1][5] - (posts[0][5] + 32), 96);
    assert.equal(posts[3][5] - (posts[2][5] + 32), 96);
    assert.equal(posts[5][5] - (posts[4][5] + 32), 96);
    assert.equal(posts[7][5] - (posts[6][5] + 32), 96);
  }
  c.currentRoom.links = {};
  c.currentRoom.secretExit = { direction: 'left', room: { hidden: true } };
  c.calls.length = 0;
  c.drawTulimsharDoorJambs();
  assert.equal(c.calls.filter(({ method }) => method === 'drawImage').length, 0);
  c.currentRoom.secretExit.room.hidden = false;
  c.drawTulimsharDoorJambs();
  assert.equal(c.calls.filter(({ method }) => method === 'drawImage').length, 2);
  c.currentRoom.cleared = false;
  c.drawCachedRoomWalls(true);
  const before = c.drawCachedRoomWalls.layer;
  c.currentRoom.links.up = true;
  c.drawCachedRoomWalls(true);
  assert.notEqual(c.drawCachedRoomWalls.layer, before, 'sealed-room doorway jambs also invalidate the cache');
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

['drawTulimsharCastleWalls', 'drawCastleWalls'].forEach((renderer) => test(`${renderer} clips exactly to the collision band and cleared unlocked doorways at any room size`, () => {
  const c = presentation();
  if (renderer === 'drawCastleWalls') c.region = 'hurnscald';
  const band = c.roomWallBand();
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
  c.calls.length = 0;
  c.drawSoulMenhir();
  const first = JSON.stringify(c.calls);
  const sprite = c.calls.find(({ layer, method, args }) => layer === 'screen' &&
    method === 'drawImage' && args[0] === c.soulMenhirImage);
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
      const tiles = c.calls.filter(({ layer, method, args }) =>
        layer === 'cache' && method === 'drawImage' && args[0] === terrain.image);
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
    layer === 'cache' && method === 'drawImage' && args[0].name?.endsWith('artis-pavement.png'));
  assert.ok(paving.length > 40);
  for (const { args: [image, sx, sy, sw, sh, x, y, width, height] } of paving) {
    assert.equal(Math.floor(sx / 32) + Math.floor(sy / 32) * (image.naturalWidth / 32),
      c.terrainTileAt(c.terrainTiles.artis, Math.floor((x - c.roomWallBand()) / 32),
        Math.floor((y - c.roomWallBand()) / 32)));
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
        const edge = c.roomWallBand() + 4;
        const x = dx ? dx > 0 ? width - edge : edge : width / 2;
        const y = dy ? dy > 0 ? height - edge : edge : height / 2;
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
    const band = c.roomWallBand();
    const edge = band + 4;
    const columns = Math.floor((width - band * 2) / 8);
    const rows = Math.floor((height - band * 2) / 8);
    const paving = Array.from({ length: columns * rows }, (_, index) =>
      c.desertPavingCoverage(edge + index % columns * 8, edge + Math.floor(index / columns) * 8) >= 0.5);
    const center = Math.round((height / 2 - edge) / 8) * columns + Math.round((width / 2 - edge) / 8);
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
