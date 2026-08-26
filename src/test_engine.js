'use strict';
// Engine correctness tests for Faultlines.
const makeGame = require('./game');
const { makeRng } = require('./ai');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.log('FAIL:', name); }
  else console.log('ok:', name);
}

// shipped rules
const SHIPPED = { T: 11, firstRole: 'odd', budgetFirst: 8, budgetSecond: 8 };
const g = makeGame(SHIPPED);

// 0. the no-variant defaults are the shipped rules. Every other test names its
// variant explicitly, so without this the defaults could drift back unnoticed.
{
  const d = makeGame({});
  check('default T = 11', d.T === SHIPPED.T);
  check('default firstRole = odd', d.firstRole === SHIPPED.firstRole);
  check('default totalWalls = 16', d.totalWalls === SHIPPED.budgetFirst + SHIPPED.budgetSecond);
  check('default size = 5 (40 seams)', d.nSeams === 40);
  const rng = makeRng(31337);
  let s = d.initial(), plies = 0;
  while (d.winner(s) === null) { s = d.apply(s, d.randomMove(s, rng)); plies++; }
  check('default rules play out in 16 plies', plies === 16);
}

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

// 4. random games: always exactly 16 plies, winner in {1,2}, oddSum sane
{
  const rng = makeRng(999);
  let minOdd = 99, maxOdd = -1;
  let allOk = true;
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
    if (plies !== 16 || (w !== 1 && w !== 2)) { check(`game ${t} plies=${plies} w=${w}`, false); allOk = false; break; }
    const odd = g.oddSum(s);
    if (odd < 0 || odd > 25) { check('oddSum range', false); allOk = false; break; }
    minOdd = Math.min(minOdd, odd); maxOdd = Math.max(maxOdd, odd);
  }
  check('2000 random games: all exactly 16 plies, decisive', allOk);
  console.log('   oddSum range over random games:', minOdd, '-', maxOdd);
}

// 5. legality via rejection sampler matches full enumeration (uniformity support check)
{
  const rng = makeRng(4242);
  let s = g.initial();
  for (let i = 0; i < 12; i++) s = g.apply(s, g.randomMove(s, rng));
  const legal = new Set(g.legalMoves(s));
  let allOk = true;
  for (let i = 0; i < g.nSeams; i++) {
    if (g.isLegalMove(s, i) !== legal.has(i)) { check('isLegalMove consistency', false); allOk = false; break; }
  }
  check('isLegalMove matches legalMoves enumeration', allOk);
}

// 6. winner respects T and firstRole
{
  const gT = makeGame({ T: 13, firstRole: 'odd', budgetFirst: 8, budgetSecond: 8 });
  // build terminal state manually: use random game, then verify mapping
  const rng = makeRng(7);
  let s = gT.initial();
  while (gT.winner(s) === null) s = gT.apply(s, gT.randomMove(s, rng));
  const odd = gT.oddSum(s);
  const w = gT.winner(s);
  check('winner mapping (odd first)', (odd >= 13) === (w === 1));
  const gE = makeGame({ T: 13, firstRole: 'even', budgetFirst: 8, budgetSecond: 8 });
  let s2 = gE.initial();
  while (gE.winner(s2) === null) s2 = gE.apply(s2, gE.randomMove(s2, rng));
  const odd2 = gE.oddSum(s2);
  const w2 = gE.winner(s2);
  check('winner mapping (even first)', (odd2 >= 13) === (w2 === 2));
}

// 7. legalMoves (bridge scan) matches the per-seam flood fill version, order included
{
  const rng = makeRng(31337);
  let positions = 0, bad = null;
  const stateOf = (walls) => ({ walls, placed: 0, toMove: 1 });

  function compare(s) {
    if (bad !== null) return;
    positions++;
    const fast = g.legalMoves(s), naive = g.legalMovesNaive(s);
    const n = Math.max(fast.length, naive.length);
    for (let i = 0; i < n; i++) {
      if (fast[i] !== naive[i]) {
        bad = { walls: Array.from(s.walls).join(''), at: i, fast: fast[i], naive: naive[i] };
        return;
      }
    }
  }

  // random games, every ply from the opening to the terminal position
  for (let t = 0; t < 1200 && bad === null; t++) {
    let s = g.initial();
    compare(s);
    while (g.winner(s) === null) {
      const m = g.randomMove(s, rng);
      if (m === null) break;
      s = g.apply(s, m);
      compare(s);
    }
  }

  // arbitrary wall sets: dense endgames, singletons, several isolated regions
  const perm = new Int32Array(g.nSeams);
  for (let t = 0; t < 12000 && bad === null; t++) {
    for (let i = 0; i < g.nSeams; i++) perm[i] = i;
    for (let i = g.nSeams - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    const k = 20 + ((rng() * (g.nSeams - 19)) | 0); // 20..40 walls
    const walls = new Uint8Array(g.nSeams);
    for (let i = 0; i < k; i++) walls[perm[i]] = 1;
    compare(stateOf(walls));
  }

  // extremes: empty board, fully walled board, every single-wall position
  compare(stateOf(new Uint8Array(g.nSeams)));
  compare(stateOf(new Uint8Array(g.nSeams).fill(1)));
  for (let i = 0; i < g.nSeams; i++) {
    const walls = new Uint8Array(g.nSeams); walls[i] = 1;
    compare(stateOf(walls));
  }

  if (bad !== null) {
    console.log(`   walls=${bad.walls} first difference at position ${bad.at}: fast=${bad.fast} naive=${bad.naive}`);
  }
  check(`legalMoves matches legalMovesNaive over ${positions} positions`, bad === null);
  check('cross-check covered 20000+ positions', positions >= 20000);
}

console.log(failures === 0 ? 'ALL TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
