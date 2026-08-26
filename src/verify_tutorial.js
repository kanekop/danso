'use strict';
// Verify the tutorial's scripted 16-move game: all moves legal, score beats as designed.
// The script has a single source of truth: TUT_CELL_PAIRS in index.html, extracted here.
// Usage: node src/verify_tutorial.js [path/to/index.html]
const fs = require('fs');
const path = require('path');
const makeGame = require('./game');
const g = makeGame({ T: 11, firstRole: 'odd', budgetFirst: 8, budgetSecond: 8 });

const HTML_PATH = process.argv[2] || path.join(__dirname, '..', 'index.html');
const PLIES = 16;
const N_CELLS = Math.max(...g.seams.map(([a, b]) => Math.max(a, b))) + 1;

function fail(msg) {
  console.log(msg);
  console.log('SCRIPT NEEDS FIXING');
  process.exit(1);
}

function readCellPairs(file) {
  let src = '';
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { fail(`cannot read ${file}: ${e.message}`); }
  const m = src.match(/const\s+TUT_CELL_PAIRS\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) fail(`TUT_CELL_PAIRS not found in ${file}`);
  const json = m[1].replace(/,(\s*[\]}])/g, '$1'); // drop trailing commas so JSON.parse accepts it
  let pairs = null;
  try { pairs = JSON.parse(json); } catch (e) { fail(`TUT_CELL_PAIRS is not valid JSON: ${e.message}`); }
  if (!Array.isArray(pairs) || pairs.length !== PLIES)
    fail(`TUT_CELL_PAIRS has ${Array.isArray(pairs) ? pairs.length : 'no'} moves, expected ${PLIES}`);
  pairs.forEach((p, i) => {
    const okPair = Array.isArray(p) && p.length === 2
      && p.every((v) => Number.isInteger(v) && v >= 0 && v < N_CELLS);
    if (!okPair) fail(`TUT_CELL_PAIRS[${i}] is not a cell pair in 0..${N_CELLS - 1}: ${JSON.stringify(p)}`);
  });
  return pairs;
}

const MOVES_BY_CELLS = readCellPairs(HTML_PATH);
const seamIdx = (a, b) => g.seams.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));

let s = g.initial();
let ok = true;
MOVES_BY_CELLS.forEach(([a, b], ply) => {
  const i = seamIdx(a, b);
  if (i < 0) { console.log(`ply ${ply + 1}: seam (${a},${b}) NOT FOUND`); ok = false; return; }
  if (!g.isLegalMove(s, i)) { console.log(`ply ${ply + 1}: seam (${a},${b}) ILLEGAL`); ok = false; }
  s = g.apply(s, i);
  console.log(`ply ${ply + 1} (${ply % 2 === 0 ? 'Odd' : 'Even'}): (${a},${b}) -> oddSum ${g.oddSum(s)}, winner ${g.winner(s)}`);
});
if (ok && g.winner(s) === 1 && g.oddSum(s) === 17) {
  console.log('TUTORIAL SCRIPT OK (final 17-8, Odd wins)');
} else {
  console.log('SCRIPT NEEDS FIXING');
  process.exit(1);
}
