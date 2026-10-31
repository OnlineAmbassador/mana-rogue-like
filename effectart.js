/* Effect art: TMW and Source of Mana sprites drawn in place of canvas shapes. The files stay exactly as shipped
   upstream; scaling, rotation and tinting happen at draw time (docs/ASSETS.md, rules 3 and 4). `effectArt`, which
   holds the images, is filled in game.js, because loadAsset needs `artwork` (see shopart.js). */

// Frame grid of each sheet: frame size, frame count and frames per row (a horizontal strip when columns is unset).
// Sizes come from the TMW particle and sprite XML where it exists, otherwise from the sheet's alpha channel.
const EFFECT_SHEETS = {
  arrow: { w: 16, h: 8 },
  cast: { w: 96, h: 96 },
  castRunes: { w: 96, h: 96 },
  castCross: { w: 96, h: 96 },
  castStar: { w: 96, h: 96 },
  fire: { w: 32, h: 32, frames: 3 },
  flames: { w: 32, h: 32, frames: 9 },
  orb: { w: 8, h: 8 },
  orbOval: { w: 8, h: 8 },
  orbGlow: { w: 16, h: 16 },
  manaBall: { w: 16, h: 16 },
  smoke: { w: 24, h: 24 },
  twinkle: { w: 32, h: 32 },
  arc: { w: 8, h: 8 },
  bubble: { w: 16, h: 16, frames: 8, columns: 1 },
  sonicWave: { w: 32, h: 64, frames: 4 },
  web: { w: 128, h: 96 },
  beamCrit: { w: 64, h: 64, frames: 4 },
  sparkles: { w: 15, h: 15, frames: 4 },
  star: { w: 21, h: 21 },
  glow: { w: 48, h: 48 },
  // misc.png is a 6 x 5 grid of 42 x 50 frames; row 0 is a crescent swipe.
  swipe: { w: 42, h: 50, frames: 6, columns: 6 },
  blast: { w: 32, h: 32, frames: 9 },
  puff: { w: 17, h: 17, frames: 10 },
  lightning: { w: 83, h: 240 },
  sparks: { w: 15, h: 15, frames: 8, columns: 4 },
  snowflake: { w: 9, h: 9 },
  sporeBubble: { w: 8, h: 8, frames: 15 },
  sporeSplash: { w: 32, h: 32, frames: 8, columns: 4 },
  heart: { w: 13, h: 12 },
  menhirs: { w: 64, h: 64, frames: 9 },
};

function effectImageReady(image) {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

function effectFrameRect(sheet, frame = 0) {
  const count = sheet.frames || 1;
  const index = ((Math.floor(frame) % count) + count) % count;
  const columns = sheet.columns || count;
  const column = index % columns;
  const row = Math.floor(index / columns) + (sheet.row || 0);
  return [column * sheet.w, row * sheet.h, sheet.w, sheet.h];
}

// The frame a looping animation shows at `time` seconds, at `fps` frames per second.
function effectFrameAt(name, time, fps = 10) {
  return Math.floor(time * fps) % (EFFECT_SHEETS[name].frames || 1);
}

// A copy of the image multiplied by `color` (shading kept, transparency kept), cached per image and colour.
const effectTintCache = new Map();
function tintedEffectImage(image, color) {
  if (!color) return image;
  let tints = effectTintCache.get(image);
  if (!tints) effectTintCache.set(image, tints = new Map());
  let canvas = tints.get(color);
  if (!canvas) {
    if (tints.size > 48) tints.clear();
    canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(image, 0, 0);
    tints.set(color, canvas);
  }
  return canvas;
}

// Draws one frame of a sheet centred on (x, y). Options: scale, or width/height in pixels; rotation; alpha;
// tint (a colour multiplied in); anchorX/anchorY (0..1, default 0.5); composite; smooth (default off).
// Returns false while the image is still loading, so callers can skip dependent drawing.
function drawEffect(name, frame, x, y, options = {}) {
  const image = effectArt[name];
  if (!effectImageReady(image)) return false;
  // Single images (icons) need no entry in EFFECT_SHEETS.
  const sheet = EFFECT_SHEETS[name] || { w: image.naturalWidth, h: image.naturalHeight };
  const [sx, sy, sw, sh] = effectFrameRect(sheet, frame);
  const scale = options.scale ?? 1;
  const width = options.width ?? (options.height !== undefined ? sw * options.height / sh : sw * scale);
  const height = options.height ?? (options.width !== undefined ? sh * options.width / sw : sh * scale);
  ctx.save();
  if (options.alpha !== undefined) ctx.globalAlpha *= options.alpha;
  if (options.composite) ctx.globalCompositeOperation = options.composite;
  ctx.imageSmoothingEnabled = Boolean(options.smooth);
  ctx.translate(x, y);
  if (options.rotation) ctx.rotate(options.rotation);
  ctx.drawImage(tintedEffectImage(image, options.tint), sx, sy, sw, sh,
    -width * (options.anchorX ?? 0.5), -height * (options.anchorY ?? 0.5), width, height);
  ctx.restore();
  return true;
}

// A marked circle on the ground: a tinted SoM magic circle as the edge and, when options.fill is set, a tinted TMW
// glow under it. The circle art reaches about 0.95 of its frame, so the frame is sized to put that ring on `radius`.
function drawEffectCircle(x, y, radius, color, options = {}) {
  if (options.fill) drawEffect('glow', 0, x, y, { width: radius * 2.6, tint: color, alpha: options.fill, smooth: true });
  return drawEffect(options.ring || 'cast', 0, x, y, { width: radius * 2.1, tint: color, alpha: options.alpha ?? 1,
    rotation: options.rotation || 0, smooth: true });
}

// Stretches a sheet frame along the segment (x1, y1) to (x2, y2): its length follows the segment and `thickness`
// sets the other side. `along` says which side of the frame runs along the segment ('x' or 'y').
function drawEffectBetween(name, frame, x1, y1, x2, y2, thickness, options = {}) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1) return false;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const vertical = options.along === 'y';
  return drawEffect(name, frame, (x1 + x2) / 2, (y1 + y2) / 2, {
    ...options,
    width: vertical ? thickness : length,
    height: vertical ? length : thickness,
    rotation: vertical ? angle - Math.PI / 2 : angle,
  });
}
