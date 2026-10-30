/* Desert (Tulimshar) room art: dune ground with paved lanes, wind streaks, banners and torches, edge haze, sand
   footprints and the sandstone wall faces. This file only defines constants and functions; game globals such as
   ctx, ROOM_W and currentRoom are read when a function is called, so it can load before game.js. */

const DESERT_ART = {
  tile: 32, // atlas and floor tile size
  wallBand: ROOM_WALL_BAND, // the existing collision band (gameui.js); floor art stays inside it and the wall faces fill it
  ground: {
    patch: 128, // one intact dune patch is repeated instead of shuffling unrelated transition tiles
    atlasX: 256,
    atlasY: 256,
    filter: 'saturate(0.78) brightness(0.97)',
  },
  paving: {
    filter: 'sepia(1) saturate(0.8) brightness(1.05)',
    minImage: { width: 64, height: 32 },
    cell: 4, // coverage is sampled on 4px cells, shared by drawing and footprint exclusion
    hub: { radiusX: 57, radiusY: 45 }, // the worn oval at the room centre
    lane: { halfWidth: 34, swing: 5, wobble: 8, bend: 29, secondaryBend: 15 }, // lanes toward each linked door
    softness: 10, // pixels over which coverage fades from none to full
    edgeReach: 5,
    erosion: [4, 3, 2], // amplitudes of the three sine octaves that rough up the edges
    opacity: 0.65,
    footprintThreshold: 0.25, // coverage at which a print counts as being on paving
  },
  footprints: {
    minImage: 96,
    cellSize: 32,
    // Atlas cell for each of the eight headings, starting east and turning clockwise.
    cells: [[2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0]],
    spacing: 20, // pixels walked between prints
    ttl: 8, // seconds a print lasts
    fadeSeconds: 3, // fades out over the last of its life
    alpha: 0.4,
    size: 24,
    maxMarks: 96,
    resetDistance: 96, // a jump this far (a teleport or room change) restarts the trail
    margin: 76, // no prints this close to a wall
  },
  wind: {
    color: '#f9e6b5',
    lowQualityStreaks: 4, // low quality keeps a few single-stroke wisps so the room still moves
    minStreaks: 10,
    maxStreaks: 24,
    areaPerStreak: 42000,
    alpha: 0.2,
    tailAlpha: 0.7,
    seedStep: 137,
    roomSeed: { x: 17, y: 31 },
    phaseModulus: 997,
    baseSpeed: 22,
    speedStep: 3,
    speedVariants: 4,
    bobSpeed: 0.7,
    bobAmplitude: 7,
    yHash: 7,
    minLength: 28,
    lengthVariants: 42,
  },
  scenery: {
    postInset: 160, // banner post distance from the left and right walls
    topY: 10,
    bottomInset: 54,
    postColor: '#49382b',
    capColor: '#c9ac68',
    strips: 10,
    stripHeight: 3,
    clothWidth: 24,
    clothOffsetX: 11,
    clothColors: ['#974d47', '#793d3d'],
    trimColor: '#ddc18d',
    sway: { speed: 2.4, perStrip: 0.48, amplitude: 0.32 },
    torchOffsetX: 34,
    flame: { speed: 9, amplitude: 2, color: '#d77b39', core: '#ffe0a0' },
    torchColors: { pole: '#4c3824', bracket: '#aa8352' },
  },
  atmosphere: {
    hazeDepth: 100,
    hazeColor: '232, 199, 128',
    hazeStops: [[0, 0.38], [0.55, 0.12], [1, 0]],
    sandstorm: { inset: 86, alpha: 0.15, tileWidth: 512, tileHeight: 256, driftSpeed: 12 },
  },
  walls: {
    minAtlas: 512,
    atlasColumns: 16,
    // Atlas tile ids read from the Tulimshar TMX: Over (39,25..28) for the face courses, Ground (35..38,0) for the
    // side walkway. See assets/som/CREDITS.md.
    face: [2, 18, 34, 50],
    walkway: [0, 6, 6, 4],
    walkwayColumnWidth: 16,
    faceRowHeight: 16,
    cornerCell: 16,
    // Handed elbows for the four room corners (top-left, top-right, bottom-left, bottom-right), four rows of four
    // atlas ids each, drawn over the walkway. A facade is never rotated.
    corners: [
      [[0, 6, 6, 1], [0, 6, 6, 8], [0, 6, 6, 24], [0, 6, 6, 40]],
      [[3, 6, 6, 4], [6, 11, 6, 4], [26, 27, 6, 4], [42, 43, 6, 4]],
      [[0, 6, 6, 1], [0, 6, 18, 18], [0, 25, 34, 34], [40, 41, 50, 50]],
      [[3, 6, 6, 4], [18, 18, 6, 4], [34, 34, 26, 4], [50, 50, 42, 43]],
    ],
  },
};

function isDesertRegion() {
  return currentRegionId() === 'tulimshar';
}

// Desert floors are cached per room layout: the paved lanes depend on which doors the room has.
function desertLayoutKey(pavingReady) {
  const links = currentRoom.links;
  const doors = (links.up ? 1 : 0) | (links.down ? 2 : 0) | (links.left ? 4 : 0) | (links.right ? 8 : 0);
  return `:${currentRoom.x},${currentRoom.y}:${doors}:${pavingReady}`;
}

function desertPavingReady() {
  const { minImage } = DESERT_ART.paving;
  const paving = terrainTiles.artis.image;
  return Boolean(paving.complete && paving.naturalWidth >= minImage.width && paving.naturalHeight >= minImage.height);
}

// How much of a point is worn paving, 0 to 1: an oval at the room centre plus a bent, uneven lane toward each linked
// door, roughed up by erosion.
function desertPavingCoverage(x, y) {
  const { cell, hub, lane, softness, edgeReach, erosion } = DESERT_ART.paving;
  x = Math.floor(x / cell) * cell + cell / 2;
  y = Math.floor(y / cell) * cell + cell / 2;
  const seed = currentRoom.x * 1.73 + currentRoom.y * 2.37;
  const dx = x - ROOM_W / 2;
  const dy = y - ROOM_H / 2;
  let distance = (Math.hypot(dx / hub.radiusX, dy / hub.radiusY) - 1) * hub.radiusY;
  for (const { name, dx: directionX, dy: directionY } of directions) {
    if (!currentRoom.links[name]) continue;
    const along = dx * directionX + dy * directionY;
    const length = (directionX ? ROOM_W : ROOM_H) / 2 - DESERT_ART.wallBand;
    if (along < 0 || along > length + cell) continue;
    const t = along / length;
    const phase = seed + (directionX ? 1.9 : 0.6) + (directionX + directionY) * 0.8;
    const bend = Math.sin(t * Math.PI) *
      (Math.sin(phase) * lane.bend + Math.sin(t * Math.PI * 2 + phase) * lane.secondaryBend);
    const across = -dx * directionY + dy * directionX;
    const halfWidth = lane.halfWidth + Math.sin(t * Math.PI) * (lane.swing + Math.sin(t * 9 + phase) * lane.wobble);
    distance = Math.min(distance, Math.abs(across - bend) - halfWidth);
  }
  const rough = Math.sin(x * 0.061 + y * 0.037 + seed) * erosion[0] +
    Math.sin(x * 0.113 - y * 0.083 - seed) * erosion[1] +
    Math.sin(x * 0.29 + y * 0.23 + seed) * erosion[2];
  return Math.max(0, Math.min(1, (edgeReach - distance - rough) / softness));
}

function updateSandFootprints(dt) {
  const { spacing, ttl, maxMarks, resetDistance, margin } = DESERT_ART.footprints;
  const trail = sandFootprints;
  const distance = Math.hypot(player.x - trail.x, player.y - trail.y);
  if (trail.room !== currentRoom || !isDesertRegion() || currentRoom.type === 'secret' || distance > resetDistance) {
    trail.marks.length = 0;
    trail.distance = 0;
    trail.room = currentRoom;
    trail.x = player.x;
    trail.y = player.y;
    return;
  }
  for (const mark of trail.marks) mark.ttl -= dt;
  trail.marks = trail.marks.filter((mark) => mark.ttl > 0);
  if (player.moving && distance > 0) {
    const dx = (player.x - trail.x) / distance;
    const dy = (player.y - trail.y) / distance;
    const heading = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
    const pavingReady = desertPavingReady();
    for (let step = spacing - trail.distance; step <= distance; step += spacing) {
      const x = trail.x + dx * step;
      const y = trail.y + dy * step;
      const onPaving = pavingReady && desertPavingCoverage(x, y) >= DESERT_ART.paving.footprintThreshold;
      if (x >= margin && y >= margin && x <= ROOM_W - margin && y <= ROOM_H - margin && !onPaving) {
        trail.marks.push({ x, y, heading, ttl });
      }
    }
    trail.distance = (trail.distance + distance) % spacing;
    if (trail.marks.length > maxMarks) trail.marks.splice(0, trail.marks.length - maxMarks);
  } else {
    trail.distance = 0;
  }
  trail.x = player.x;
  trail.y = player.y;
}

function drawSandFootprints() {
  const { minImage, cellSize, cells, fadeSeconds, alpha, size } = DESERT_ART.footprints;
  if (sandFootprints.room !== currentRoom || !isDesertRegion() || currentRoom.type === 'secret' ||
      !sandFootprintImage.complete || sandFootprintImage.naturalWidth < minImage ||
      sandFootprintImage.naturalHeight < minImage) return;
  ctx.save();
  for (const mark of sandFootprints.marks) {
    const [column, row] = cells[mark.heading];
    ctx.globalAlpha = alpha * Math.min(1, mark.ttl / fadeSeconds);
    ctx.drawImage(sandFootprintImage, column * cellSize, row * cellSize, cellSize, cellSize,
      mark.x - size / 2, mark.y - size / 2, size, size);
  }
  ctx.restore();
}

function drawDesertGround(context, image) {
  const { tile, wallBand } = DESERT_ART;
  const { patch, atlasX, atlasY, filter } = DESERT_ART.ground;
  const { cell, opacity } = DESERT_ART.paving;
  const cells = tile / cell;
  context.save();
  context.beginPath();
  context.rect(wallBand, wallBand, ROOM_W - wallBand * 2, ROOM_H - wallBand * 2);
  context.clip();
  context.filter = filter;
  for (let y = wallBand; y < ROOM_H - wallBand; y += patch) {
    for (let x = wallBand; x < ROOM_W - wallBand; x += patch) {
      context.drawImage(image, atlasX, atlasY, patch, patch, x, y, patch, patch);
    }
  }
  if (desertPavingReady()) {
    const paving = terrainTiles.artis.image;
    context.filter = DESERT_ART.paving.filter;
    for (let y = wallBand; y < ROOM_H - wallBand; y += tile) {
      for (let x = wallBand; x < ROOM_W - wallBand; x += tile) {
        const tileId = terrainTileAt(terrainTiles.artis, x / tile - 2, y / tile - 2);
        const columns = Math.floor(paving.naturalWidth / tile);
        const sourceX = (tileId % columns) * tile;
        const sourceY = Math.floor(tileId / columns) * tile;
        const coverage = Array.from({ length: cells * cells }, (_, index) =>
          desertPavingCoverage(x + index % cells * cell, y + Math.floor(index / cells) * cell));
        if (coverage.every((value) => value === 0)) continue;
        if (coverage.every((value) => value === 1)) {
          context.globalAlpha = opacity;
          context.drawImage(paving, sourceX, sourceY, tile, tile, x, y, tile, tile);
          continue;
        }
        // Erode the texture at cell resolution, without shuffling or stretching its stones.
        for (let row = 0; row < cells; row += 1) {
          for (let column = 0; column < cells;) {
            const alpha = coverage[row * cells + column];
            let end = column + 1;
            while (end < cells && coverage[row * cells + end] === alpha) end += 1;
            if (alpha > 0) {
              context.globalAlpha = alpha * opacity;
              context.drawImage(paving, sourceX + column * cell, sourceY + row * cell,
                (end - column) * cell, cell, x + column * cell, y + row * cell, (end - column) * cell, cell);
            }
            column = end;
          }
        }
      }
    }
  }
  context.restore();
}

function drawDesertWind() {
  if (!isDesertRegion() || currentRoom.type === 'secret') return;
  const { wallBand } = DESERT_ART;
  const wind = DESERT_ART.wind;
  const time = prefersReducedMotion() ? 0 : elapsed;
  const width = ROOM_W - wallBand * 2;
  const height = ROOM_H - wallBand * 2;
  const count = quality.low ? wind.lowQualityStreaks
    : Math.min(wind.maxStreaks, Math.max(wind.minStreaks, Math.ceil(width * height / wind.areaPerStreak)));
  ctx.save();
  ctx.beginPath();
  ctx.rect(wallBand, wallBand, width, height);
  ctx.clip();
  ctx.lineCap = 'round';
  for (let index = 0; index < count; index += 1) {
    const seed = index * wind.seedStep + currentRoom.x * wind.roomSeed.x + currentRoom.y * wind.roomSeed.y;
    const speed = wind.baseSpeed + index % wind.speedVariants * wind.speedStep;
    const phase = ((seed % wind.phaseModulus) / wind.phaseModulus + time * speed / width) % 1;
    const x = wallBand + phase * width;
    const y = wallBand + ((seed * wind.yHash) % height) + Math.sin(time * wind.bobSpeed + index) * wind.bobAmplitude;
    const length = wind.minLength + seed % wind.lengthVariants;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * wind.alpha;
    ctx.strokeStyle = wind.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - length, y + 4);
    ctx.quadraticCurveTo(x - length / 2, y - 5, x, y);
    ctx.stroke();
    if (quality.low) continue;
    ctx.globalAlpha *= wind.tailAlpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - length + 8, y + 7);
    ctx.quadraticCurveTo(x - length / 2, y, x + 12, y + 3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDesertScenery() {
  if (!isDesertRegion() || currentRoom.type === 'secret') return;
  const scenery = DESERT_ART.scenery;
  const time = prefersReducedMotion() ? 0 : elapsed;
  ctx.save();
  for (const x of [scenery.postInset, ROOM_W - scenery.postInset]) {
    for (const y of [scenery.topY, ROOM_H - scenery.bottomInset]) {
      ctx.fillStyle = scenery.postColor;
      ctx.fillRect(x - 16, y, 34, 4);
      ctx.fillStyle = scenery.capColor;
      ctx.fillRect(x - 17, y - 1, 36, 2);
      // Cloth is drawn in short horizontal strips so only its free edge ripples.
      for (let strip = 0; strip < scenery.strips; strip += 1) {
        const sway = Math.sin(time * scenery.sway.speed - strip * scenery.sway.perStrip + x) *
          strip * scenery.sway.amplitude;
        const clothX = x - scenery.clothOffsetX + Math.round(sway);
        const clothY = y + 4 + strip * scenery.stripHeight;
        ctx.fillStyle = scenery.clothColors[strip % 3 === 0 ? 0 : 1];
        ctx.fillRect(clothX, clothY, scenery.clothWidth, scenery.stripHeight);
        ctx.fillStyle = scenery.trimColor;
        ctx.fillRect(clothX + 3, clothY, 3, scenery.stripHeight);
        ctx.fillRect(clothX + 19, clothY, 2, scenery.stripHeight);
      }
      const torchX = x + scenery.torchOffsetX;
      const flame = Math.sin(time * scenery.flame.speed + x + y) * scenery.flame.amplitude;
      ctx.fillStyle = scenery.torchColors.pole;
      ctx.fillRect(torchX - 2, y + 18, 5, 18);
      ctx.fillStyle = scenery.torchColors.bracket;
      ctx.fillRect(torchX - 5, y + 20, 11, 4);
      ctx.fillStyle = scenery.flame.color;
      ctx.beginPath();
      ctx.moveTo(torchX - 5, y + 18);
      ctx.quadraticCurveTo(torchX - 7, y + 11, torchX + flame, y + 3);
      ctx.quadraticCurveTo(torchX + 8, y + 15, torchX + 4, y + 19);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = scenery.flame.core;
      ctx.fillRect(torchX - 1 + Math.round(flame / 2), y + 12, 3, 7);
    }
  }
  ctx.restore();
}

function drawRegionAtmosphere() {
  if (!isDesertRegion() || currentRoom.type === 'secret') return;
  const { hazeDepth, hazeColor, hazeStops, sandstorm } = DESERT_ART.atmosphere;
  ctx.save();
  const left = -camera.x;
  const top = -camera.y;
  const edges = [
    [left, top, ROOM_W, hazeDepth, left, top, left, top + hazeDepth],
    [left, top + ROOM_H - hazeDepth, ROOM_W, hazeDepth,
      left, top + ROOM_H, left, top + ROOM_H - hazeDepth],
    [left, top, hazeDepth, ROOM_H, left, top, left + hazeDepth, top],
    [left + ROOM_W - hazeDepth, top, hazeDepth, ROOM_H,
      left + ROOM_W, top, left + ROOM_W - hazeDepth, top],
  ];
  for (const [x, y, width, height, x0, y0, x1, y1] of edges) {
    const haze = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [stop, alpha] of hazeStops) haze.addColorStop(stop, `rgba(${hazeColor}, ${alpha})`);
    ctx.fillStyle = haze;
    ctx.fillRect(x, y, width, height);
  }
  if (!quality.low && desertSandstormImage.complete && desertSandstormImage.naturalWidth > 0) {
    ctx.beginPath();
    ctx.rect(left, top, ROOM_W, ROOM_H);
    ctx.rect(left + sandstorm.inset, top + sandstorm.inset,
      ROOM_W - sandstorm.inset * 2, ROOM_H - sandstorm.inset * 2);
    ctx.clip('evenodd');
    ctx.globalAlpha = sandstorm.alpha;
    const drift = prefersReducedMotion() ? 0 : (elapsed * sandstorm.driftSpeed) % sandstorm.tileWidth;
    for (let y = top - sandstorm.tileHeight; y < top + ROOM_H; y += sandstorm.tileHeight) {
      for (let x = left - sandstorm.tileWidth + drift; x < left + ROOM_W; x += sandstorm.tileWidth) {
        ctx.drawImage(desertSandstormImage, x, y, sandstorm.tileWidth, sandstorm.tileHeight);
      }
    }
  }
  ctx.restore();
}

function drawSandstoneWalls() {
  const { tile: tileSize, wallBand } = DESERT_ART;
  const walls = DESERT_ART.walls;
  if (!sandstoneWallTiles.complete || sandstoneWallTiles.naturalWidth < walls.minAtlas ||
      sandstoneWallTiles.naturalHeight < walls.minAtlas) return;
  // Compress only wall depth to keep the existing 64px collision band and door positions.
  const tile = (id, x, y, width, height) => {
    ctx.drawImage(sandstoneWallTiles, id % walls.atlasColumns * tileSize, Math.floor(id / walls.atlasColumns) * tileSize,
      tileSize, tileSize, x, y, width, height);
  };
  ctx.save();
  clipRoomWallBand();
  for (let y = wallBand; y < ROOM_H - wallBand; y += tileSize) {
    for (let column = 0; column < walls.walkway.length; column += 1) {
      tile(walls.walkway[column], column * walls.walkwayColumnWidth, y, walls.walkwayColumnWidth, tileSize);
      tile(walls.walkway[column], ROOM_W - wallBand + column * walls.walkwayColumnWidth, y,
        walls.walkwayColumnWidth, tileSize);
    }
  }
  for (let x = wallBand; x < ROOM_W - wallBand; x += tileSize) {
    for (let row = 0; row < walls.face.length; row += 1) {
      const width = Math.min(tileSize, ROOM_W - wallBand - x);
      tile(walls.face[row], x, row * walls.faceRowHeight, width, walls.faceRowHeight);
      tile(walls.face[row], x, ROOM_H - wallBand + row * walls.faceRowHeight, width, walls.faceRowHeight);
    }
  }
  const cell = walls.cornerCell;
  const origins = [[0, 0], [ROOM_W - wallBand, 0], [0, ROOM_H - wallBand], [ROOM_W - wallBand, ROOM_H - wallBand]];
  origins.forEach(([x, y], corner) => {
    // The TMX places transparent corner artwork over the wall-top ground layer.
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        tile(walls.walkway[column], x + column * cell, y + row * cell, cell, cell);
      }
    }
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        tile(walls.corners[corner][row][column], x + column * cell, y + row * cell, cell, cell);
      }
    }
  });
  ctx.restore();
}
