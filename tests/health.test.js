const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function combat() {
  const c = vm.createContext({
    player: { x: 100, y: 100, radius: 12, hp: 4, maxHp: 4, armor: 0, invuln: 0 },
    mode: 'playing', ownedItems: new Set(), enemies: [], enemyProjectiles: [],
    groundHazards: [], bossStrikes: [], breakables: [], currentFloor: 12,
    hurtVignetteTimer: 0, hurtVignetteStrength: 0, HURT_VIGNETTE_DURATION: 0.4,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    distanceBetween: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    hasLineOfSight: () => true,
  });
  for (const file of ['playermanager.js', 'mobmanager.js', 'worldmanager.js', 'gameui.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c);
  }
  vm.runInContext(`
    knockPlayerBack = vibrateController = triggerCameraShake = updateHud =
      clearSavedRun = showMessage = addParticles = playSound = saveRunState = () => {};
  `, c);
  return c;
}

test('four hearts withstand eight unprotected half-heart hits', () => {
  const c = combat();
  for (let hit = 1; hit <= 8; hit += 1) {
    c.player.invuln = 0;
    c.damagePlayer(0.5, null);
    assert.equal(c.player.hp, 4 - hit * 0.5);
    assert.equal(c.mode, hit === 8 ? 'gameover' : 'playing');
  }
});

test('enemy body contact costs a full heart, including late-floor minibosses', () => {
  const c = combat();
  for (const enemy of [{}, { miniBoss: true }, { boss: true }]) {
    c.player.hp = 4;
    c.player.invuln = 0;
    c.damagePlayer(c.contactDamage(enemy), enemy);
    assert.equal(c.player.hp, 3);
  }
});

test('armor absorbs a half-heart hit without healing the player', () => {
  const c = combat();
  c.player.hp = 3.5;
  c.player.armor = 1;
  c.damagePlayer(0.5, null);
  assert.equal(c.player.hp, 3.5);
  assert.equal(c.player.armor, 0);
});

test('invulnerability and Aegis still block half-heart damage', () => {
  const c = combat();
  c.player.invuln = 1;
  c.damagePlayer(0.5, null);
  assert.equal(c.player.hp, 4);
  c.player.invuln = 0;
  c.ownedItems.add('bonded-aegis');
  c.player.aegisCharges = 1;
  c.damagePlayer(0.5, null);
  assert.equal(c.player.hp, 4);
  assert.equal(c.player.aegisCharges, 0);
});

test('ordinary splash costs half a heart but marked boss heavy strikes cost two', () => {
  const c = combat();
  c.groundHazards.push({ x: 100, y: 100, radius: 40, kind: 'fire', owner: 'enemy', damage: 3, damageCooldown: 0, ttl: 3 });
  c.updateGroundHazards(0.016);
  assert.equal(c.player.hp, 3.5);
  c.player.invuln = 0;
  c.explodeBomb({ x: 100, y: 100, radius: 110, owner: 'enemy' });
  assert.equal(c.player.hp, 3);
  c.player.invuln = 0;
  c.bossStrikes.push({ x: 100, y: 100, radius: 50, damage: 2, timer: 0 });
  c.updateBossStrikes(0.016);
  assert.equal(c.player.hp, 1);
});

test('heart renderer clips a half-heart to exactly half the icon with or without the image', () => {
  for (const imageLoaded of [true, false]) {
    const c = combat();
    const clips = [];
    let images = 0;
    c.heartImage = { complete: imageLoaded, naturalWidth: imageLoaded ? 17 : 0 };
    c.ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      bezierCurveTo() {}, fill() {}, stroke() {}, clip() {},
      rect: (x, y, width, height) => clips.push({ width, height }),
      drawImage: () => { images += 1; },
    };
    c.drawHealthHeart(0, 0, 0.5);
    assert.deepEqual(clips, [{ width: 8.5, height: 17 }]);
    assert.equal(images, imageLoaded ? 1 : 0);
    clips.length = 0;
    c.drawHealthHeart(0, 0, 0);
    assert.equal(clips.length, 0);
    c.drawHealthHeart(0, 0, 1);
    assert.deepEqual(clips, [{ width: 17, height: 17 }]);
  }
});
