const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { sliceText, sliceBetween, functionSource, loadFunctions } = require('./helpers/load');

test('sliceText returns the span between two markers and searches the end after the start', () => {
  const text = 'end-marker a start-marker b end-marker c';
  assert.equal(sliceText(text, 'start-marker', 'end-marker'), 'start-marker b ');
  assert.equal(sliceText(text, 'start-marker'), 'start-marker b end-marker c');
});

test('sliceText fails loudly when a marker is missing instead of slicing the wrong text', () => {
  assert.throws(() => sliceText('abc', 'zzz', 'c', 'demo'), /demo: start marker not found/);
  assert.throws(() => sliceText('abc', 'a', 'zzz', 'demo'), /demo: end marker not found/);
  assert.throws(() => sliceBetween('mobmanager.js', 'function noSuchFunction('), /start marker not found/);
});

test('functionSource closes a function on its own braces, including braces in strings and templates', () => {
  const source = functionSource('mobmanager.js', 'steerEnemyVelocity');
  assert.ok(source.startsWith('function steerEnemyVelocity('));
  assert.ok(source.endsWith('}'));
  assert.throws(() => functionSource('mobmanager.js', 'noSuchFunction'), /not found/);
  const context = vm.createContext({});
  loadFunctions(context, 'playermanager.js', ['attackOriginY']);
  assert.equal(typeof context.attackOriginY, 'function');
});
