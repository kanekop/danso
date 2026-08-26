# 改善提案 — 断層 DANSO

## 2026-08-26 レビュー

レビュー範囲: README.md / rulebook.md / index.html(968行) / src/*.js(12ファイル) / .claude/launch.json。
コードは一切変更していない。各項目は明日の実装エージェントがそのまま着手できる粒度で書く。

---

### 1. テスト欠落・正しさ

#### 1-1. エンジンテストが「製品ルールでない既定バリアント」をテストしている
- **優先度: 高**
- **対象**: `src/test_engine.js:12`、`src/game.js:21-24`
- **問題**: `game.js` の既定値は `T=13, budgetFirst=10, budgetSecond=10`（開発中の旧パラメータ）。一方、公開されている最終ルール（rulebook.md / index.html / instrument.js / verify_tutorial.js）は `T=11, 8/8, 16手`。`test_engine.js` は `makeGame({})` で既定値をテストしているため、テスト4の「常に20手で終局」等はすべて**旧バリアントの検証**であり、出荷ルールのエンジンテストが実質存在しない。
- **提案する修正**（どちらか。両方でも可）:
  1. `game.js:21-24` の既定値を最終ルール `T=11, budgetFirst=8, budgetSecond=8` に変更し、`test_engine.js` の期待値を追随（テスト4は「常に16手」、seam数40は不変）。README の再現コマンド例はすでに variant JSON を明示指定しているので影響なし。ただし balance_history.md の過去測定の再現性に注意し、変更する場合はコメントで「旧既定は T=13,10/10」と残す。
  2. 既定値を変えたくない場合は、`test_engine.js` に `makeGame({T:11, budgetFirst:8, budgetSecond:8})` での同型テスト一式（16手終局・oddSum 範囲・isLegal 整合）を追加する。

#### 1-2. index.html 内の複製エンジンと src/game.js の一致検証テストがない
- **優先度: 高**
- **対象**: `index.html:293-376`（複製エンジン）、`src/game.js` 全体
- **問題**: UI はエンジンを丸ごと再実装しており（`compSize`/`reaches`/`isLegal`/`regionInfo`/`oddSum`/`winner`）、コメントで「mirrors src/game.js」と宣言しているだけで機械的な一致保証がない。どちらか一方だけ直す事故（ドリフト）が起きても検出できない。
- **提案する修正**: `src/test_ui_engine.js` を新設。`index.html` を文字列で読み、`<script>` 〜 `/* ================= AIs` の間のエンジン部分を切り出して `new Function` で評価（`initial/apply/isLegal/oddSum/winner/legalMoves` を返させる）。その上で `makeGame({T:11,budgetFirst:8,budgetSecond:8})` と突き合わせ、シード付きランダム 1,000 局で「各局面の legalMoves 集合・oddSum・winner が完全一致」を検証する。1ファイル配布の方針（README「1ファイル・外部通信なし」）を壊さずに二重実装リスクを消せる。

#### 1-3. テスト4が失敗時も「ok」を出力する
- **優先度: 低**
- **対象**: `src/test_engine.js:43-63`（特に56行と61行）
- **問題**: ループ内の `check(..., false)` で failures は増えるが、ループ後の `check('2000 random games...', true)` が無条件に `ok:` を印字するため、出力を目視した際に成否が紛らわしい（exit code は正しい）。
- **提案する修正**: ループ内で `let allOk = true` を立てて失敗時に `allOk = false; break`、最後を `check('2000 random games: all exactly 20 plies, decisive', allOk)` に変える。

#### 1-4. AI 層（ai.js）のテストがゼロ
- **優先度: 中**
- **対象**: `src/ai.js` 全体（特に MCTS のバックプロパゲーション `113-123`）
- **問題**: MCTS の勝敗カウントの視点（「node へ着手したプレイヤー視点」）はバグりやすい箇所だが、テストがない。壊れても bench の勝率がなんとなく下がるだけで気づけない。
- **提案する修正**: `src/test_ai.js` を新設し、最低2点を固定シードで検証する。
  1. サニティ: `mcts:200` vs `random` を 200 局し勝率が 65% 以上（現状 88% 水準なので余裕のある下限で回帰検知）。
  2. 決定性: 同一シードで `chooseMove` を2回呼び、同じ手が返る（makeRng 経路の再現性）。

---

### 2. 堅牢性・エラー処理

#### 2-1. flood fill のスタンプカウンタがオーバーフローし得る
- **優先度: 低**
- **対象**: `src/game.js:47-48`、`index.html:302`
- **問題**: `stampCounter` は無限に増える JS number、`markBuf` は Int32Array。スタンプが 2^31 を超えると格納値が負に折り返し `markBuf[other] !== stamp` が恒真になり、固定長スタック（`Int32Array(nCells)`）があふれて探索結果が壊れる。1プロセスあたり約21億回の flood fill で発火。現行のベンチ規模（プロセス分割あり）では実害はほぼ無いが、長時間の単一プロセス走査を書いた瞬間に踏む。
- **提案する修正**: `componentSize`/`reaches`/`oddSum` の各先頭（スタンプ発行箇所）に `if (stampCounter >= 0x7ffffffe) { markBuf.fill(0); stampCounter = 0; }` を1行入れる。UI 側（index.html:302 以降の `stampC`）にも同じガードを入れる。

#### 2-2. CLI 群に引数バリデーションがない
- **優先度: 低**
- **対象**: `src/parallel.js:10-13`、`src/bench.js:18-22`、`src/instrument.js:7-9`
- **問題**: 引数不足・数値でない `n` などで `NaN` のまま走り、空 JSON や `NaN%` を静かに出力する（parallel.js は jobs が組まれず空集計で 0 除算）。
- **提案する修正**: 各 CLI の argv 解析直後に「必須引数の個数チェック＋ `Number.isInteger` チェック」を入れ、不正時は Usage 1行を stderr に出して `process.exit(2)`。3ファイルで共通化するなら `src/cli_util.js` に `parseIntStrict(name, v)` を切り出す。

#### 2-3. parallel.js のワーカー出力パースが脆い
- **優先度: 低**
- **対象**: `src/parallel.js:26`
- **問題**: `JSON.parse(out)` は bench.js が JSON 以外を1行でも stdout に混ぜた瞬間に例外で全体が落ちる（現状 bench.js は JSON 1行だけなので動くが、bench 側に console.log を足すと壊れる暗黙契約）。
- **提案する修正**: `out` の最終非空行だけを `JSON.parse` する（`out.trim().split('\n').pop()`）。あわせて catch 側でどのワーカー（w 番号・seed）が失敗したかを出す。

---

### 3. コード品質

#### 3-1. MCTS の `child.player` 二重代入（死にコード）
- **優先度: 低**
- **対象**: `src/ai.js:92-99`
- **問題**: 92-96行で `player: node.player === 1 ? 2 : 1` を設定した直後、98行で「recompute properly」と上書きしている。前者は死にコードで、読み手に「どちらが正か」を考えさせる。さらに `child.player` はその後どこからも参照されていない（バックプロパゲーションは `game.player(n.parent.state)` を使う）。
- **提案する修正**: `player` フィールド自体をノードから削除する（root の `player: rootPlayer` も含む）。挙動は不変。

#### 3-2. scan.js / scan2.js / scan3.js の重複
- **優先度: 低**
- **対象**: `src/scan.js:16-25`、`src/scan2.js:14-23`、`src/scan3.js:6-13`
- **問題**: 「parallel.js を spawnSync して JSON を読む」ランナーが3回コピペされている。バランス調整は完了済み（balance_history.md）なので実害は薄いが、再走査するとき3ファイルとも直すことになる。
- **提案する修正**: `scan3.js` の `run(v, ai, n, seed)` を `src/scan_util.js` へ切り出して3ファイルから require する。もしくは、調整完了の歴史資料と割り切るなら3ファイルを `src/archive/` へ移し README のエンジン表から外す（どちらでも可、前者推奨）。

#### 3-3. チュートリアルの脚本が2箇所に重複定義されている
- **優先度: 中**
- **対象**: `index.html:583-586`（TUT_CELL_PAIRS）、`src/verify_tutorial.js:6-9`（MOVES_BY_CELLS）
- **問題**: 同じ16手の脚本が UI と検証スクリプトに別々にハードコードされている。UI 側だけ手を差し替えると verify_tutorial.js が旧脚本を検証し続け、検証の意味がなくなる。
- **提案する修正**: 1-2 のテスト新設と同じ手法で、`verify_tutorial.js` が `index.html` から `TUT_CELL_PAIRS` を正規表現で抽出して検証対象にする（配列リテラルは1箇所＝index.html のみが正）。抽出失敗時は FAIL にする。

#### 3-4. tutSet のセル取得が描画順序に暗黙依存
- **優先度: 低**
- **対象**: `index.html:896-900`
- **問題**: `svg.querySelectorAll('rect')` の先頭 N 個がセルであることに依存（コメントで自認）。render() の描画順を変えると壊れ、パルス対象がずれる静かなバグになる。
- **提案する修正**: render() のセル rect 生成時に `data-cell="${i}"` を付与し、tutSet 側は `svg.querySelector('rect[data-cell="' + c + '"]')` で引く。

---

### 4. 効率化・パフォーマンス

#### 4-1. legalMoves が seam ごとに flood fill をやり直している
- **優先度: 中**
- **対象**: `src/game.js:86-94, 132-135`（UI 側 `index.html:328-334, 360`）
- **問題**: `legalMoves` は40 seam それぞれで `reaches`（最悪 O(N+E)）＋ `componentSize`×2 を実行する。MCTS の expand（全ノードで legalMoves）と greedy の全手評価が支配的コストで、ここが盤面あたり最大 40×3 回の flood fill になっている。
- **提案する修正**: 局面ごとに前計算を1回だけ行う `legalMovesFast` を追加する。
  1. `regionInfo(walls)` を1回実行（O(N+E)）。`label[a] !== label[b]` の seam は「何も切らない」ので無条件に合法 → `reaches` 呼び出しを丸ごと省略。
  2. 同一領域内の seam は「そのグラフの橋(bridge)かどうか」が問題なので、Tarjan の橋検出 DFS を領域ごとに1回走らせ、橋でない seam は合法、橋 seam のみ従来の `componentSize` 2回で 1マス領域チェック。
  これで局面あたりの flood fill が「40×3回」から「数回＋橋 seam 分」に落ちる。既存 `legalMoves` は残し、`test_engine.js` に「fast と素朴版の結果集合が全ランダム局面で一致」の照合テストを追加してから MCTS/greedy を fast に切り替える。UI の「つよい」（時間制限 1.5 秒）は同じ時間でより深く読めるようになる。

#### 4-2. UI の MCTS がメインスレッドで動いている
- **優先度: 低**
- **対象**: `index.html:394-447`
- **問題**: 35ms スライス＋setTimeout で応答性を確保しており実用上は問題ないが、思考中のスクロールやアニメーションに微細なカクつきが出る。1ファイル配布の制約で外部 Worker ファイルは置けない。
- **提案する修正**: エンジン＋mctsMove を文字列化して `Blob` → `URL.createObjectURL` → `new Worker(url)` で同一ファイル内 Worker 化する（外部通信なしのまま）。1-2 のエンジン切り出しテストが入っていれば安全に移せる。優先度は低く、4-1 の後で十分。

#### 4-3. MCTS が毎手ツリーを捨てている
- **優先度: 低**
- **対象**: `src/ai.js:62-131`、`index.html:394-447`
- **問題**: 直前の探索木のうち「実際に指された手の子ノード」以下は再利用できるが、毎回ゼロから構築している。
- **提案する修正**: UI 側のみでよい（bench 側は独立性が測定上の美徳）。前回の root を保持し、人間と AI の直近2手ぶんの子を辿って新 root にする。ヒットしない場合は従来通り新規構築。体感強さ向上の割に変更が局所的。

---

### 5. セキュリティ

#### 5-1. 平文キー・秘密情報: 検出なし
- **優先度: —（対応不要）**
- **対象**: リポジトリ全体
- **問題**: なし。外部通信ゼロ・API キーなし・`.env` 類なしを確認した。`index.html` の `innerHTML` 代入（`index.html:781, 902, 926`）はすべて自前の静的 i18n 文字列のみでユーザー入力が混ざる経路がなく、XSS の実害なし。
- **提案する修正**: 不要。今後スコア共有機能等で URL パラメータや外部入力を innerHTML 経路に流す場合のみ `textContent` 化を検討。

#### 5-2. 開発サーバーが全インターフェースに bind される
- **優先度: 低**
- **対象**: `.claude/launch.json:5-9`
- **問題**: `python3 -m http.server 8321` は既定で 0.0.0.0 に bind し、同一 LAN から開発ページが見える。静的ゲームなので実害は軽微だが閉じておくのが行儀。
- **提案する修正**: `runtimeArgs` を `["-m", "http.server", "8321", "--bind", "127.0.0.1"]` に変更。

---

### 6. 運用改善

#### 6-1. package.json がなく、テスト・検証の入口が口伝
- **優先度: 中**
- **対象**: プロジェクトルート（新規 `package.json`）
- **問題**: `node src/test_engine.js` と `node src/verify_tutorial.js` の存在を README のファイル表から察するしかない。Node バージョン要件（`??` 演算子使用 → Node 14+）も未宣言。
- **提案する修正**: 最小の `package.json` を追加する。
  ```json
  {
    "name": "danso",
    "private": true,
    "engines": { "node": ">=18" },
    "scripts": {
      "test": "node src/test_engine.js && node src/verify_tutorial.js",
      "bench": "node src/parallel.js src/game.js '{\"T\":11,\"firstRole\":\"odd\",\"budgetFirst\":8,\"budgetSecond\":8}' greedy greedy 10000 999001 8"
    }
  }
  ```
  1-2 / 1-4 のテストを追加したら `test` スクリプトに連結する。

#### 6-2. CI がない（GitHub Pages 公開物なのに壊れ検知が手動）
- **優先度: 中**
- **対象**: 新規 `.github/workflows/test.yml`
- **問題**: 公開 URL（kanekop.github.io/danso）があるのに、push で `npm test` を回す仕組みがない。特に 1-2（UI エンジンのドリフト）は CI がないと事実上検出不能。
- **提案する修正**: actions/setup-node（Node 20）→ `npm test` を実行するだけの 15 行程度のワークフローを追加。ベンチ系（確率的・重い）は CI に含めず、決定的なテストのみ回す。

#### 6-3. index.html に DOCTYPE がなく Quirks モードで描画される
- **優先度: 中**
- **対象**: `index.html:1`
- **問題**: ファイルが `<title>` から始まり `<!DOCTYPE html>` がないため、全ブラウザで後方互換（Quirks）モード描画になる。現状は偶然表示が成立しているが、ボックスモデルや行高の解釈が標準モードと異なり、今後の CSS 変更で「手元だけ崩れる」原因になる。`<html lang>` がない点も `document.documentElement.lang` を JS で設定して補っている状態（`index.html:917`）。
- **提案する修正**: 先頭に `<!DOCTYPE html>` と `<html lang="ja">` を追加（`<head>`/`<body>` タグは省略可能なので最小差分は DOCTYPE 1 行＋html 開始タグのみ）。追加後に標準モードで表示崩れがないか目視確認する。

#### 6-4. README のフォルダ名と公開リポジトリ名の不一致
- **優先度: 低**
- **対象**: `README.md:8`、ローカルフォルダ名 `game1`
- **問題**: 公開先は `kanekop.github.io/danso`（リポ名 danso）だがローカルは `game1`。実害はないが、他のエージェントが「danso リポはどこか」を探すときに迷う。
- **提案する修正**: README 冒頭に「ローカル作業フォルダ: ~/Projects/Apps/game1（リモート: kanekop/danso）」の1行を足す（コード変更なし・ドキュメントのみ）。

---

## 着手順の推奨（2026-08-26）

1. **1-1**（既定値を最終ルールへ or 最終ルールのテスト追加）— 最小差分で最大のテスト価値
2. **1-2 + 3-3**（index.html からエンジン/脚本を抽出して照合するテスト）— 二重実装ドリフトの封じ込め
3. **6-1 → 6-2**（package.json → CI）— 上のテストを自動で回す土台
4. **6-3**（DOCTYPE）— 1行、目視確認のみ
5. **4-1**（legalMoves 高速化）— 照合テストが入ってから着手
