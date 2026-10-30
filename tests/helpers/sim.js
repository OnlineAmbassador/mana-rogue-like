// Headless damage-rate probe for the playtest-balance questions (charge damage, boss time-to-kill).
// It fires the real `shoot` and reads the projectile it produces, so the numbers follow the game code.
// Run `node tests/helpers/sim.js` to print the table that PLAYTEST.md refers to.
const { combat, source } = require('./combat');

// The combat() stub uses simplified charge constants; take the production values from game.js.
function productionConstants() {
  const game = source('game.js');
  const read = (name) => {
    const match = new RegExp(`const ${name} = ([0-9.]+);`).exec(game);
    if (!match) throw new Error(`game.js: constant ${name} not found`);
    return Number(match[1]);
  };
  return {
    BOW_TAP_WINDOW: read('BOW_TAP_WINDOW'),
    BOW_CHARGE_TIME: read('BOW_CHARGE_TIME'),
    MAX_CHARGE_SHOTS: read('MAX_CHARGE_SHOTS'),
  };
}

function simContext(style, className = 'Mage') {
  const c = combat();
  Object.assign(c, productionConstants());
  Object.assign(c.weapon, { projectileSpeed: 420, rangeMultiplier: 1, tearSize: 1, damageBonus: 0 });
  c.character = { className, startingStyle: style, fireDelay: 0.23 };
  c.activeCombatStyle = style;
  if (style === 'bow') c.fireModes.bow = 'charge';
  if (style === 'magic') c.fireModes.magic = 'charge';
  return c;
}

// One shot's damage and the recovery cooldown it sets, plus the seconds the player had to hold to charge it.
function fireOnce(style, charged, className) {
  const c = simContext(style, className);
  c.player.fireCooldown = 0;
  c.projectiles.length = 0;
  const options = style === 'bow'
    ? charged ? { charge: 1 } : { quick: true }
    : charged ? { magicCharge: 1 } : null;
  c.shoot(options);
  const shot = c.projectiles[0];
  if (!shot) throw new Error(`${style} produced no projectile`);
  const hold = !charged ? 0
    : style === 'bow' ? c.BOW_TAP_WINDOW + c.BOW_CHARGE_TIME
      : 0.9;
  return {
    damage: shot.damage,
    pierce: shot.pierce || 0,
    explode: shot.explode || 0,
    cooldown: c.player.fireCooldown,
    hold,
  };
}

// Single-target damage per second for a repeated cycle of hold + recovery.
function dps(style, charged, className) {
  const shot = fireOnce(style, charged, className);
  return { ...shot, dps: shot.damage / (shot.hold + shot.cooldown) };
}

function bossSeconds(c, kind, floor, rate) {
  c.currentFloor = floor;
  return c.createEnemy(kind, 400, 300, true).hp / rate;
}

function report() {
  const rows = [];
  for (const style of ['bow', 'magic']) {
    const tap = dps(style, false);
    const charged = dps(style, true);
    rows.push({
      style,
      tapDps: tap.dps.toFixed(1),
      chargedDps: charged.dps.toFixed(1),
      ratio: (charged.dps / tap.dps).toFixed(2),
      chargedPierce: charged.pierce,
      chargedExplode: charged.explode,
    });
  }
  console.table(rows);
  const c = simContext('magic');
  const bossRows = [];
  for (const floor of [1, 4, 9]) {
    bossRows.push({
      floor,
      estimatedDps: c.estimatedPlayerDps().toFixed(1),
      tapMagicSeconds: bossSeconds(c, 'golem', floor, dps('magic', false).dps).toFixed(0),
      chargedMagicSeconds: bossSeconds(c, 'golem', floor, dps('magic', true).dps).toFixed(0),
      chargedBowSeconds: bossSeconds(c, 'golem', floor, dps('bow', true).dps).toFixed(0),
    });
  }
  console.table(bossRows);
}

if (require.main === module) report();

module.exports = { simContext, fireOnce, dps, bossSeconds };
