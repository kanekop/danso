'use strict';
// CLI: node parallel.js <gameModulePath> <variantJSON> <aiA> <aiB> <totalN> <baseSeed> [workers]
// Shards totalN across worker processes, merges results, prints summary JSON.

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const { wilson } = require('./sim');
const { setUsage, requireArgs, parseIntStrict, parsePositiveInt } = require('./cli_util');

setUsage('node parallel.js <gameModulePath> <variantJSON> <aiA> <aiB> <totalN> <baseSeed> [workers]');

const [, , gamePath, variantJson, aiA, aiB, totalNStr, baseSeedStr, workersStr] = process.argv;
requireArgs(['gameModulePath', 'variantJSON', 'aiA', 'aiB', 'totalN', 'baseSeed'],
  [gamePath, variantJson, aiA, aiB, totalNStr, baseSeedStr]);
const totalN = parsePositiveInt('totalN', totalNStr);
const baseSeed = parseIntStrict('baseSeed', baseSeedStr);
const workers = parsePositiveInt('workers', workersStr || '8');

const per = Math.ceil(totalN / workers);
const jobs = [];
for (let w = 0; w < workers; w++) {
  const n = Math.min(per, totalN - w * per);
  if (n <= 0) break;
  const seed = baseSeed + w * 1000003;
  const who = 'worker ' + w + ' (seed ' + seed + ')';
  jobs.push(new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(__dirname, 'bench.js'), gamePath, variantJson, aiA, aiB, String(n), String(seed),
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(who + ' exited ' + code));
      // Tolerate extra stdout chatter: only the last non-empty line is the result JSON.
      const line = out.trim().split('\n').pop();
      try { resolve(JSON.parse(line)); }
      catch (e) { reject(new Error(who + ' printed unparsable output: ' + e.message + ' | last line: ' + JSON.stringify(line))); }
    });
  }));
}

Promise.all(jobs).then((results) => {
  const agg = { n: 0, p1Wins: 0, p2Wins: 0, draws: 0, plies: 0, ms: 0 };
  for (const r of results) {
    agg.n += r.n; agg.p1Wins += r.p1Wins; agg.p2Wins += r.p2Wins; agg.draws += r.draws;
    agg.plies += r.avgPlies * r.n; agg.ms = Math.max(agg.ms, r.ms);
  }
  const w = wilson(agg.p1Wins, agg.n);
  console.log(JSON.stringify({
    variant: JSON.parse(variantJson || '{}'), aiA, aiB,
    n: agg.n, p1Wins: agg.p1Wins, p2Wins: agg.p2Wins, draws: agg.draws,
    p1Rate: +(100 * agg.p1Wins / agg.n).toFixed(2),
    ci95: [+(100 * w.lo).toFixed(2), +(100 * w.hi).toFixed(2)],
    drawRate: +(100 * agg.draws / agg.n).toFixed(2),
    avgPlies: +(agg.plies / agg.n).toFixed(1),
    wallMs: agg.ms,
  }));
}).catch((e) => { console.error(e); process.exit(1); });
