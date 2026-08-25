'use strict';
// Variant grid scan. Usage: node scan.js <ai> <n> <seed> [variantsJsonFile]
const { spawnSync } = require('child_process');
const path = require('path');

const ai = process.argv[2] || 'greedy';
const n = process.argv[3] || '10000';
const seed = process.argv[4] || '777';

const variants = [];
for (const T of [11, 13, 15])
  for (const firstRole of ['odd', 'even'])
    for (const [bf, bs] of [[10, 10], [11, 10], [10, 9], [9, 10], [10, 11]])
      variants.push({ T, firstRole, budgetFirst: bf, budgetSecond: bs });

for (const v of variants) {
  const r = spawnSync(process.execPath, [
    path.join(__dirname, 'parallel.js'), path.join(__dirname, 'game.js'),
    JSON.stringify(v), ai, ai, n, seed, '8',
  ], { encoding: 'utf8' });
  if (r.status !== 0) { console.error('FAILED', JSON.stringify(v), r.stderr); continue; }
  const o = JSON.parse(r.stdout);
  const flag = o.p1Rate >= 48 && o.p1Rate <= 52 ? '  <== IN RANGE' : '';
  console.log(`T=${v.T} first=${v.firstRole} budget=${v.budgetFirst}/${v.budgetSecond}: P1 ${o.p1Rate}% ci=[${o.ci95}]${flag}`);
}
