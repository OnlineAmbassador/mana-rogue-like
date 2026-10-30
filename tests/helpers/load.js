// Loads parts of the browser-global game scripts into a vm context for tests.
// Every lookup throws a descriptive error when a marker or function is missing, so a renamed or reordered
// function fails loudly instead of slicing the wrong text (indexOf returning -1).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

function readSource(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

// Text from `start` up to (not including) `end`; `end` is searched after `start`.
// A null `end` means the rest of the text. `label` names the source in error messages.
function sliceText(text, start, end = null, label = 'source') {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`${label}: start marker not found: ${JSON.stringify(start)}`);
  if (end === null) return text.slice(from);
  const to = text.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${label}: end marker not found after ${JSON.stringify(start)}: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

function sliceBetween(file, start, end = null) {
  return sliceText(readSource(file), start, end, file);
}

function loadBetween(context, file, start, end = null) {
  vm.runInContext(sliceBetween(file, start, end), context, { filename: file });
  return context;
}

// Source of one top-level function declaration, found by name and closed by brace matching.
function functionSource(file, name) {
  const text = readSource(file);
  const match = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm').exec(text);
  if (!match) throw new Error(`${file}: function ${name} not found`);
  let depth = 0;
  let index = text.indexOf('{', match.index);
  const bodyStart = index;
  if (index === -1) throw new Error(`${file}: function ${name} has no body`);
  for (; index < text.length; index += 1) {
    const char = text[index];
    // Skip strings, template literals, comments and regex-free punctuation that could hide a brace.
    if (char === '/' && text[index + 1] === '/') {
      index = text.indexOf('\n', index);
      if (index === -1) break;
    } else if (char === '/' && text[index + 1] === '*') {
      index = text.indexOf('*/', index + 2) + 1;
    } else if (char === '\'' || char === '"' || char === '`') {
      index = skipString(text, index);
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(match.index, index + 1);
    }
  }
  throw new Error(`${file}: unbalanced braces in function ${name} (body began at ${bodyStart})`);
}

function skipString(text, start) {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') index += 1;
    else if (quote === '`' && char === '$' && text[index + 1] === '{') index = skipTemplateExpression(text, index + 1);
    else if (char === quote) return index;
  }
  throw new Error(`unterminated string starting at ${start}`);
}

function skipTemplateExpression(text, openBrace) {
  let depth = 0;
  for (let index = openBrace; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\'' || char === '"' || char === '`') index = skipString(text, index);
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`unterminated template expression at ${openBrace}`);
}

function loadFunctions(context, file, names) {
  for (const name of names) vm.runInContext(functionSource(file, name), context, { filename: `${file}:${name}` });
  return context;
}

module.exports = { readSource, sliceText, sliceBetween, loadBetween, functionSource, loadFunctions };
