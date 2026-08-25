'use strict';
// Two-stage scan: greedy 10k filter [48,52] -> mcts:300 1000-game check.
const { spawnSync } = require('child_process');
const path = require('path');

function run(v, ai, n, seed) {
  const r = spawnSync(process.execPath, [
    path.join(__dirname, 'parallel.js'), path.join(__dirname, 'game.js'),
    JSON.stringify(v), ai, ai, String(n), String(seed), '8',
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('run failed: ' + r.stderr);
  return JSON.parse(r.stdout);
}

const candidates = [];
for (const T of [11, 13, 15])
  for (const firstRole of ['odd', 'even'])
    for (let W = 15; W <= 23; W++)
      candidates.push({ T, firstRole, budgetFirst: Math.ceil(W / 2), budgetSecond: Math.floor(W / 2) });

const passed = [];
for (const v of candidates) {
  const o = run(v, 'greedy', 10000, 424242);
  const inRange = o.p1Rate >= 48 && o.p1Rate <= 52;
  console.log(`greedy T=${v.T} first=${v.firstRole} W=${v.budgetFirst + v.budgetSecond}: ${o.p1Rate}%${inRange ? '  PASS' : ''}`);
  if (inRange) passed.push(v);
}
console.log('--- greedy passers:', passed.length, '---');
for (const v of passed) {
  const o = run(v, 'mcts:300', 1000, 515151);
  const ok = o.p1Rate >= 45 && o.p1Rate <= 55;
  console.log(`mcts300 T=${v.T} first=${v.firstRole} W=${v.budgetFirst + v.budgetSecond}: ${o.p1Rate}% ci=[${o.ci95}]${ok ? '  <== BOTH BALANCED' : ''}`);
}
