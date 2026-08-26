'use strict';
// Drift check: the engine embedded in index.html vs src/game.js.
// Usage: node src/test_ui_engine.js [path/to/index.html]
const fs = require('fs');
const path = require('path');
const makeGame = require('./game');
const { makeRng } = require('./ai');

const START_MARKER = '/* ================= engine';
const END_MARKER = '/* ================= AIs';
const GAMES = 1000;
const SEED = 20260826;

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.log('FAIL:', name); }
  else console.log('ok:', name);
}
function finish() {
  console.log(failures === 0 ? 'ALL TESTS PASSED' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

const htmlPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'index.html');
const lines = fs.readFileSync(htmlPath, 'utf8').split('\n');
const start = lines.findIndex(l => l.includes(START_MARKER));
const end = lines.findIndex(l => l.includes(END_MARKER));
if (start < 0 || end < 0 || end <= start) {
  failures++;
  console.log('FAIL: engine section markers not found in', htmlPath);
  const at = (i) => (i < 0 ? 'not found' : `line ${i + 1}`);
  console.log(`   "${START_MARKER}": ${at(start)} / "${END_MARKER}": ${at(end)}`);
  finish();
}
check(`engine section extracted from ${path.basename(htmlPath)} (lines ${start + 1}-${end})`, true);

const src = lines.slice(start, end).join('\n');
const ui = new Function('"use strict";\n' + src +
  '\nreturn { initial, apply, isLegal, legalMoves, randomMove, oddSum, winner, seams, NSEAMS };')();

const g = makeGame({ T: 11, firstRole: 'odd', budgetFirst: 8, budgetSecond: 8 });

// 1. seam table
{
  check('UI NSEAMS === 40', ui.NSEAMS === 40);
  check('engine nSeams === UI NSEAMS', g.nSeams === ui.NSEAMS);
  let same = ui.seams.length === g.seams.length;
  for (let i = 0; same && i < g.seams.length; i++) {
    if (ui.seams[i][0] !== g.seams[i][0] || ui.seams[i][1] !== g.seams[i][1]) {
      same = false;
      console.log(`   seam ${i}: game.js [${g.seams[i]}] vs index.html [${ui.seams[i]}]`);
    }
  }
  check('seams identical including order', same);
}

// 2/3. seeded random games, compared at every ply
{
  const rng = makeRng(SEED);
  const winCount = [0, 0, 0];
  let terminalWinnerAgree = 0, terminalOddAgree = 0, positions = 0;
  let mismatch = null;

  for (let t = 0; t < GAMES && mismatch === null; t++) {
    let s = g.initial(), u = ui.initial(), lastMove = -1;
    for (let ply = 0; ; ply++) {
      const report = (field, a, b) => {
        mismatch = { t, ply, lastMove, field, a: String(a), b: String(b) };
      };
      const gm = g.legalMoves(s), um = ui.legalMoves(u);
      let d = -1;
      for (let i = 0; i < Math.max(gm.length, um.length); i++) if (gm[i] !== um[i]) { d = i; break; }
      if (d >= 0) { report(`legalMoves (first difference at position ${d})`, `[${gm}]`, `[${um}]`); break; }
      const go = g.oddSum(s), uo = ui.oddSum(u.walls);
      if (go !== uo) { report('oddSum', go, uo); break; }
      const gw = g.winner(s), uw = ui.winner(u);
      if (gw !== uw) { report('winner', gw, uw); break; }
      positions++;
      if (gw !== null) {
        terminalWinnerAgree++;
        if (go === uo) terminalOddAgree++;
        winCount[gw]++;
        break;
      }
      if (ply >= g.totalWalls) { report('game did not terminate within totalWalls plies', ply, ply); break; }
      lastMove = gm[(rng() * gm.length) | 0];
      s = g.apply(s, lastMove);
      u = ui.apply(u, lastMove);
    }
  }

  if (mismatch !== null) {
    failures++;
    console.log(`FAIL: mismatch in game ${mismatch.t}, ply ${mismatch.ply}, after seam ${mismatch.lastMove}: ${mismatch.field}`);
    console.log('   src/game.js  :', mismatch.a);
    console.log('   index.html   :', mismatch.b);
  } else {
    check(`${GAMES} seeded games: legalMoves/oddSum/winner agree at every ply`, true);
    console.log('   positions compared:', positions);
  }
  check(`terminal winner agrees in all ${GAMES} games`, terminalWinnerAgree === GAMES);
  check(`terminal oddSum agrees in all ${GAMES} games`, terminalOddAgree === GAMES);
  console.log('   winner distribution: p1(odd)', winCount[1], ' p2(even)', winCount[2]);
}

finish();
