'use strict';
// CLI: node bench.js <gameModulePath> <variantJSON> <aiA> <aiB> <n> <seed>
// aiA plays first player in every game. AI spec: random | greedy | mcts:<iters>
// Prints one JSON line with the aggregate result.

const path = require('path');
const { randomAI, greedyAI, mctsAI } = require('./ai');
const { playGames } = require('./sim');

function factoryFor(spec) {
  if (spec === 'random') return (rng) => randomAI(rng);
  if (spec === 'greedy') return (rng) => greedyAI(rng);
  const m = spec.match(/^mcts:(\d+)$/);
  if (m) { const it = parseInt(m[1], 10); return (rng) => mctsAI(rng, it); }
  throw new Error('unknown AI spec: ' + spec);
}

const [, , gamePath, variantJson, aiA, aiB, nStr, seedStr] = process.argv;
const makeGame = require(path.resolve(gamePath));
const game = makeGame(JSON.parse(variantJson || '{}'));
const n = parseInt(nStr, 10);
const seed = parseInt(seedStr, 10);
const t0 = Date.now();
const r = playGames(game, factoryFor(aiA), factoryFor(aiB), n, seed);
r.ms = Date.now() - t0;
r.variant = JSON.parse(variantJson || '{}');
r.aiA = aiA; r.aiB = aiB; r.seed = seed;
console.log(JSON.stringify(r));
