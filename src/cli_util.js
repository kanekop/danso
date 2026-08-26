'use strict';
// Argv validation shared by the CLI entry points.
// setUsage() registers the signature printed on any rejection; failures exit(2).

let usageLine = '';

function setUsage(line) { usageLine = line; }

function fail(msg) {
  console.error(msg);
  console.error('Usage: ' + usageLine);
  process.exit(2);
}

// names/values are positionally aligned; a missing value is reported by name.
function requireArgs(names, values) {
  for (let i = 0; i < names.length; i++) {
    if (values[i] === undefined) fail('missing argument <' + names[i] + '>');
  }
}

// parseInt accepts '12abc'; require the whole string to be an integer literal.
function parseIntStrict(name, value) {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    fail('<' + name + '> must be an integer, got: ' + value);
  }
  return parseInt(value, 10);
}

function parsePositiveInt(name, value) {
  const n = parseIntStrict(name, value);
  if (n <= 0) fail('<' + name + '> must be > 0, got: ' + value);
  return n;
}

module.exports = { setUsage, fail, requireArgs, parseIntStrict, parsePositiveInt };
