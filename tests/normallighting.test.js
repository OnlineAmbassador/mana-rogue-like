const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions } = require('./helpers/load');

function lightingContext({ width = 64, height = 32, low = false } = {}) {
  const draws = [];
  const reads = [];
  const makeCanvas = () => {
    const canvas = { width: 0, height: 0, rows: [] };
    const context = {
      scale() {}, save() {}, restore() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {},
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect: () => draws.push({ canvas, fill: true }),
      drawImage(...args) {
        if (args[0]?.pixels) canvas.image = args[0];
        draws.push({ canvas, args, composite: context.globalCompositeOperation });
      },
      getImageData(x, y, readWidth, readHeight) {
        reads.push(canvas);
        if (canvas.image.blocked) throw Object.assign(new Error('blocked'), { name: 'SecurityError' });
        const data = new Uint8ClampedArray(readWidth * readHeight * 4);
        const scale = canvas.image.naturalWidth / canvas.width;
        for (let row = 0; row < readHeight; row += 1) {
          for (let column = 0; column < readWidth; column += 1) {
            const value = canvas.image.pixels((x + column) * scale, (y + row) * scale);
            data.set([value, value, value, 255], (row * readWidth + column) * 4);
          }
        }
        return { data };
      },
      createImageData: (imageWidth, imageHeight) => ({ width: imageWidth, height: imageHeight,
        data: new Uint8ClampedArray(imageWidth * imageHeight * 4) }),
      putImageData(image, x, y) { canvas.rows.push({ image, x, y }); },
    };
    canvas.getContext = () => context;
    return canvas;
  };
  const c = vm.createContext({
    ROOM_W: width, ROOM_H: height, quality: { low }, document: { createElement: makeCanvas },
    ctx: { drawImage(...args) { draws.push({ canvas: 'screen', args, composite: this.globalCompositeOperation }); },
      globalAlpha: 1 },
    console: { warn: (...args) => c.warnings.push(args) }, warnings: [], draws, reads, Proxy, Set, Map,
  });
  loadFunctions(c, 'lightingmanager.js', ['tilesetNormalMap', 'bakeTilesetNormalRows', 'recordNormalMapSource', 'replayNormalMapOps',
    'requestRoomNormalMap', 'advanceRoomNormalMap', 'normalLightFalloff', 'normalReliefLayer', 'drawNormalMappedLight',
    'normalMaterialFor']);
  return c;
}

const tileset = (pixels, naturalWidth = 8, naturalHeight = 4) => ({ complete: true, naturalWidth, naturalHeight, pixels });

function alpha(canvas, x, y) {
  const row = canvas.rows.find(({ image, y: top }) => y >= top && y < top + image.height);
  return row.image.data[((y - row.y) * row.image.width + x) * 4 + 3];
}

test('normal relief is baked once per tileset and reused by every room that places its tiles', () => {
  const c = lightingContext();
  const ridge = tileset((x) => x >= 4 ? 255 : 0);
  const place = (target) => {
    target.fillRect(0, 0, 64, 32);
    target.drawImage(ridge, 0, 0, 8, 4, 10, 10, 8, 4);
  };
  c.requestRoomNormalMap('room-a', place);
  c.advanceRoomNormalMap(16);
  const map = c.tilesetNormalMap(ridge);
  assert.equal(map.row, 2, 'tileset baking is spread across frames');
  for (let frame = 0; frame < 8; frame += 1) c.advanceRoomNormalMap(16);
  assert.equal(map.ready, true);
  assert.equal(map.source, null, 'temporary tileset pixels are released after baking');
  assert.ok(alpha(map.responses[0], 3, 1) > alpha(map.responses[1], 3, 1),
    'a surface facing left catches light from the left more than light from the right');
  assert.equal(c.requestRoomNormalMap.state.ready, true);
  const replayed = c.draws.filter(({ canvas, args }) => c.requestRoomNormalMap.state.responses.includes(canvas) && args);
  assert.equal(replayed.length, 4, 'each direction replays the room tile placement once');
  replayed.forEach(({ args }, direction) => assert.equal(args[0], map.responses[direction]));
  assert.deepEqual([...replayed[0].args.slice(1)], [0, 0, 8, 4, 10, 10, 8, 4]);
  assert.ok(!c.draws.some(({ canvas, fill }) => fill && c.requestRoomNormalMap.state.responses.includes(canvas)),
    'flat fills never become relief');

  const readsBefore = c.reads.length;
  c.requestRoomNormalMap('room-b', place);
  for (let frame = 0; frame < 4; frame += 1) c.advanceRoomNormalMap(16);
  assert.equal(c.requestRoomNormalMap.state.ready, true);
  assert.equal(c.reads.length, readsBefore, 'a new room never reads pixels again');
});

test('magic lights add relief highlights and shade slopes turned away, without washing flat ground white', () => {
  const c = lightingContext({ width: 100, height: 100 });
  const flat = tileset(() => 128);
  c.requestRoomNormalMap('room', (target) => target.drawImage(flat, 0, 0, 100, 100));
  for (let frame = 0; frame < 5; frame += 1) c.advanceRoomNormalMap(100000);
  const map = c.tilesetNormalMap(flat);
  assert.equal(alpha(map.responses[0], 3, 1), 0, 'flat ground adds no highlight of its own');
  c.ctx.globalCompositeOperation = 'screen';
  c.ctx.globalAlpha = 0.5;
  assert.equal(c.drawNormalMappedLight(50, 50, 20, 0.3, '#7fd8ff'), true);
  const [lit, shade] = c.drawNormalMappedLight.works;
  const litDraws = c.draws.filter(({ canvas }) => canvas === lit);
  assert.equal(litDraws.length, 5);
  assert.equal(litDraws.at(-1).args[0], c.normalLightFalloff.cache.get('#7fd8ff'));
  assert.equal(litDraws.at(-1).composite, 'source-in');
  const shadeDraws = c.draws.filter(({ canvas }) => canvas === shade);
  const roomMaps = c.requestRoomNormalMap.state.responses;
  assert.deepEqual(shadeDraws.slice(0, 4).map(({ args }) => roomMaps.indexOf(args[0])), [3, 2, 1, 0],
    'shading uses the opposite mask: slopes facing away from the light');
  const screen = c.draws.filter(({ canvas }) => canvas === 'screen');
  assert.equal(screen.at(-2).composite, 'lighter', 'relief stays visible on bright sand');
  assert.equal(screen.at(-1).composite, 'source-over');
  assert.deepEqual([...screen.at(-1).args.slice(5)], [30, 30, 40, 40]);
  assert.equal(c.ctx.globalCompositeOperation, 'screen', 'the surrounding glow blend is restored');
  assert.equal(c.ctx.globalAlpha, 0.5);
  c.drawNormalMappedLight(50, 50, 20, 0.3, '#7fd8ff');
  assert.equal(c.normalLightFalloff.cache.size, 2, 'falloffs are cached per color');

  const before = c.draws.length;
  c.drawNormalMappedLight(50, 50, 20, 0.3, '#13081f', true);
  const darkScreen = c.draws.slice(before).filter(({ canvas }) => canvas === 'screen');
  assert.equal(darkScreen.length, 1, 'absorbing magic adds no highlight');
  assert.equal(darkScreen[0].composite, 'source-over');
  const darkShade = c.draws.slice(before).filter(({ canvas }) => canvas === shade);
  assert.deepEqual(darkShade.slice(0, 4).map(({ args }) => roomMaps.indexOf(args[0])), [0, 1, 2, 3],
    'darkness shades the slopes that face it');
});

test('each ground type bakes its own relief: soft grass and snow, rough cave rock, crisp cobbles', () => {
  const c = lightingContext();
  const named = (src) => c.normalMaterialFor({ src: `assets/tmw/clientdata/graphics/tiles/${src}.png` }).name;
  assert.equal(named('woodland_ground'), 'grass');
  assert.equal(named('woodland_graveyard_ground'), 'grass');
  assert.equal(named('savannah'), 'grass');
  assert.equal(named('snow'), 'snow');
  assert.equal(named('desert2'), 'sand');
  assert.equal(named('cave2'), 'cave');
  assert.equal(named('icecave'), 'cave');
  assert.equal(named('stoneground'), 'cave');
  assert.equal(named('evol/artis-pavement'), 'cobble');
  assert.equal(named('castle1'), 'cobble');
  const bumps = (x, y) => 128 + 100 * Math.sin(x / 2.5) * Math.sin(y / 2.5);
  const strongest = (src) => {
    const image = Object.assign(tileset(bumps, 32, 32), { src });
    const map = c.tilesetNormalMap(image);
    c.bakeTilesetNormalRows(map, 32 * 32);
    let total = 0;
    for (let y = 2; y < 30; y += 1) for (let x = 2; x < 30; x += 1) total += alpha(map.responses[0], x, y);
    return total;
  };
  const cave = strongest('tiles/cave2.png');
  const grass = strongest('tiles/woodland_ground.png');
  assert.ok(cave > grass * 1.5, `rough cave relief (${cave}) is much stronger than soft grass (${grass})`);
});

test('low quality halves tileset and room relief and unreadable art falls back to plain glow', () => {
  const c = lightingContext({ width: 101, height: 51, low: true });
  const blocked = Object.assign(tileset(() => 0, 64, 32), { blocked: true });
  c.requestRoomNormalMap('room', (target) => target.drawImage(blocked, 0, 0));
  assert.equal(c.requestRoomNormalMap.state.width, 51);
  assert.equal(c.requestRoomNormalMap.state.height, 26);
  c.advanceRoomNormalMap();
  const map = c.tilesetNormalMap(blocked);
  assert.equal(map.width, 32);
  assert.equal(map.failed, true);
  assert.equal(c.warnings.length, 1);
  c.advanceRoomNormalMap();
  assert.equal(c.warnings.length, 1);
  assert.equal(c.drawNormalMappedLight(10, 10, 8, 0.3, {}), false);
});

test('neighbouring atlas tiles never bake false seams into each other', () => {
  const c = lightingContext();
  const twoTiles = tileset((x) => x >= 32 ? 255 : 0, 64, 32);
  const map = c.tilesetNormalMap(twoTiles);
  c.bakeTilesetNormalRows(map, 64 * 32);
  assert.equal(map.ready, true);
  for (const x of [31, 32]) {
    assert.equal(alpha(map.responses[0], x, 16), alpha(map.responses[0], 16, 16));
    assert.equal(alpha(map.responses[1], x, 16), alpha(map.responses[1], 16, 16));
  }
});

test('only the four most recently used tilesets keep baked relief', () => {
  const c = lightingContext();
  const sets = Array.from({ length: 6 }, () => tileset(() => 0));
  for (const image of sets) c.tilesetNormalMap(image);
  assert.equal(c.tilesetNormalMap.maps.size, 4);
  assert.deepEqual([...c.tilesetNormalMap.maps.keys()].map((image) => sets.indexOf(image)), [2, 3, 4, 5]);
});

test('room relief renders the room once and composes directions from the recorded tile draws', () => {
  const c = lightingContext();
  const ridge = tileset((x) => x >= 4 ? 255 : 0);
  const filtered = { sourceImage: ridge, width: 8, height: 4 };
  let renders = 0;
  c.requestRoomNormalMap('room', (target) => {
    renders += 1;
    target.filter = 'sepia(1)';
    target.drawImage(filtered, 0, 0, 8, 4, 10, 10, 8, 4);
  });
  for (let frame = 0; frame < 6; frame += 1) c.advanceRoomNormalMap(100000);
  assert.equal(c.requestRoomNormalMap.state.ready, true);
  assert.equal(renders, 1, 'composing four directions must not re-run the room renderer');
  const map = c.tilesetNormalMap(ridge);
  const replayed = c.draws.filter(({ canvas, args }) => c.requestRoomNormalMap.state.responses.includes(canvas) && args);
  replayed.forEach(({ args }, direction) => assert.equal(args[0], map.responses[direction],
    'pre-filtered tiles bake from their source art'));
  assert.equal(replayed.length, 4);
  assert.ok(c.requestRoomNormalMap.state.contexts.every((context) => context.filter === undefined),
    'colour filters never tint the relief masks');
});
