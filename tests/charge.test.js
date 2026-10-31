const test = require('node:test');
const assert = require('node:assert/strict');
const { simContext, dps, bossSeconds } = require('./helpers/sim');

// These bounds record where the charge numbers stand today. They are ceilings against drift, not design targets:
// docs/PLAYTEST.md lists the charged-magic ratio as the open balance question, and lowering the ceiling is the way
// to lock in a fix once the numbers have been played.
const CHARGED_RATIO_CEILING = { bow: 2, magic: 10 };

test('charging never pays less per second than tapping', () => {
  for (const style of ['bow', 'magic']) {
    assert.ok(dps(style, true).dps >= dps(style, false).dps, `${style} charged DPS must not drop below tap DPS`);
  }
});

test('charged damage per second stays under the recorded ceiling', () => {
  for (const style of ['bow', 'magic']) {
    const ratio = dps(style, true).dps / dps(style, false).dps;
    assert.ok(ratio <= CHARGED_RATIO_CEILING[style],
      `${style} charged/tap DPS ratio ${ratio.toFixed(2)} exceeds ${CHARGED_RATIO_CEILING[style]}`);
  }
});

test('production charge constants are the ones under test', () => {
  const c = simContext('bow');
  assert.equal(c.MAX_CHARGE_SHOTS, 4);
  assert.equal(c.BOW_TAP_WINDOW, 0.22);
  assert.equal(c.BOW_CHARGE_TIME, 0.75);
});

test('a charge cycle has a hold time and a recovery that both count against the rate', () => {
  for (const style of ['bow', 'magic']) {
    const charged = dps(style, true);
    assert.ok(charged.hold > 0.5, `${style} hold time`);
    assert.ok(charged.cooldown > 0, `${style} recovery`);
    assert.ok(Math.abs(charged.dps - charged.damage / (charged.hold + charged.cooldown)) < 1e-9);
  }
});

test('boss time-to-kill grows with the floor for every attack mode', () => {
  const c = simContext('magic');
  for (const [style, charged] of [['magic', false], ['magic', true], ['bow', true]]) {
    const rate = dps(style, charged).dps;
    let previous = 0;
    for (const floor of [1, 4, 9]) {
      const seconds = bossSeconds(c, 'golem', floor, rate);
      assert.ok(seconds > previous, `${style} charged=${charged} floor ${floor}`);
      previous = seconds;
    }
  }
});
