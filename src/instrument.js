'use strict';
// Tension metrics: leader flips, late decisions, comebacks, margins, opening diversity.
// Usage: node instrument.js <aiSpec> <nGames> <seed>
const makeGame = require('./game');
const { makeRng, randomAI, greedyAI, mctsAI } = require('./ai');
const { setUsage, parseIntStrict, parsePositiveInt } = require('./cli_util');

setUsage('node instrument.js <aiSpec> <nGames> <seed>');

// All three argv are optional; validate only what was actually supplied.
const spec = process.argv[2] || 'greedy';
const n = process.argv[3] ? parsePositiveInt('nGames', process.argv[3]) : 2000;
const seed = process.argv[4] ? parseIntStrict('seed', process.argv[4]) : 2025;

function factory(spec, rng) {
  if (spec === 'random') return randomAI(rng);
  if (spec === 'greedy') return greedyAI(rng);
  const m = spec.match(/^mcts:(\d+)$/);
  if (m) return mctsAI(rng, parseInt(m[1], 10));
  throw new Error('bad spec');
}

const game = makeGame({ T: 11, firstRole: 'odd', budgetFirst: 8, budgetSecond: 8 });
const T = 11;

let flipsTotal = 0, lastFlipHist = new Array(17).fill(0), comebacks = 0, winnerTrailedAt8 = 0;
const marginHist = {};
const firstMoveCount = {};
let oddWins = 0;

for (let g = 0; g < n; g++) {
  const rngA = makeRng(seed + g * 7919);
  const rngB = makeRng(seed + g * 7919 + 104729);
  const aiA = factory(spec, rngA), aiB = factory(spec, rngB);
  let s = game.initial();
  let leader = game.oddSum(s) >= T ? 1 : 2; // odd=player1 in this variant
  let flips = 0, lastFlip = 0, leaderAt8 = null;
  let ply = 0, firstMove = null;
  while (game.winner(s) === null) {
    const ai = game.player(s) === 1 ? aiA : aiB;
    const mv = ai.chooseMove(game, s);
    if (ply === 0) firstMove = mv;
    s = game.apply(s, mv);
    ply++;
    const newLeader = game.oddSum(s) >= T ? 1 : 2;
    if (newLeader !== leader) { flips++; lastFlip = ply; leader = newLeader; }
    if (ply === 8) leaderAt8 = leader;
  }
  const w = game.winner(s);
  if (w === 1) oddWins++;
  flipsTotal += flips;
  lastFlipHist[lastFlip]++;
  if (leaderAt8 !== null && w !== leaderAt8) winnerTrailedAt8++;
  const margin = Math.abs(game.oddSum(s) - T); // distance from threshold (oddSum is odd, T=11: margin 0,2,4..)
  marginHist[margin] = (marginHist[margin] || 0) + 1;
  firstMoveCount[firstMove] = (firstMoveCount[firstMove] || 0) + 1;
}

const decidedLast4 = lastFlipHist.slice(13).reduce((a, b) => a + b, 0);
const entropy = Object.values(firstMoveCount).reduce((h, c) => {
  const p = c / n; return h - p * Math.log2(p);
}, 0);

console.log(JSON.stringify({
  ai: spec, n,
  p1WinRate: +(100 * oddWins / n).toFixed(2),
  avgLeaderFlips: +(flipsTotal / n).toFixed(2),
  lastFlipHistogram: lastFlipHist,
  decidedInLast4PliesPct: +(100 * decidedLast4 / n).toFixed(2),
  winnerTrailedAtPly8Pct: +(100 * winnerTrailedAt8 / n).toFixed(2),
  finalMarginHist: marginHist,
  distinctFirstMoves: Object.keys(firstMoveCount).length,
  firstMoveEntropyBits: +entropy.toFixed(2),
  maxFirstMoveShare: +(100 * Math.max(...Object.values(firstMoveCount)) / n).toFixed(1),
}, null, 1));
