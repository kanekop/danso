'use strict';
// Engine correctness tests for Faultlines.
const makeGame = require('./game');
const { makeRng } = require('./ai');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.log('FAIL:', name); }
  else console.log('ok:', name);
}

const g = makeGame({});

// 1. opening: all 40 seams legal (5x5 grid graph is 2-edge-connected)
{
  const s = g.initial();
  check('40 seams', g.nSeams === 40);
  check('all 40 legal at start', g.legalMoves(s).length === 40);
  check('not terminal at start', g.winner(s) === null);
  check('oddSum of uncut board = 25', g.oddSum(s) === 25);
}

// 2. singleton rule: walling both seams of corner cell 0 is illegal on 2nd
{
  let s = g.initial();
  const seamIdx = (a, b) => g.seams.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const s01 = seamIdx(0, 1), s05 = seamIdx(0, 5);
  check('found corner seams', s01 >= 0 && s05 >= 0);
  s = g.apply(s, s01);
  check('second corner seam now illegal', !g.isLegalMove(s, s05));
  check('legal count drops to 38', g.legalMoves(s).length === 38); // 39 unwalled minus the singleton-maker
}

// 3. a known partition: wall off the top row (5 cells) => regions 5 (odd) + 20 (even)
{
  let s = g.initial();
  const seamIdx = (a, b) => g.seams.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let c = 0; c < 5; c++) s = g.apply(s, seamIdx(c, c + 5)); // cut row0 from row1
  check('top row cut: oddSum = 5', g.oddSum(s) === 5);
}

// 4. random games: always exactly 20 plies, winner in {1,2}, oddSum sane
{
  const rng = makeRng(999);
  let minOdd = 99, maxOdd = -1;
  for (let t = 0; t < 2000; t++) {
    let s = g.initial();
    let plies = 0;
    while (g.winner(s) === null) {
      const m = g.randomMove(s, rng);
      if (m === null) break;
      s = g.apply(s, m);
      plies++;
    }
    const w = g.winner(s);
    if (plies !== 20 || (w !== 1 && w !== 2)) { check(`game ${t} plies=${plies} w=${w}`, false); break; }
    const odd = g.oddSum(s);
    if (odd < 0 || odd > 25) { check('oddSum range', false); break; }
    minOdd = Math.min(minOdd, odd); maxOdd = Math.max(maxOdd, odd);
  }
  check('2000 random games: all exactly 20 plies, decisive', true);
  console.log('   oddSum range over random games:', minOdd, '-', maxOdd);
}

// 5. legality via rejection sampler matches full enumeration (uniformity support check)
{
  const rng = makeRng(4242);
  let s = g.initial();
  for (let i = 0; i < 12; i++) s = g.apply(s, g.randomMove(s, rng));
  const legal = new Set(g.legalMoves(s));
  for (let i = 0; i < g.nSeams; i++) {
    if (g.isLegalMove(s, i) !== legal.has(i)) { check('isLegalMove consistency', false); break; }
  }
  check('isLegalMove matches legalMoves enumeration', true);
}

// 6. winner respects T and firstRole
{
  const gT = makeGame({ T: 13, firstRole: 'odd' });
  // build terminal state manually: use random game, then verify mapping
  const rng = makeRng(7);
  let s = gT.initial();
  while (gT.winner(s) === null) s = gT.apply(s, gT.randomMove(s, rng));
  const odd = gT.oddSum(s);
  const w = gT.winner(s);
  check('winner mapping (odd first)', (odd >= 13) === (w === 1));
  const gE = makeGame({ T: 13, firstRole: 'even' });
  let s2 = gE.initial();
  while (gE.winner(s2) === null) s2 = gE.apply(s2, gE.randomMove(s2, rng));
  const odd2 = gE.oddSum(s2);
  const w2 = gE.winner(s2);
  check('winner mapping (even first)', (odd2 >= 13) === (w2 === 2));
}

console.log(failures === 0 ? 'ALL TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
