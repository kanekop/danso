'use strict';
// AI-layer tests for Faultlines: strength sanity, seed determinism, MCTS
// backprop perspective, and move legality. All seeded, no wall-clock deps.
const makeGame = require('./game');
const { makeRng, randomAI, greedyAI, mctsAI } = require('./ai');
const { playGames } = require('./sim');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.log('FAIL:', name); }
  else console.log('ok:', name);
}

// shipped rules
const g = makeGame({ T: 11, firstRole: 'odd', budgetFirst: 8, budgetSecond: 8 });

// 1. sanity: mcts must dominate random
{
  const r = playGames(g, (rng) => mctsAI(rng, 200), (rng) => randomAI(rng), 200, 20260826);
  const rate = r.p1Wins / r.n;
  check('mcts:200 beats random in >= 65% of 200 games', rate >= 0.65);
  console.log(`   mcts:200 vs random: ${r.p1Wins}/${r.n} = ${(100 * rate).toFixed(1)}%, avgPlies ${r.avgPlies}`);
}

// replay a move list from the initial position; ok=false if any move is illegal
function build(seq) {
  let s = g.initial(), ok = true;
  for (const m of seq) {
    if (!g.isLegalMove(s, m)) { ok = false; break; }
    s = g.apply(s, m);
  }
  return { state: s, ok };
}

// 2. determinism: same seed -> same move, different seeds -> not all the same
{
  const mid = build([0, 1, 18, 33, 26, 17]);
  check('midgame fixture replays legally', mid.ok);
  const positions = [['opening', g.initial()], ['midgame', mid.state]];
  const seeds = [1, 7, 42, 777, 20260826, 999001, 123456789, 2654435761];
  const ais = [
    ['greedy', (rng) => greedyAI(rng)],
    ['mcts:200', (rng) => mctsAI(rng, 200)],
  ];
  for (const [aiName, factory] of ais) {
    for (const [posName, s] of positions) {
      const a = factory(makeRng(20260826)).chooseMove(g, s);
      const b = factory(makeRng(20260826)).chooseMove(g, s);
      check(`${aiName} ${posName}: same seed gives the same move`, a === b);
    }
    const spread = seeds.map((seed) => factory(makeRng(seed)).chooseMove(g, g.initial()));
    const distinct = new Set(spread);
    check(`${aiName} opening: seed changes the move`, distinct.size >= 2);
    console.log(`   ${aiName} opening moves over ${seeds.length} seeds: ${spread.join(',')}`);
  }
}

// 3. MCTS backprop perspective: node.wins must count wins for the player who
// moved into the node. A flipped comparison makes mcts prefer the losing move.
{
  // 14 plies of the 16-ply game played out; the tail is a complete 1-2 ply search
  const PREFIX = [0, 1, 18, 33, 26, 17, 35, 34, 39, 5, 4, 14, 8, 6];

  // exact minimax value of every root move (only 1-2 plies remain)
  function moveValues(s) {
    const mover = g.player(s);
    const vals = new Map();
    for (const m of g.legalMoves(s)) {
      const ns = g.apply(s, m);
      const w = g.winner(ns);
      if (w !== null) { vals.set(m, w === mover ? 1 : -1); continue; }
      let v = 1;
      for (const r of g.legalMoves(ns)) {
        if (g.winner(g.apply(ns, r)) !== mover) { v = -1; break; }
      }
      vals.set(m, v);
    }
    return vals;
  }

  const fixtures = [
    { label: 'first player to move', seq: PREFIX, mover: 1 },
    { label: 'second player to move', seq: PREFIX.concat([11]), mover: 2 },
  ];
  for (const fx of fixtures) {
    const b = build(fx.seq);
    check(`${fx.label}: fixture replays legally`, b.ok);
    check(`${fx.label}: player ${fx.mover} is on move`, g.player(b.state) === fx.mover);
    check(`${fx.label}: position is not terminal`, g.winner(b.state) === null);
    const vals = moveValues(b.state);
    const wins = [...vals].filter(([, v]) => v > 0).map(([m]) => m);
    const losses = [...vals].filter(([, v]) => v < 0).map(([m]) => m);
    check(`${fx.label}: a forced win exists`, wins.length > 0);
    check(`${fx.label}: a losing move exists`, losses.length > 0);
    const chosen = mctsAI(makeRng(20260826), 400).chooseMove(g, b.state);
    check(`${fx.label}: mcts takes the forced win`, wins.includes(chosen));
    console.log(`   ${fx.label}: winning ${wins.join('/')}, losing ${losses.length} of ${vals.size}, mcts played ${chosen}`);
  }
}

// 4. random and greedy always return a legal move
{
  const rng = makeRng(31337);
  const ais = [randomAI(makeRng(4242)), greedyAI(makeRng(4243))];
  const bad = ais.map(() => 0);
  let positions = 0;
  for (let t = 0; positions < 1200; t++) {
    let s = g.initial();
    while (g.winner(s) === null) {
      const legal = new Set(g.legalMoves(s));
      ais.forEach((ai, k) => { if (!legal.has(ai.chooseMove(g, s))) bad[k]++; });
      positions++;
      s = g.apply(s, g.randomMove(s, rng));
    }
  }
  ais.forEach((ai, k) => check(`${ai.name} returns a legal move in all ${positions} positions`, bad[k] === 0));
}

console.log(failures === 0 ? 'ALL TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
