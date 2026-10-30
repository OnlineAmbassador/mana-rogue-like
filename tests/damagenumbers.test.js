const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadFunctions, readSource } = require('./helpers/load');
const { combat } = require('./helpers/combat');

// Top-level const declarations are not properties of the vm context, so read them through the context.
const numbers = (c) => vm.runInContext('damageNumbers', c);

function numbersContext({ lowQuality = false, reducedMotion = false } = {}) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, name) => (name in target ? target[name] : (...args) => calls.push({ method: name, args })),
    set: (target, name, value) => { target[name] = value; return true; },
  });
  const c = vm.createContext({
    Math, String, ctx, calls, elapsed: 5, quality: { low: lowQuality },
    window: { matchMedia: () => ({ matches: reducedMotion }) },
  });
  const declarations = /const damageNumbers = \[\];[\s\S]*?const DAMAGE_NUMBER_LIFE = [0-9.]+;/.exec(readSource('game.js'));
  assert.ok(declarations, 'game.js must declare the damage number constants');
  vm.runInContext(declarations[0], c);
  loadFunctions(c, 'gameui.js', ['prefersReducedMotion', 'addDamageNumber', 'drawDamageNumbers']);
  return c;
}

test('a landed hit adds one number and it expires', () => {
  const c = numbersContext();
  c.addDamageNumber(100, 100, 7.4);
  assert.equal(numbers(c).length, 1);
  assert.equal(numbers(c)[0].text, '7');
  assert.equal(numbers(c)[0].heavy, false);
  c.drawDamageNumbers();
  assert.ok(c.calls.some((call) => call.method === 'fillText'));
  c.elapsed += 1;
  c.drawDamageNumbers();
  assert.equal(numbers(c).length, 0);
});

test('heavy hits are marked and zero damage adds nothing', () => {
  const c = numbersContext();
  c.addDamageNumber(0, 0, 12);
  c.addDamageNumber(0, 0, 0);
  assert.equal(numbers(c).length, 1);
  assert.equal(numbers(c)[0].heavy, true);
});

test('the list is capped', () => {
  const c = numbersContext();
  for (let i = 0; i < 60; i += 1) c.addDamageNumber(0, 0, 1 + i);
  assert.equal(numbers(c).length, vm.runInContext('MAX_DAMAGE_NUMBERS', c));
  assert.equal(numbers(c).at(-1).text, '60');
});

test('low quality and reduced motion suppress the numbers', () => {
  for (const options of [{ lowQuality: true }, { reducedMotion: true }]) {
    const c = numbersContext(options);
    c.addDamageNumber(0, 0, 9);
    assert.equal(numbers(c).length, 0, JSON.stringify(options));
  }
});

test('damageEnemy reports direct hits but not elemental ticks', () => {
  const c = combat();
  const seen = [];
  c.addDamageNumber = (x, y, amount) => seen.push(amount);
  const enemy = () => ({ x: 300, y: 300, radius: 12, hp: 20, maxHp: 20, kind: 'maggot' });
  c.damageEnemy(enemy(), 5, 280, 300, true, true);
  c.damageEnemy(enemy(), 3, 280, 300, true, false);
  assert.deepEqual(seen, [5]);
});
