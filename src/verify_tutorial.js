'use strict';
// Verify the tutorial's scripted 16-move game: all moves legal, score beats as designed.
const makeGame = require('./game');
const g = makeGame({ T: 11, firstRole: 'odd', budgetFirst: 8, budgetSecond: 8 });

const MOVES_BY_CELLS = [
  [0, 1], [3, 4], [2, 3], [7, 8], [12, 13], [17, 18], [18, 23], [19, 24],
  [6, 11], [10, 15], [11, 16], [12, 17], [17, 22], [13, 14], [21, 22], [16, 21],
];
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
console.log(ok && g.winner(s) === 1 && g.oddSum(s) === 17 ? 'TUTORIAL SCRIPT OK (final 17-8, Odd wins)' : 'SCRIPT NEEDS FIXING');
