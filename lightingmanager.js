/* Sunlight, cast shadows and local light sources. Game globals such as ctx, camera and currentRoom are read
   when a function is called, so it loads after gameui.js and before the managers that draw with it. */

function roomUsesCreviceLight() {
  return currentRoom.type === 'secret' || ['candor', 'frostia', 'worldedge'].includes(currentRegionId());
}

function roomLightShafts() {
  const band = roomWallBand();
  const seed = currentRoom.x * 17 + currentRoom.y * 31;
  const key = `${currentRegionId()}:${currentRoom.x}:${currentRoom.y}:${ROOM_W}:${ROOM_H}:${band}`;
  if (roomLightShafts.key === key) return roomLightShafts.shafts;
  roomLightShafts.key = key;
  roomLightShafts.shafts = [0.22, 0.62].map((fraction, index) => ({
    x: Math.round(band + (ROOM_W - band * 2) * fraction),
    y: Math.round(band + 24 + ((seed + index * 43) % 61 + 61) % 61),
    length: Math.min(ROOM_H - band * 2, 360 + index * 80),
    width: 30 + index * 16,
  }));
  return roomLightShafts.shafts;
}

function sunlightStrength(x, y) {
  const cave = roomUsesCreviceLight();
  let strength = cave ? 0.11 : 0.26;
  if (cave) {
    for (const shaft of roomLightShafts()) {
      const along = ((x - shaft.x) + (y - shaft.y)) / 2;
      if (along < -32 || along > shaft.length + 64) continue;
      const across = Math.abs((x - shaft.x) - (y - shaft.y));
      strength = Math.max(strength, 0.11 + 0.16 * Math.max(0, 1 - across / (shaft.width + 80)));
    }
  }
  return strength * (1 - worldLightExposure(x, y));
}

function worldLightExposure(x, y) {
  let glow = 0;
  for (const light of collectWorldLights.lights || []) {
    if (light.dark) continue;
    const reach = light.both ? light.radius * 0.55 : light.radius;
    const falloff = Math.max(0, 1 - Math.hypot(x - light.x, y - light.y) / reach);
    glow = Math.max(glow, falloff * falloff * light.strength);
  }
  return glow;
}

// Ground types catch light differently: grass and snow are soft and fine-grained, sand is gentle,
// cave rock is deep and rough, and cobbles and masonry have crisp raised edges.
// depth scales the surface slope, blur smooths blade and grain noise first, gain sets how strongly slopes respond.
function normalMaterialFor(image) {
  const name = String(image?.src || image?.name || '').toLowerCase();
  if (/snow/.test(name)) return { name: 'snow', depth: 0.45, blur: 1, gain: 2 };
  if (/woodland|grass|savannah|graveyard|forest/.test(name)) return { name: 'grass', depth: 0.55, blur: 1, gain: 2.2 };
  if (/desert[12]|sand|dune/.test(name)) return { name: 'sand', depth: 0.7, blur: 1, gain: 2.4 };
  if (/cave|stoneground|rock|crystal/.test(name)) return { name: 'cave', depth: 1.25, blur: 0, gain: 3 };
  if (/pavement|castle|cobble|brick|wall|market|interior|masonry/.test(name)) {
    return { name: 'cobble', depth: 1.1, blur: 0, gain: 2.8 };
  }
  return { name: 'default', depth: 0.9, blur: 0, gain: 2.6 };
}

// Each tileset is baked once: Sobel normals from its own pixels become four diagonal light-response
// masks. Rooms reuse them by replaying their tile placement, so no room pixels are ever read.
function tilesetNormalMap(image) {
  if (!image?.complete || !(image.naturalWidth > 0)) return null;
  const maps = tilesetNormalMap.maps || (tilesetNormalMap.maps = new Map());
  const scale = quality.low ? 0.5 : 1;
  let state = maps.get(image);
  if (state && state.scale === scale && state.sourceWidth === image.naturalWidth) {
    maps.delete(image);
    maps.set(image, state);
    return state;
  }
  const width = Math.max(1, Math.ceil(image.naturalWidth * scale));
  const height = Math.max(1, Math.ceil(image.naturalHeight * scale));
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  sourceContext.imageSmoothingEnabled = scale !== 1;
  sourceContext.drawImage(image, 0, 0, width, height);
  const responses = [0, 1, 2, 3].map(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  state = {
    image, scale, sourceWidth: image.naturalWidth, width, height, source, sourceContext, responses,
    material: normalMaterialFor(image),
    contexts: responses.map((canvas) => canvas.getContext('2d')), row: 0, ready: false, failed: false,
  };
  maps.delete(image);
  maps.set(image, state);
  // A descent visits few tilesets; keep the four most recently used.
  while (maps.size > 4) maps.delete(maps.keys().next().value);
  return state;
}

function bakeTilesetNormalRows(state, pixelBudget) {
  const { width, height } = state;
  const material = state.material || normalMaterialFor(state.image);
  const startRow = state.row;
  const endRow = Math.min(height, startRow + Math.max(1, Math.floor(pixelBudget / width)));
  const margin = 1 + material.blur;
  const readStart = Math.max(0, startRow - margin);
  const readEnd = Math.min(height, endRow + margin);
  let source;
  try {
    source = state.sourceContext.getImageData(0, readStart, width, readEnd - readStart).data;
  } catch (error) {
    if (error.name !== 'SecurityError') throw error;
    state.failed = true;
    state.source = null;
    state.sourceContext = null;
    if (!bakeTilesetNormalRows.readbackWarning) {
      console.warn('Normal-mapped magic light needs readable tilesets; serve the game over HTTP.', error);
      bakeTilesetNormalRows.readbackWarning = true;
    }
    return 0;
  }
  const rows = endRow - startRow;
  const outputs = state.contexts.map((context) => context.createImageData(width, rows));
  const cell = Math.max(1, Math.round(32 * state.scale));
  const heights = new Float32Array(width * (readEnd - readStart));
  for (let index = 0; index < heights.length; index += 1) {
    const pixel = index * 4;
    heights[index] = (source[pixel] * 0.299 + source[pixel + 1] * 0.587 + source[pixel + 2] * 0.114) *
      source[pixel + 3] / 65025;
  }
  // Samples are clamped to this pixel's tile and the rows read, so atlas neighbours never draw false seams.
  const sample = (field, x, y, cellLeft, cellTop) => {
    const sampleX = Math.max(cellLeft, Math.min(Math.min(cellLeft + cell, width) - 1, x));
    const sampleY = Math.max(Math.max(cellTop, readStart), Math.min(Math.min(cellTop + cell, readEnd) - 1, y));
    return field[(sampleY - readStart) * width + sampleX];
  };
  let surface = heights;
  if (material.blur) {
    surface = new Float32Array(heights.length);
    for (let y = readStart; y < readEnd; y += 1) {
      const cellTop = y - y % cell;
      for (let x = 0; x < width; x += 1) {
        const cellLeft = x - x % cell;
        let total = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) total += sample(heights, x + dx, y + dy, cellLeft, cellTop);
        }
        surface[(y - readStart) * width + x] = total / 9;
      }
    }
  }
  const lightZ = 1.25;
  const directions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const lightLength = Math.hypot(1, 1, lightZ);
  const flatResponse = lightZ / lightLength;
  const { depth, gain } = material;
  for (let y = startRow; y < endRow; y += 1) {
    const cellTop = y - y % cell;
    for (let x = 0; x < width; x += 1) {
      const cellLeft = x - x % cell;
      const topLeft = sample(surface, x - 1, y - 1, cellLeft, cellTop);
      const top = sample(surface, x, y - 1, cellLeft, cellTop);
      const topRight = sample(surface, x + 1, y - 1, cellLeft, cellTop);
      const left = sample(surface, x - 1, y, cellLeft, cellTop);
      const right = sample(surface, x + 1, y, cellLeft, cellTop);
      const bottomLeft = sample(surface, x - 1, y + 1, cellLeft, cellTop);
      const bottom = sample(surface, x, y + 1, cellLeft, cellTop);
      const bottomRight = sample(surface, x + 1, y + 1, cellLeft, cellTop);
      const normalX = -((topRight + right * 2 + bottomRight) - (topLeft + left * 2 + bottomLeft)) * depth;
      const normalY = -((bottomLeft + bottom * 2 + bottomRight) - (topLeft + top * 2 + topRight)) * depth;
      const normalLength = Math.hypot(normalX, normalY, 1);
      const outputIndex = ((y - startRow) * width + x) * 4;
      for (let direction = 0; direction < directions.length; direction += 1) {
        const [lightX, lightY] = directions[direction];
        const response = (normalX * lightX + normalY * lightY + lightZ) / normalLength / lightLength;
        const data = outputs[direction].data;
        data[outputIndex] = data[outputIndex + 1] = data[outputIndex + 2] = 255;
        // Flat ground stays at zero: the plain glow already lights it, so only slopes add highlights. The mask
        // for the opposite direction doubles as this direction's shading (slopes turned away from the light).
        data[outputIndex + 3] = Math.round(Math.max(0, Math.min(1, (response - flatResponse) * gain)) * 255);
      }
    }
  }
  for (let direction = 0; direction < outputs.length; direction += 1) {
    state.contexts[direction].putImageData(outputs[direction], 0, startRow);
  }
  state.row = endRow;
  if (endRow >= height) {
    state.ready = true;
    state.source = null;
    state.sourceContext = null;
  }
  return rows * width;
}

// Records a room's drawing once. Only state changes and tileset draws are kept, so composing each light direction
// replays a flat command list instead of re-running the room renderer.
function recordNormalMapSource(drawSource) {
  const ops = [];
  const tilesets = new Set();
  const state = {};
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const skipped = new Set(['fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText', 'putImageData']);
  const queries = new Set(['createLinearGradient', 'createRadialGradient', 'createPattern', 'measureText',
    'getImageData', 'createImageData', 'getTransform', 'isPointInPath']);
  drawSource(new Proxy(probe.getContext('2d'), {
    get(real, property) {
      if (property === 'drawImage') {
        return (image, ...args) => {
          // Pre-filtered tilesets bake relief from their original artwork.
          const tileset = image?.sourceImage || image;
          if (!(tileset?.naturalWidth > 0)) return;
          tilesets.add(tileset);
          const { naturalWidth: width, naturalHeight: height } = tileset;
          ops.push({ tileset, args: args.length >= 8 ? args : args.length >= 4 ? [0, 0, width, height, ...args]
            : [0, 0, width, height, args[0], args[1], width, height] });
        };
      }
      if (skipped.has(property)) return () => {};
      if (property in state) return state[property];
      const value = real[property];
      if (typeof value !== 'function') return value;
      if (queries.has(property)) return value.bind(real);
      return (...args) => ops.push({ method: property, args });
    },
    set(real, property, value) {
      // Colour filters would tint the white relief masks.
      if (property !== 'filter') {
        state[property] = value;
        ops.push({ property, value });
      }
      return true;
    },
  }));
  return { ops, tilesets: [...tilesets] };
}

function replayNormalMapOps(target, ops, direction, maps) {
  for (const op of ops) {
    if (op.tileset) {
      const map = maps.get(op.tileset);
      if (!map?.ready) continue;
      const [sx, sy, sw, sh, dx, dy, dw, dh] = op.args;
      target.drawImage(map.responses[direction], sx * map.scale, sy * map.scale, sw * map.scale, sh * map.scale,
        dx, dy, dw, dh);
    } else if (op.method) {
      target[op.method](...op.args);
    } else {
      target[op.property] = op.value;
    }
  }
}

function requestRoomNormalMap(key, drawSource) {
  const scale = quality.low ? 0.5 : 1;
  const fullKey = `${key}:${scale}`;
  if (requestRoomNormalMap.state?.key === fullKey) return;
  const width = Math.max(1, Math.ceil(ROOM_W * scale));
  const height = Math.max(1, Math.ceil(ROOM_H * scale));
  const { ops, tilesets } = recordNormalMapSource(drawSource);
  const responses = [0, 1, 2, 3].map(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  requestRoomNormalMap.state = {
    key: fullKey, scale, width, height, ops, tilesets, responses,
    contexts: responses.map((canvas) => canvas.getContext('2d')), composed: 0, ready: false,
  };
}

function advanceRoomNormalMap(pixelBudget = 30000) {
  const state = requestRoomNormalMap.state;
  if (!state || state.ready) return;
  const maps = state.tilesets.map(tilesetNormalMap).filter(Boolean);
  let budget = pixelBudget;
  for (const map of maps) {
    if (map.ready || map.failed) continue;
    budget -= bakeTilesetNormalRows(map, budget);
    if (budget <= 0) return;
  }
  if (!maps.some((map) => map.ready)) return;
  if (maps.some((map) => !map.ready && !map.failed)) return;
  // One direction per frame keeps room entry smooth on phones.
  const direction = state.composed;
  const target = state.contexts[direction];
  target.save();
  target.clearRect(0, 0, state.width, state.height);
  target.imageSmoothingEnabled = state.scale !== 1;
  target.scale(state.scale, state.scale);
  replayNormalMapOps(target, state.ops, direction, new Map(maps.map((map) => [map.image, map])));
  target.restore();
  state.composed += 1;
  state.ready = state.composed >= state.contexts.length;
}

// The TMW glow particle is too faint to reveal relief, so relief uses its own smooth colored falloff.
function normalLightFalloff(color) {
  const cache = normalLightFalloff.cache || (normalLightFalloff.cache = new Map());
  let texture = cache.get(color);
  if (texture) return texture;
  texture = document.createElement('canvas');
  texture.width = texture.height = 128;
  const target = texture.getContext('2d');
  target.fillStyle = color;
  target.fillRect(0, 0, 128, 128);
  const falloff = target.createRadialGradient(64, 64, 0, 64, 64, 64);
  // Steep falloff: bright at the attack itself and nearly gone well before the light's outer edge.
  falloff.addColorStop(0, 'rgba(255, 255, 255, 1)');
  falloff.addColorStop(0.3, 'rgba(255, 255, 255, 0.55)');
  falloff.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)');
  falloff.addColorStop(0.85, 'rgba(255, 255, 255, 0.02)');
  falloff.addColorStop(1, 'rgba(255, 255, 255, 0)');
  target.globalCompositeOperation = 'destination-in';
  target.fillStyle = falloff;
  target.fillRect(0, 0, 128, 128);
  if (cache.size >= 16) cache.delete(cache.keys().next().value);
  cache.set(color, texture);
  return texture;
}

// Builds one relief layer for a light: each quadrant around the light takes the mask facing it (or, with
// facingAway, the opposite mask) and is tinted through the smooth falloff.
function normalReliefLayer(slot, state, x, y, radius, facingAway, color) {
  const diameter = radius * 2;
  const size = Math.ceil(diameter);
  const works = drawNormalMappedLight.works || (drawNormalMappedLight.works = []);
  const work = works[slot] || (works[slot] = document.createElement('canvas'));
  if (work.width < size || work.height < size) {
    work.width = Math.max(work.width || 0, size);
    work.height = Math.max(work.height || 0, size);
  }
  const target = work.getContext('2d');
  target.save();
  target.globalCompositeOperation = 'source-over';
  target.clearRect(0, 0, size, size);
  target.imageSmoothingEnabled = true;
  const left = x - radius;
  const top = y - radius;
  for (const [x0, y0, x1, y1, direction] of [
    [x, y, x + radius, y + radius, 0], [x - radius, y, x, y + radius, 1],
    [x, y - radius, x + radius, y, 2], [x - radius, y - radius, x, y, 3],
  ]) {
    const sourceLeft = Math.max(0, x0);
    const sourceTop = Math.max(0, y0);
    const sourceRight = Math.min(ROOM_W, x1);
    const sourceBottom = Math.min(ROOM_H, y1);
    if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) continue;
    target.drawImage(state.responses[facingAway ? 3 - direction : direction], sourceLeft * state.scale,
      sourceTop * state.scale, (sourceRight - sourceLeft) * state.scale, (sourceBottom - sourceTop) * state.scale,
      sourceLeft - left, sourceTop - top, sourceRight - sourceLeft, sourceBottom - sourceTop);
  }
  target.globalCompositeOperation = 'source-in';
  target.drawImage(normalLightFalloff(color), 0, 0, diameter, diameter);
  target.restore();
  return work;
}

// Emitting magic adds highlights on slopes facing it and deepens slopes turned away; absorbing (dark) magic
// instead shades the slopes that face it.
function drawNormalMappedLight(x, y, radius, strength, color, dark = false) {
  const state = requestRoomNormalMap.state;
  if (!state?.ready) return false;
  const diameter = radius * 2;
  const left = x - radius;
  const top = y - radius;
  const composite = ctx.globalCompositeOperation;
  const alpha = ctx.globalAlpha;
  if (!dark) {
    const lit = normalReliefLayer(0, state, x, y, radius, false, color);
    // Additive, so relief still reads on bright desert sand where screen blending has no headroom.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, strength * 1.3);
    ctx.drawImage(lit, 0, 0, diameter, diameter, left, top, diameter, diameter);
  }
  const shade = normalReliefLayer(1, state, x, y, radius, !dark, dark ? color : '#06040c');
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.min(1, strength * (dark ? 2.2 : 1.6));
  ctx.drawImage(shade, 0, 0, diameter, diameter, left, top, diameter, diameter);
  ctx.globalCompositeOperation = composite;
  ctx.globalAlpha = alpha;
  return true;
}

function sunlightMask(image, sx, sy, width, height) {
  if (!sunlightMask.images) sunlightMask.images = new WeakMap();
  let frames = sunlightMask.images.get(image);
  if (!frames) {
    frames = new Map();
    sunlightMask.images.set(image, frames);
  }
  const key = `${sx}:${sy}:${width}:${height}`;
  if (frames.has(key)) return frames.get(key);
  const mask = document.createElement('canvas');
  mask.width = width;
  mask.height = height;
  const target = mask.getContext('2d', { willReadFrequently: true });
  target.imageSmoothingEnabled = false;
  target.drawImage(image, sx, sy, width, height, 0, 0, width, height);
  mask.footRow = height;
  mask.contactRow = height;
  try {
    const { data } = target.getImageData(0, 0, width, height);
    const opaque = (row, column) => data[(row * width + column) * 4 + 3] >= 32;
    outer: for (let row = height - 1; row >= 0; row -= 1) {
      for (let column = 0; column < width; column += 1) {
        if (opaque(row, column)) {
          mask.footRow = row + 1;
          break outer;
        }
      }
    }
    // A body touches the ground over an ellipse about half as deep as its base is wide, so the shadow is cast from
    // that footprint's middle and starts under the body rather than below its lowest pixel.
    let baseWidth = 0;
    for (let row = mask.footRow - 1; row >= Math.max(0, mask.footRow - Math.ceil(height * 0.1)); row -= 1) {
      let left = -1;
      let right = -1;
      for (let column = 0; column < width; column += 1) {
        if (!opaque(row, column)) continue;
        if (left < 0) left = column;
        right = column;
      }
      if (left >= 0) baseWidth = Math.max(baseWidth, right - left + 1);
    }
    mask.contactRow = mask.footRow - Math.min(Math.round(baseWidth * 0.25), Math.round(mask.footRow * 0.2));
  } catch (error) {
    if (error.name !== 'SecurityError') throw error;
    if (!sunlightMask.readbackWarning) {
      console.warn('Exact shadow feet are unavailable for these local-file sprites; serve the game over HTTP for alpha-aligned shadows.', error);
      sunlightMask.readbackWarning = true;
    }
  }
  target.globalCompositeOperation = 'source-in';
  target.fillStyle = '#101722';
  target.fillRect(0, 0, width, height);
  if (frames.size >= 128) frames.delete(frames.keys().next().value);
  frames.set(key, mask);
  return mask;
}

function drawSunSpriteShadow(image, sx, sy, sw, sh, x, groundY, width, height, elevation = 0, opacity = 1, rotation = 0, anchorY = null) {
  if (!image.complete || image.naturalWidth === 0) return;
  // Every grounded sprite passes through here, so it doubles as the list of shapes water can reflect.
  if (beginWaterReflections.recording && elevation <= 0) {
    beginWaterReflections.recording.push({ image, sx, sy, sw, sh, x, groundY, width, height, anchorY });
  }
  const shadowScale = 1 + Math.max(0, elevation) / 160;
  const reach = height * shadowScale * 0.55 + Math.max(0, elevation) * 0.55;
  if (x + width * shadowScale / 2 + reach < camera.x || x - width * shadowScale / 2 > camera.x + VIEW_W ||
      groundY + reach < camera.y || groundY - height > camera.y + VIEW_H) return;
  const mask = sunlightMask(image, sx, sy, sw, sh);
  const footHeight = (anchorY ?? mask.contactRow / sh) * height;
  const footY = groundY - height + footHeight;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.filter = 'none';
  ctx.beginPath();
  ctx.rect(0, 0, ROOM_W, ROOM_H);
  ctx.clip();
  ctx.globalAlpha *= sunlightStrength(x, footY) * opacity;
  const lift = Math.max(0, elevation) * 0.55;
  ctx.translate(x + lift, footY + lift);
  // Sprite tops project equally right and down from their ground anchor.
  ctx.transform(1, 0, -0.55, -0.55, 0, 0);
  ctx.scale(shadowScale, shadowScale);
  ctx.translate(0, height / 2 - footHeight);
  if (rotation) ctx.rotate(rotation);
  ctx.drawImage(mask, -width / 2, -height / 2, width, height);
  ctx.restore();
}

// Water pools mirror the shapes recorded on the previous frame (one frame late is invisible), and only record while
// a pool exists so dry rooms pay nothing.
function beginWaterReflections() {
  beginWaterReflections.shapes = beginWaterReflections.recording || [];
  const water = groundHazards.some((hazard) => hazard.kind === 'water' || hazard.kind === 'slush' || hazard.kind === 'charged');
  beginWaterReflections.recording = water ? [] : null;
}

function drawWaterReflections(hazard, alpha = 1) {
  const shapes = beginWaterReflections.shapes || [];
  const radiusX = hazard.radius * 1.15;
  const radiusY = hazard.radius * 0.62;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(hazard.x, hazard.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.clip();
  for (const shape of shapes) {
    if (Math.abs(shape.x - hazard.x) > radiusX + shape.width / 2) continue;
    const mask = sunlightMask(shape.image, shape.sx, shape.sy, shape.sw, shape.sh);
    const footHeight = (shape.anchorY ?? mask.footRow / shape.sh) * shape.height;
    const footY = shape.groundY - shape.height + footHeight;
    // The mirror image hangs below the feet, so only shapes standing just above or in the pool reach it.
    if (footY > hazard.y + radiusY || footY + footHeight < hazard.y - radiusY) continue;
    ctx.save();
    ctx.globalAlpha = 0.42 * alpha;
    ctx.translate(shape.x + Math.sin(elapsed * 3 + footY * 0.15) * 1.5, footY);
    ctx.scale(1, -0.9);
    ctx.drawImage(shape.image, shape.sx, shape.sy, shape.sw, shape.sh,
      -shape.width / 2, -footHeight, shape.width, shape.height);
    ctx.restore();
  }
  // Lights nearby glint off the surface where they sit over it.
  ctx.globalCompositeOperation = 'lighter';
  for (const light of collectWorldLights.lights || []) {
    if (light.dark || Math.hypot(light.x - hazard.x, light.y - hazard.y) > hazard.radius + light.radius) continue;
    const glint = light.radius * 0.6;
    ctx.globalAlpha = Math.min(1, light.strength * 1.1 * alpha);
    ctx.drawImage(normalLightFalloff(light.color), light.x - glint, light.y - glint, glint * 2, glint * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  // A thin wash of the water colour sits over the reflections so they read as under the surface.
  ctx.globalAlpha = 0.28 * alpha;
  ctx.drawImage(normalLightFalloff(hazard.color), hazard.x - radiusX, hazard.y - radiusY, radiusX * 2, radiusY * 2);
  ctx.restore();
}

// Where a sprite's lowest opaque row lands on screen: its feet, used to draw nearer objects over farther ones.
function spriteFeetY(image, sx, sy, sw, sh, groundY, height) {
  if (!image.complete || image.naturalWidth === 0) return groundY;
  return groundY - height + sunlightMask(image, sx, sy, sw, sh).footRow / sh * height;
}

// Shadows only fall on the walkable floor and open doorways, so they pass under the wall art instead of over it.
function clipShadowFloor() {
  const band = roomWallBand();
  const half = DOOR_OPENING_HALF_WIDTH;
  ctx.beginPath();
  ctx.rect(band, band, ROOM_W - band * 2, ROOM_H - band * 2);
  for (const { name } of directions) {
    const secretDoor = currentRoom.secretExit?.direction === name && !currentRoom.secretExit.room.hidden;
    if (!currentRoom.cleared || currentRoom.lockedDoors?.[name] || !(currentRoom.links?.[name] || secretDoor)) continue;
    if (name === 'up' || name === 'down') ctx.rect(ROOM_W / 2 - half, name === 'up' ? 0 : ROOM_H - band, half * 2, band);
    else ctx.rect(name === 'left' ? 0 : ROOM_W - band, ROOM_H / 2 - half, band, half * 2);
  }
  ctx.clip();
}

function drawTrunkShadow(x, y, width, height, opacity = 1, anchorY = 0.34) {
  const rootY = y + height * anchorY;
  const halfWidth = width * 0.22;
  const reach = height * 0.55;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.filter = 'none';
  ctx.globalAlpha *= sunlightStrength(x, rootY) * opacity;
  // The TMW round shadow under the trunk, and the same shadow stretched down-right as the cast part.
  drawEffect('shadow', 0, x, rootY, { width: halfWidth * 2.4, height: halfWidth * 1.1, smooth: true });
  drawEffectBetween('shadow', 0, x, rootY, x + reach, rootY + reach, halfWidth * 2, { smooth: true });
  ctx.restore();
}

function drawSunGroundShadow(x, y, radius, elevation = 0) {
  const offset = Math.max(0, elevation) * 0.55;
  const shadowRadius = radius * (1 + Math.max(0, elevation) / 64);
  if (x + offset + shadowRadius < camera.x || x + offset - shadowRadius > camera.x + VIEW_W ||
      y + offset + shadowRadius < camera.y || y + offset - shadowRadius > camera.y + VIEW_H) return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha *= sunlightStrength(x, y);
  drawEffect('shadow', 0, x + offset, y + offset, { width: shadowRadius * 2.4, height: shadowRadius * 1.2,
    rotation: Math.PI / 4, smooth: true });
  ctx.restore();
}

// Phones that fell back to low quality keep at most eight light sources. Smothering magic (gas, earth dust, void,
// miasma) and bomb smoke absorb light instead: they are listed with dark: true and a deep shade colour. Snow and ice both
// absorb and emit (both: true): a cold shade over the reach with a bright core. Lightning flickers brighter.
// Attack light never reaches more than 24 px past the attack's own radius, and the falloff
// (normalLightFalloff) has nearly faded before that edge.
function collectWorldLights() {
  const lights = [];
  const maxLights = quality.low ? 8 : 24;
  const reach = 24;
  const darkShades = { gas: '#17220a', miasma: '#17220a', earth: '#23170b', 'void-orb': '#13081f', void: '#13081f',
    bomb: '#140d08' };
  const coldElements = new Set(['ice', 'ice-orb', 'snow', 'frost']);
  const add = (x, y, color, bodyRadius, strength = 0.3, element = null) => {
    const radius = Math.max(1, bodyRadius) + reach;
    if (x + radius < camera.x || x - radius > camera.x + VIEW_W ||
        y + radius < camera.y || y - radius > camera.y + VIEW_H || lights.length >= maxLights) return;
    const shade = darkShades[element];
    if (shade) lights.push({ x, y, color: shade, radius, strength, dark: true });
    else if (coldElements.has(element)) lights.push({ x, y, color, radius, strength, both: true, shade: '#0d2233' });
    else if (element === 'lightning') {
      // A fast irregular flicker, so lightning reads as crackling rather than a steady lamp.
      const flicker = 0.8 + 0.2 * Math.sin(elapsed * 47 + x * 0.3) * Math.sin(elapsed * 31 + y * 0.2);
      lights.push({ x, y, color, radius, strength: Math.min(0.5, strength * 1.3 * flicker) });
    } else lights.push({ x, y, color, radius, strength });
  };
  for (const hazard of groundHazards) {
    if (hazard.kind === 'fire' || hazard.kind === 'lightning') {
      add(hazard.x, hazard.y, hazard.color, hazard.radius, Math.min(0.3, hazard.ttl * 0.15), hazard.kind);
    } else if (hazard.kind === 'charged') {
      add(hazard.x, hazard.y, hazard.color, hazard.radius, Math.min(0.24, hazard.ttl * 0.12), 'lightning');
    } else if (hazard.kind === 'slush') {
      add(hazard.x, hazard.y, hazard.color, hazard.radius, Math.min(0.2, hazard.ttl * 0.1), 'ice');
    } else if (hazard.kind === 'acid' || hazard.kind === 'miasma') {
      add(hazard.x, hazard.y, hazard.color, hazard.radius, Math.min(0.24, hazard.ttl * 0.12), hazard.kind);
    }
  }
  for (const [group, owner] of [[projectiles, 'player'], [enemyProjectiles, 'enemy']]) {
    for (const projectile of group) {
      if (lights.length >= maxLights) break;
      if (projectile.type === 'charge-beam') {
        const x = projectile.beamEndX ?? projectile.originX + projectile.vx * projectile.beamRange;
        const y = projectile.beamEndY ?? projectile.originY + projectile.vy * projectile.beamRange;
        const halfWidth = (projectile.beamWidth || 16) / 2;
        // Lights overlap along the beam so its glow stays a band hugging the beam, never a wide halo.
        const steps = Math.min(8, Math.max(1, Math.ceil(Math.hypot(x - projectile.originX, y - projectile.originY) /
          (halfWidth + reach))));
        for (let step = 0; step <= steps; step += 1) {
          add(projectile.originX + (x - projectile.originX) * step / steps,
            projectile.originY + (y - projectile.originY) * step / steps, projectile.color, halfWidth, 0.28);
        }
        continue;
      }
      const playerMagic = owner === 'player' && (projectile.type === 'elemental' || projectile.magicCluster);
      // Every enemy attack except a plain arrow carries its own light, so hostile magic reads as special.
      const enemyMagic = owner === 'enemy' && projectile.kind !== 'arrow';
      if (playerMagic || enemyMagic || projectile.glow || ['fire', 'lightning'].includes(projectile.element)) {
        const { x, y } = projectileArcState(projectile);
        const element = projectile.glow || projectile.element || projectile.kind;
        add(x, y, magicElementPalette[element] || projectile.color || magicElementPalette.bubble,
          (projectile.radius || 6) * Math.min(1.5, projectile.size || 1),
          Math.min(0.42, (enemyMagic ? 0.28 : 0.24) + (projectile.radius || 6) * 0.008), element);
      }
    }
  }
  for (const arc of typeof lightningArcs === 'undefined' ? [] : lightningArcs) {
    // Bolts light a band along their length; the bolt art is about 34 px wide (14 for cast trails).
    const halfWidth = arc.castTrail ? 7 : 17;
    const length = Math.hypot(arc.x2 - arc.x1, arc.y2 - arc.y1);
    const steps = Math.min(6, Math.max(1, Math.ceil(length / (halfWidth + reach))));
    const fade = clamp(arc.ttl / 0.18, 0, 1);
    for (let step = 0; step <= steps; step += 1) {
      add(arc.x1 + (arc.x2 - arc.x1) * step / steps, arc.y1 + (arc.y2 - arc.y1) * step / steps,
        arc.color || magicElementPalette.lightning, halfWidth, 0.34 * fade, 'lightning');
    }
  }
  for (const scorch of typeof bombScorches === 'undefined' ? [] : bombScorches) {
    // Blast flash, then the fire's flicker over a smoke pall that soaks up the light around it.
    const stage = bombAftermath(scorch.age);
    if (stage.flash > 0) add(scorch.x, scorch.y, '#ffd38a', scorch.radius * 0.6, 0.55 * stage.flash);
    if (stage.smoke > 0) add(scorch.x, scorch.y, null, scorch.radius * 0.7, 0.4 * stage.smoke, 'bomb');
    if (stage.fire > 0) {
      const flicker = 0.85 + 0.15 * Math.sin(elapsed * 23 + scorch.seed) * Math.sin(elapsed * 37);
      add(scorch.x, scorch.y, '#ff8a3a', scorch.radius * 0.35, 0.34 * stage.fire * flicker);
    }
  }
  if (player.chargeFraction > 0.1 && currentAttackStyle() === 'magic') {
    add(player.x, player.y - 32, styleGlowColor('magic') || magicElementPalette.bubble,
      8 * player.chargeFraction, player.chargeFraction * 0.3);
  }
  collectWorldLights.lights = lights;
}

function drawWorldLightSources() {
  if (!drawWorldLightSources.textures) drawWorldLightSources.textures = new Map();
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'screen';
  ctx.beginPath();
  ctx.rect(0, 0, ROOM_W, ROOM_H);
  ctx.clip();
  for (const { x, y, color, radius, strength, dark, both, shade } of collectWorldLights.lights || []) {
    if (both) {
      // Snow and ice: a cold shade swallows the light around the spell while its core still glows.
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.min(1, strength * 1.8);
      ctx.drawImage(normalLightFalloff(shade), x - radius, y - radius, radius * 2, radius * 2);
      drawNormalMappedLight(x, y, radius, strength * 0.6, shade, true);
      const core = radius * 0.55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, strength * 0.9);
      ctx.drawImage(normalLightFalloff(color), x - core, y - core, core * 2, core * 2);
      drawNormalMappedLight(x, y, core, strength, color);
      ctx.globalCompositeOperation = 'screen';
      continue;
    }
    if (dark) {
      // Absorbed light: multiply a deep shade over the ground, then shade the slopes facing the spell.
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.min(1, strength * 2.4);
      ctx.drawImage(normalLightFalloff(color), x - radius, y - radius, radius * 2, radius * 2);
      drawNormalMappedLight(x, y, radius, strength, color, true);
      ctx.globalCompositeOperation = 'screen';
      continue;
    }
    let texture = drawWorldLightSources.textures.get(color);
    if (!texture) {
      texture = document.createElement('canvas');
      texture.width = texture.height = 128;
      const target = texture.getContext('2d');
      // The TMW glow particle in the light's colour.
      if (!effectImageReady(effectArt.glow)) continue;
      target.drawImage(tintedEffectImage(effectArt.glow, color), 0, 0, 128, 128);
      if (drawWorldLightSources.textures.size >= 16) {
        drawWorldLightSources.textures.delete(drawWorldLightSources.textures.keys().next().value);
      }
      drawWorldLightSources.textures.set(color, texture);
    }
    ctx.globalAlpha = strength;
    // The TMW glow keeps to the inner part of the reach so it fades out before the light's edge.
    ctx.drawImage(texture, x - radius * 0.8, y - radius * 0.8, radius * 1.6, radius * 1.6);
    // A coloured pool rather than a white wash: additive light in the spell's own hue.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, strength * 0.4);
    ctx.drawImage(normalLightFalloff(color), x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = 'screen';
    drawNormalMappedLight(x, y, radius, strength, color);
  }
  ctx.restore();
}

function drawProjectileGroundShadow(projectile) {
  if (projectile.type === 'charge-beam') return;
  const { x, y, elevation } = projectileArcState(projectile);
  const radius = projectile.type === 'arrow' || projectile.kind === 'arrow'
    ? 6 * (projectile.size || 1) : projectile.radius || 8 * (projectile.size || 1);
  drawSunGroundShadow(x, y + elevation, radius, elevation);
}

function drawRoomSunlight() {
  const band = roomWallBand();
  const cave = roomUsesCreviceLight();
  const openings = directions.map(({ name }) => {
    const secret = currentRoom.secretExit?.direction === name && !currentRoom.secretExit.room.hidden;
    return currentRoom.cleared && !currentRoom.lockedDoors[name] && (currentRoom.links[name] || secret) ? 1 : 0;
  }).join('');
  const key = `${currentRegionId()}:${currentRoom.type}:${currentRoom.x}:${currentRoom.y}:${ROOM_W}:${ROOM_H}:${band}:${openings}`;
  if (drawRoomSunlight.key !== key) {
    const layer = document.createElement('canvas');
    layer.width = ROOM_W;
    layer.height = ROOM_H;
    const target = layer.getContext('2d');
    target.save();
    target.beginPath();
    target.rect(band, band, ROOM_W - band * 2, ROOM_H - band * 2);
    target.clip();
    const daylight = target.createLinearGradient(band, band, ROOM_W - band, ROOM_H - band);
    daylight.addColorStop(0, cave ? 'rgba(15, 22, 38, 0.12)' : 'rgba(255, 235, 184, 0.07)');
    daylight.addColorStop(1, cave ? 'rgba(15, 22, 38, 0.19)' : 'rgba(22, 31, 48, 0.08)');
    target.fillStyle = daylight;
    target.fillRect(band, band, ROOM_W - band * 2, ROOM_H - band * 2);
    const reach = band === 32 ? 16 : 24;
    target.beginPath();
    const shadow = (x, y, width, height) => {
      target.moveTo(x, y);
      target.lineTo(x + width, y);
      target.lineTo(x + width + reach, y + reach);
      target.lineTo(x + width + reach, y + height + reach);
      target.lineTo(x + reach, y + height + reach);
      target.lineTo(x, y + height);
      target.closePath();
    };
    for (const name of ['up', 'left']) {
      const vertical = name === 'left';
      const length = vertical ? ROOM_H : ROOM_W;
      const index = directions.findIndex((direction) => direction.name === name);
      const segments = openings[index] === '1'
        ? [[0, length / 2 - DOOR_OPENING_HALF_WIDTH], [length / 2 + DOOR_OPENING_HALF_WIDTH, length]]
        : [[0, length]];
      for (const [start, end] of segments) {
        if (vertical) shadow(0, start, band, end - start);
        else shadow(start, 0, end - start, band);
      }
    }
    target.fillStyle = cave ? 'rgba(12, 18, 28, 0.22)' : 'rgba(12, 18, 28, 0.26)';
    target.fill();
    target.restore();
    drawRoomSunlight.layer = layer;
    drawRoomSunlight.key = key;
  }
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.drawImage(drawRoomSunlight.layer, 0, 0);
  if (cave) {
    ctx.beginPath();
    ctx.rect(band, band, ROOM_W - band * 2, ROOM_H - band * 2);
    ctx.clip();
    const time = prefersReducedMotion() ? 0 : elapsed;
    const shafts = roomLightShafts();
    for (let index = 0; index < shafts.length; index += 1) {
      const { x, y, width, length } = shafts[index];
      // TMW sunlight shaft (it falls down-right in the file, as the shafts do here), with SoM orb dust motes.
      drawEffect('sunShaft', 0, x - width * 0.3, y - width * 0.3, { anchorX: 0, anchorY: 0, width: length * 0.8,
        height: length, alpha: 0.55 + Math.sin(time * 0.7 + index) * 0.08, smooth: true });
      const motes = quality.low ? 2 : 6;
      for (let mote = 0; mote < motes; mote += 1) {
        const phase = (mote / motes + time * 0.025) % 1;
        const along = phase * length;
        const across = Math.sin(mote * 2.7 + index) * width * 0.45;
        drawEffect('orb', 0, Math.round(x + along + across), Math.round(y + along - across),
          { width: 3, alpha: 0.35, tint: '#fff5d8' });
      }
    }
  }
  ctx.restore();
}
