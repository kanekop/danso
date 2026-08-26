'use strict';
// Shared scan runner: spawn parallel.js for one variant and return its summary JSON.

const { spawnSync } = require('child_process');
const path = require('path');

function run(v, ai, n, seed, workers = 8) {
  const r = spawnSync(process.execPath, [
    path.join(__dirname, 'parallel.js'), path.join(__dirname, 'game.js'),
    JSON.stringify(v), ai, ai, String(n), String(seed), String(workers),
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    const err = new Error('run failed: ' + r.stderr);
    err.stderr = r.stderr;
    throw err;
  }
  return JSON.parse(r.stdout);
}

module.exports = { run };
