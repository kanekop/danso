'use strict';
// Match runner + stats. Usage (from a driver script):
//   const { playGames, wilson } = require('./sim');
//   playGames(game, aiFactoryA, aiFactoryB, nGames, baseSeed)
// aiFactory: (rng) => ai. Player 1 is always aiA (first mover); alternate colors
// by calling twice with swapped factories if needed.

const { makeRng } = require('./ai');

function playOneGame(game, aiFirst, aiSecond, maxPlies = 1000) {
  let state = game.initial();
  let plies = 0;
  while (plies < maxPlies) {
    const w = game.winner(state);
    if (w !== null) return { winner: w, plies };
    const ai = game.player(state) === 1 ? aiFirst : aiSecond;
    const move = ai.chooseMove(game, state);
    state = game.apply(state, move);
    plies++;
  }
  return { winner: 0, plies }; // runaway = draw (should not happen in finite games)
}

// n games, aiA always plays first player. Returns {p1Wins, p2Wins, draws, avgPlies}
function playGames(game, factoryA, factoryB, n, baseSeed = 12345, onProgress = null) {
  let p1Wins = 0, p2Wins = 0, draws = 0, totalPlies = 0;
  for (let i = 0; i < n; i++) {
    const rngA = makeRng(baseSeed + i * 2654435761);
    const rngB = makeRng(baseSeed + i * 2654435761 + 1013904223);
    const r = playOneGame(game, factoryA(rngA), factoryB(rngB));
    if (r.winner === 1) p1Wins++;
    else if (r.winner === 2) p2Wins++;
    else draws++;
    totalPlies += r.plies;
    if (onProgress && (i + 1) % 500 === 0) onProgress(i + 1, { p1Wins, p2Wins, draws });
  }
  return { n, p1Wins, p2Wins, draws, avgPlies: totalPlies / n };
}

// Wilson 95% CI for a proportion
function wilson(successes, n) {
  if (n === 0) return { p: 0, lo: 0, hi: 1 };
  const z = 1.96, p = successes / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom;
  return { p, lo: center - half, hi: center + half };
}

function fmtResult(label, r) {
  const w = wilson(r.p1Wins, r.n);
  return `${label}: n=${r.n} P1 ${(100 * r.p1Wins / r.n).toFixed(2)}% ` +
    `[${(100 * w.lo).toFixed(2)}, ${(100 * w.hi).toFixed(2)}] ` +
    `P2 ${(100 * r.p2Wins / r.n).toFixed(2)}% draws ${r.draws} avgPlies ${r.avgPlies.toFixed(1)}`;
}

module.exports = { playOneGame, playGames, wilson, fmtResult };
