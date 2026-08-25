'use strict';
// W (total walls) sweep. Usage: node scan2.js <ai> <n> <seed>
const { spawnSync } = require('child_process');
const path = require('path');

const ai = process.argv[2] || 'greedy';
const n = process.argv[3] || '10000';
const seed = process.argv[4] || '888';

for (const T of [13, 15])
  for (const firstRole of ['odd', 'even'])
    for (let W = 16; W <= 24; W++) {
      const bf = Math.ceil(W / 2), bs = Math.floor(W / 2);
      const v = { T, firstRole, budgetFirst: bf, budgetSecond: bs };
      const r = spawnSync(process.execPath, [
        path.join(__dirname, 'parallel.js'), path.join(__dirname, 'game.js'),
        JSON.stringify(v), ai, ai, n, seed, '8',
      ], { encoding: 'utf8' });
      if (r.status !== 0) { console.error('FAILED', JSON.stringify(v), r.stderr); continue; }
      const o = JSON.parse(r.stdout);
      const flag = o.p1Rate >= 48 && o.p1Rate <= 52 ? '  <== IN RANGE' : '';
      console.log(`T=${T} first=${firstRole} W=${W} (${bf}/${bs}): P1 ${o.p1Rate}% ci=[${o.ci95}]${flag}`);
    }
