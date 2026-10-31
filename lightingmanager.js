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
  for (const [index, shaft] of roomLightShafts.shafts.entries()) {
    shaft.contours = [1.3, 1.05, 0.8, 0.55].map((spread) => {
      const sides = [-1, 1].map((side) => Array.from({ length: 17 }, (_, step) => {
        const phase = step / 16;
        const along = phase * shaft.length;
        const drift = Math.sin(phase * 8 + seed + index) * shaft.width * 0.12;
        const irregularity = 0.85 + Math.sin(step * 1.7 + seed + side * 2 + index) * 0.15;
        const across = drift + side * shaft.width * (0.35 + phase * 0.65) * spread * irregularity;
        return [shaft.x + along + across, shaft.y + along - across];
      }));
      return [...sides[0], ...sides[1].reverse()];
    });
  }
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
    glow = Math.max(glow, Math.max(0, 1 - Math.hypot(x - light.x, y - light.y) / light.radius) * light.strength);
  }
  return glow;
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
  try {
    const { data } = target.getImageData(0, 0, width, height);
    outer: for (let row = height - 1; row >= 0; row -= 1) {
      for (let column = 0; column < width; column += 1) {
        if (data[(row * width + column) * 4 + 3] >= 32) {
          mask.footRow = row + 1;
          break outer;
        }
      }
    }
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
  const shadowScale = 1 + Math.max(0, elevation) / 160;
  const reach = height * shadowScale * 0.55 + Math.max(0, elevation) * 0.55;
  if (x + width * shadowScale / 2 + reach < camera.x || x - width * shadowScale / 2 > camera.x + VIEW_W ||
      groundY + reach < camera.y || groundY - height > camera.y + VIEW_H) return;
  const mask = sunlightMask(image, sx, sy, sw, sh);
  const footHeight = (anchorY ?? mask.footRow / sh) * height;
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

function drawTrunkShadow(x, y, width, height, opacity = 1, anchorY = 0.34) {
  const rootY = y + height * anchorY;
  const halfWidth = width * 0.22;
  const reach = height * 0.55;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.filter = 'none';
  ctx.globalAlpha *= sunlightStrength(x, rootY) * opacity;
  ctx.fillStyle = '#101722';
  ctx.beginPath();
  ctx.ellipse(x, rootY, halfWidth, halfWidth * 0.45, 0, 0, Math.PI * 2);
  ctx.moveTo(x - halfWidth, rootY);
  ctx.lineTo(x + halfWidth, rootY);
  ctx.lineTo(x + reach + halfWidth, rootY + reach);
  ctx.quadraticCurveTo(x + reach, rootY + reach + halfWidth * 0.6,
    x + reach - halfWidth, rootY + reach);
  ctx.closePath();
  ctx.fill();
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
  ctx.fillStyle = '#101722';
  ctx.beginPath();
  ctx.ellipse(x + offset, y + offset, shadowRadius, shadowRadius * 0.5, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Phones that fell back to low quality keep at most eight light sources.
function collectWorldLights() {
  const lights = [];
  const maxLights = quality.low ? 8 : 24;
  const add = (x, y, color, radius, strength = 0.3) => {
    if (x + radius < camera.x || x - radius > camera.x + VIEW_W ||
        y + radius < camera.y || y - radius > camera.y + VIEW_H || lights.length >= maxLights) return;
    lights.push({ x, y, color, radius, strength });
  };
  for (const hazard of groundHazards) {
    if (hazard.kind === 'fire' || hazard.kind === 'lightning') {
      add(hazard.x, hazard.y, hazard.color, hazard.radius + 64, Math.min(0.3, hazard.ttl * 0.15));
    }
  }
  for (const group of [projectiles, enemyProjectiles]) {
    for (const projectile of group) {
      if (lights.length >= maxLights) break;
      if (projectile.type === 'charge-beam') {
        const x = projectile.beamEndX ?? projectile.originX + projectile.vx * projectile.beamRange;
        const y = projectile.beamEndY ?? projectile.originY + projectile.vy * projectile.beamRange;
        for (let step = 0; step <= 4; step += 1) {
          add(projectile.originX + (x - projectile.originX) * step / 4,
            projectile.originY + (y - projectile.originY) * step / 4, projectile.color, 72);
        }
        continue;
      }
      const element = projectile.glow || projectile.element || projectile.kind;
      if (['fire', 'fire-orb', 'lightning', 'wisp', 'spore-orb', 'void-orb'].includes(element)) {
        const { x, y } = projectileArcState(projectile);
        add(x, y, magicElementPalette[element] || projectile.color, 64 * (projectile.size || 1));
      }
    }
  }
  if (player.chargeFraction > 0.1 && currentAttackStyle() === 'magic') {
    add(player.x, player.y - 32, styleGlowColor('magic') || magicElementPalette.bubble,
      60 + player.chargeFraction * 40, player.chargeFraction * 0.3);
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
  for (const { x, y, color, radius, strength } of collectWorldLights.lights || []) {
    let texture = drawWorldLightSources.textures.get(color);
    if (!texture) {
      texture = document.createElement('canvas');
      texture.width = texture.height = 128;
      const target = texture.getContext('2d');
      const gradient = target.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      target.fillStyle = gradient;
      target.fillRect(0, 0, 128, 128);
      if (drawWorldLightSources.textures.size >= 16) {
        drawWorldLightSources.textures.delete(drawWorldLightSources.textures.keys().next().value);
      }
      drawWorldLightSources.textures.set(color, texture);
    }
    ctx.globalAlpha = strength;
    ctx.drawImage(texture, x - radius, y - radius, radius * 2, radius * 2);
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
      const glow = ctx.createLinearGradient(x, y, x + length, y + length);
      const pulse = 0.11 + Math.sin(time * 0.7 + index) * 0.015;
      glow.addColorStop(0, 'rgba(255, 239, 193, 0)');
      glow.addColorStop(0.18, `rgba(255, 239, 193, ${pulse})`);
      glow.addColorStop(0.7, 'rgba(255, 239, 193, 0.05)');
      glow.addColorStop(1, 'rgba(255, 239, 193, 0)');
      ctx.fillStyle = glow;
      ctx.save();
      ctx.globalAlpha *= 0.25;
      for (const contour of shafts[index].contours) {
        ctx.beginPath();
        contour.forEach(([px, py], point) => {
          if (point === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255, 245, 216, 0.3)';
      const motes = quality.low ? 2 : 6;
      for (let mote = 0; mote < motes; mote += 1) {
        const phase = (mote / motes + time * 0.025) % 1;
        const along = phase * length;
        const across = Math.sin(mote * 2.7 + index) * width * 0.45;
        ctx.fillRect(Math.round(x + along + across), Math.round(y + along - across), 1, 1);
      }
    }
  }
  ctx.restore();
}
