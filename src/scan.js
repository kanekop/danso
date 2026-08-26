'use strict';
// Variant grid scan. Usage: node scan.js <ai> <n> <seed> [variantsJsonFile]
const { run } = require('./scan_util');

const ai = process.argv[2] || 'greedy';
const n = process.argv[3] || '10000';
const seed = process.argv[4] || '777';

const variants = [];
for (const T of [11, 13, 15])
  for (const firstRole of ['odd', 'even'])
    for (const [bf, bs] of [[10, 10], [11, 10], [10, 9], [9, 10], [10, 11]])
      variants.push({ T, firstRole, budgetFirst: bf, budgetSecond: bs });

for (const v of variants) {
  let o;
  try { o = run(v, ai, n, seed); }
  catch (e) { console.error('FAILED', JSON.stringify(v), e.stderr || e.message); continue; }
  const flag = o.p1Rate >= 48 && o.p1Rate <= 52 ? '  <== IN RANGE' : '';
  console.log(`T=${v.T} first=${v.firstRole} budget=${v.budgetFirst}/${v.budgetSecond}: P1 ${o.p1Rate}% ci=[${o.ci95}]${flag}`);
}
