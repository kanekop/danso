'use strict';
// Generic AIs over a Game interface:
//   game.initial() -> state
//   game.legalMoves(state) -> array of moves (non-empty unless terminal)
//   game.apply(state, move) -> new state (must not mutate input)
//   game.winner(state) -> 1 | 2 | 0 (draw) | null (ongoing)
//   game.player(state) -> 1 | 2  (side to move)
//   game.evaluate(state, forPlayer) -> number (heuristic, higher = better) [for greedy AI]

// --- seeded RNG (xorshift32) for reproducibility ---
function makeRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function pick(rng, arr) { return arr[(rng() * arr.length) | 0]; }

// --- weak AI: random ---
function randomAI(rng) {
  return {
    name: 'random',
    chooseMove(game, state) {
      if (game.randomMove) return game.randomMove(state, rng);
      return pick(rng, game.legalMoves(state));
    },
  };
}

// --- weak AI: 1-ply greedy ---
// Wins on the spot if possible; otherwise maximizes evaluate() after its move,
// treating an immediate loss-allowing move only through the eval. Random tie-break.
function greedyAI(rng) {
  return {
    name: 'greedy1',
    chooseMove(game, state) {
      const me = game.player(state);
      const moves = game.legalMoves(state);
      let best = [], bestScore = -Infinity;
      for (const m of moves) {
        const ns = game.apply(state, m);
        const w = game.winner(ns);
        let score;
        if (w === me) score = 1e9;
        else if (w !== null && w !== 0) score = -1e9;
        else if (w === 0) score = 0;
        else score = game.evaluate(ns, me);
        if (score > bestScore + 1e-9) { bestScore = score; best = [m]; }
        else if (score > bestScore - 1e-9) best.push(m);
      }
      return pick(rng, best);
    },
  };
}

// --- strong AI: MCTS (UCT, uniform random playouts) ---
function mctsAI(rng, iterations, opts = {}) {
  const C = opts.c ?? 1.0;
  const maxPlayoutPlies = opts.maxPlayoutPlies ?? 400;
  return {
    name: `mcts${iterations}`,
    chooseMove(game, rootState) {
      const rootPlayer = game.player(rootState);
      const root = { state: rootState, moves: game.legalMoves(rootState), children: [], visits: 0, wins: 0, untried: null, move: null, parent: null, player: rootPlayer };
      root.untried = root.moves.slice();
      if (root.moves.length === 1) return root.moves[0];

      for (let it = 0; it < iterations; it++) {
        // 1. select
        let node = root;
        while (node.untried.length === 0 && node.children.length > 0) {
          let bestChild = null, bestUcb = -Infinity;
          const logN = Math.log(node.visits + 1);
          for (const ch of node.children) {
            const ucb = ch.wins / ch.visits + C * Math.sqrt(logN / ch.visits);
            if (ucb > bestUcb) { bestUcb = ucb; bestChild = ch; }
          }
          node = bestChild;
        }
        // 2. expand
        let state = node.state;
        if (node.untried.length > 0 && game.winner(state) === null) {
          const idx = (rng() * node.untried.length) | 0;
          const move = node.untried[idx];
          node.untried.splice(idx, 1);
          state = game.apply(state, move);
          const child = {
            state, move, parent: node, visits: 0, wins: 0,
            children: [], player: node.player === 1 ? 2 : 1,
            untried: game.winner(state) === null ? game.legalMoves(state) : [],
          };
          // child.player is the player who is "to move" naively; recompute properly:
          child.player = game.winner(state) === null ? game.player(state) : 0;
          node.children.push(child);
          node = child;
        }
        // 3. playout (use game.randomMove — uniform over legal moves — if provided)
        let w = game.winner(state);
        let plies = 0;
        while (w === null && plies < maxPlayoutPlies) {
          const m = game.randomMove ? game.randomMove(state, rng) : pick(rng, game.legalMoves(state));
          if (m === null) break;
          state = game.apply(state, m);
          w = game.winner(state);
          plies++;
        }
        if (w === null) w = 0; // safety: treat as draw
        // 4. backprop — node.wins counts from the perspective of the player who MOVED INTO node
        let n = node;
        while (n !== null) {
          n.visits++;
          if (n.parent !== null) {
            const mover = game.player(n.parent.state); // player who made n.move
            if (w === mover) n.wins += 1;
            else if (w === 0) n.wins += 0.5;
          }
          n = n.parent;
        }
      }
      // most-visited child
      let best = null;
      for (const ch of root.children) if (!best || ch.visits > best.visits) best = ch;
      return best ? best.move : pick(rng, root.moves);
    },
  };
}

module.exports = { makeRng, randomAI, greedyAI, mctsAI };
