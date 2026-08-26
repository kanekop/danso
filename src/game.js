'use strict';
// FAULTLINES engine.
// Board: size x size grid of cells. Seams = borders between orthogonally adjacent cells.
// Players alternate placing permanent neutral walls on unwalled seams.
// Restriction: a wall may never create a region of exactly one cell.
// Game ends when both wall budgets are exhausted (or no legal move — provably
// unreachable before that on 5x5 with 8+8 walls, handled defensively).
// Scoring: each cell in an odd-sized region scores for role Odd, even-sized for
// role Even. Odd wins iff oddScore >= T.
//
// Variant knobs:
//   size        board side (default 5)
//   T           Odd's winning threshold (default 11)
//   firstRole   'odd' | 'even' — which role moves first (default 'odd')
//   budgetFirst / budgetSecond   walls for first/second mover (default 8/8)
// Defaults are the shipped rules; measurements in balance_history.md predate
// them and used the old development defaults T=13, 10/10.
//
// Engine "player" 1 = first mover, 2 = second mover (sim harness convention).

function makeGame(variant = {}) {
  const size = variant.size ?? 5;
  const T = variant.T ?? 11;
  const firstRole = variant.firstRole ?? 'odd'; // role of player 1
  const budgetFirst = variant.budgetFirst ?? 8;
  const budgetSecond = variant.budgetSecond ?? 8;

  const nCells = size * size;
  // seams: index -> [cellA, cellB]
  const seams = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size - 1; c++)
      seams.push([r * size + c, r * size + c + 1]);      // horizontal neighbors
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size; c++)
      seams.push([r * size + c, (r + 1) * size + c]);    // vertical neighbors
  const nSeams = seams.length;
  // cell -> list of {seam, other}
  const cellSeams = Array.from({ length: nCells }, () => []);
  seams.forEach(([a, b], i) => {
    cellSeams[a].push({ seam: i, other: b });
    cellSeams[b].push({ seam: i, other: a });
  });

  // flat mirrors of `seams` / `cellSeams` for the bridge scan (hot path)
  const seamA = new Int32Array(nSeams), seamB = new Int32Array(nSeams);
  seams.forEach(([a, b], i) => { seamA[i] = a; seamB[i] = b; });
  const adjStart = new Int32Array(nCells + 1);
  const adjSeam = new Int32Array(2 * nSeams), adjOther = new Int32Array(2 * nSeams);
  for (let c = 0, k = 0; c < nCells; c++) {
    adjStart[c] = k;
    for (let j = 0; j < cellSeams[c].length; j++) {
      adjSeam[k] = cellSeams[c][j].seam; adjOther[k] = cellSeams[c][j].other; k++;
    }
    adjStart[c + 1] = k;
  }

  const totalWalls = budgetFirst + budgetSecond;

  // --- flood fill from cell `start` over unwalled seams; returns visited count.
  // walls: Uint8Array(nSeams). mark: reusable Int32Array(nCells) with stamp.
  // Stamps must stay in Int32Array range; past it markBuf wraps negative, no
  // cell ever matches the stamp and the fixed-size stack overflows. Each stamp
  // issue site resets first.
  const markBuf = new Int32Array(nCells);
  let stampCounter = 0;
  const stack = new Int32Array(nCells);

  function componentSize(walls, start, extraWalledSeam) {
    if (stampCounter >= 0x7ffffffe) { markBuf.fill(0); stampCounter = 0; }
    const stamp = ++stampCounter;
    let top = 0, count = 0;
    stack[top++] = start; markBuf[start] = stamp;
    while (top > 0) {
      const cell = stack[--top];
      count++;
      const adj = cellSeams[cell];
      for (let k = 0; k < adj.length; k++) {
        const { seam, other } = adj[k];
        if (seam === extraWalledSeam || walls[seam]) continue;
        if (markBuf[other] !== stamp) { markBuf[other] = stamp; stack[top++] = other; }
      }
    }
    return count;
  }

  function reaches(walls, start, target, extraWalledSeam) {
    if (stampCounter >= 0x7ffffffe) { markBuf.fill(0); stampCounter = 0; }
    const stamp = ++stampCounter;
    let top = 0;
    stack[top++] = start; markBuf[start] = stamp;
    while (top > 0) {
      const cell = stack[--top];
      if (cell === target) return true;
      const adj = cellSeams[cell];
      for (let k = 0; k < adj.length; k++) {
        const { seam, other } = adj[k];
        if (seam === extraWalledSeam || walls[seam]) continue;
        if (markBuf[other] !== stamp) { markBuf[other] = stamp; stack[top++] = other; }
      }
    }
    return false;
  }

  // legality of walling seam i in position `walls`
  function isLegal(walls, i) {
    if (walls[i]) return false;
    const [a, b] = seams[i];
    if (reaches(walls, a, b, i)) return true;      // splits nothing
    const sa = componentSize(walls, a, i);
    if (sa < 2) return false;
    const sb = componentSize(walls, b, i);
    return sb >= 2;
  }

  // --- all legal walls from one scan of the position.
  // An unwalled seam splits its region only if it is a bridge, so a single
  // Tarjan DFS per region decides every seam: non-bridges are legal, bridges
  // are legal iff both sides keep 2+ cells. Bridge side sizes come from the
  // DFS subtree sizes (subSize[child] and regSize[child] - subSize[child]).
  const disc = new Int32Array(nCells), low = new Int32Array(nCells);
  const subSize = new Int32Array(nCells), parSeam = new Int32Array(nCells);
  const adjIter = new Int32Array(nCells), dfsStack = new Int32Array(nCells);
  const order = new Int32Array(nCells), regSize = new Int32Array(nCells);

  function legalMovesFast(walls) {
    disc.fill(-1);
    let timer = 0, seen = 0;
    for (let root = 0; root < nCells; root++) {
      if (disc[root] !== -1) continue;
      const compStart = seen;
      disc[root] = low[root] = timer++;
      subSize[root] = 1; parSeam[root] = -1; adjIter[root] = adjStart[root];
      order[seen++] = root;
      let top = 0;
      dfsStack[top++] = root;
      while (top > 0) {
        const v = dfsStack[top - 1];
        if (adjIter[v] < adjStart[v + 1]) {
          const k = adjIter[v]++;
          const seam = adjSeam[k], w = adjOther[k];
          if (walls[seam] || seam === parSeam[v]) continue; // no multi-edges
          if (disc[w] === -1) {
            disc[w] = low[w] = timer++;
            subSize[w] = 1; parSeam[w] = seam; adjIter[w] = adjStart[w];
            order[seen++] = w;
            dfsStack[top++] = w;
          } else if (disc[w] < low[v]) low[v] = disc[w];
        } else {
          top--;
          if (top > 0) {
            const p = dfsStack[top - 1];
            if (low[v] < low[p]) low[p] = low[v];
            subSize[p] += subSize[v];
          }
        }
      }
      const total = subSize[root];
      for (let k = compStart; k < seen; k++) regSize[order[k]] = total;
    }
    const ms = [];
    for (let i = 0; i < nSeams; i++) {
      if (walls[i]) continue;
      const a = seamA[i], b = seamB[i];
      let child = -1, par = -1;
      if (parSeam[a] === i) { child = a; par = b; }
      else if (parSeam[b] === i) { child = b; par = a; }
      if (child < 0 || low[child] <= disc[par]) { ms.push(i); continue; }
      const side = subSize[child];
      if (side >= 2 && regSize[child] - side >= 2) ms.push(i);
    }
    return ms;
  }

  // label all regions; returns odd-region cell total
  function oddSum(walls) {
    if (stampCounter >= 0x7ffffffe) { markBuf.fill(0); stampCounter = 0; }
    const stamp = ++stampCounter;
    let odd = 0;
    for (let s = 0; s < nCells; s++) {
      if (markBuf[s] === stamp) continue;
      let top = 0, count = 0;
      stack[top++] = s; markBuf[s] = stamp;
      while (top > 0) {
        const cell = stack[--top];
        count++;
        const adj = cellSeams[cell];
        for (let k = 0; k < adj.length; k++) {
          const { seam, other } = adj[k];
          if (walls[seam]) continue;
          if (markBuf[other] !== stamp) { markBuf[other] = stamp; stack[top++] = other; }
        }
      }
      if (count % 2 === 1) odd += count;
    }
    return odd;
  }

  function roleOf(player) { // 1|2 -> 'odd'|'even'
    return player === 1 ? firstRole : (firstRole === 'odd' ? 'even' : 'odd');
  }

  const game = {
    size, T, firstRole, nSeams, seams, totalWalls,

    initial() {
      return { walls: new Uint8Array(nSeams), placed: 0, toMove: 1 };
    },

    player(s) { return s.toMove; },

    legalMoves(s) {
      return legalMovesFast(s.walls);
    },

    // per-seam flood fill version; reference for the legalMoves cross-check
    legalMovesNaive(s) {
      const ms = [];
      for (let i = 0; i < nSeams; i++) if (isLegal(s.walls, i)) ms.push(i);
      return ms;
    },

    // rejection sampling: exact uniform over legal moves, cheap for playouts
    randomMove(s, rng) {
      const open = [];
      for (let i = 0; i < nSeams; i++) if (!s.walls[i]) open.push(i);
      while (open.length > 0) {
        const j = (rng() * open.length) | 0;
        const i = open[j];
        if (isLegal(s.walls, i)) return i;
        open[j] = open[open.length - 1]; open.pop();
      }
      return null;
    },

    apply(s, move) {
      const walls = s.walls.slice();
      walls[move] = 1;
      return { walls, placed: s.placed + 1, toMove: s.toMove === 1 ? 2 : 1 };
    },

    winner(s) {
      if (s.placed < totalWalls) {
        // Stall ⇒ every unwalled seam is a pendant bridge ⇒ regions form a
        // forest of stars ⇒ E ≤ 4·(nCells − E) ⇒ E ≤ 0.8·nCells.
        // While more seams remain, a legal move provably exists — skip the scan.
        const E = nSeams - s.placed;
        if (E > 0.8 * nCells) return null;
        for (let i = 0; i < nSeams; i++) if (isLegal(s.walls, i)) return null;
      }
      const odd = oddSum(s.walls);
      const oddWins = odd >= T;
      const p1IsOdd = firstRole === 'odd';
      return (oddWins === p1IsOdd) ? 1 : 2;
    },

    // heuristic for 1-ply greedy: current parity ledger from `me`'s perspective
    evaluate(s, me) {
      const odd = oddSum(s.walls);
      return roleOf(me) === 'odd' ? odd : -odd;
    },

    oddSum(s) { return oddSum(s.walls); },
    isLegalMove(s, i) { return isLegal(s.walls, i); },
  };
  return game;
}

module.exports = makeGame;
