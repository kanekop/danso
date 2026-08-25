# 断層 — DANSO

ゼロから発明した2人対戦・完全情報・運要素なしのアブストラクトゲーム。
5×5の盤の目地に壁を置いて盤を切り分け、終局時に奇数サイズ領域のマスは先手「奇」、偶数サイズ領域のマスは後手「偶」の得点になる。奇は11点以上で勝ち。引き分けは構造的に存在しない。

## 遊ぶ

**→ https://kanekop.github.io/danso/** (GitHub Pages)

またはリポジトリの [index.html](index.html) をブラウザで開くだけ(サーバー不要・1ファイル・外部通信なし)。

- **AI対戦**: よわい(1手読み)/ふつう(MCTS400)/つよい(時間制限付きMCTS 約1.5秒/手)
- **ふたりで**: 同じ端末での対人戦
- **チュートリアル**: 実際の1局(16手)を追いながらルールと逆転の仕組みを学べる解説モード
- スマホ対応(タップ2回で確定)、日本語/英語切替、待った付き

## 成果物

| ファイル | 内容 |
|---|---|
| [rulebook.md](rulebook.md) | ルールブック(日本語+英語、各A4半分) |
| [index.html](index.html) | ブラウザ対戦UI(1ファイル、MCTS内蔵) |
| [balance_history.md](balance_history.md) | バランス調整の全履歴(設計案5つの審査、R0〜R7の改訂と却下理由、全測定値) |
| [fun_evidence.md](fun_evidence.md) | 面白さの定量的根拠(1ページ) |

## 主要な数値

- 弱AI(ランダム+1手読み)同士 **40,000局**: 先手勝率 **50.07%** [49.58, 50.56]
- 強AI(MCTS1000) vs 弱AI **500局**: **88.4%** 勝利(Elo差 約+353)
- 引き分け: 全60,000局超で **0**(得点合計25が奇数のため構造的に不可能)
- 決着が最後の4手まで動く対局: **66-69%** / 中盤時点で劣勢だった勝者: **52%**
- 初手エントロピー: **5.32ビット(理論最大)** — 強制定跡なし

## エンジン(再現用)

```
src/game.js        エンジン本体(variantパラメータ付き)
src/ai.js          random / greedy(1手読み) / MCTS(UCT)
src/sim.js         対戦ランナー+Wilson信頼区間
src/bench.js       単一ベンチマークCLI
src/parallel.js    8並列ベンチマーク
src/scan*.js       バランス調整に使ったグリッド走査
src/instrument.js  接戦度・逆転率・初手多様性の計測
src/test_engine.js エンジン単体テスト
```

例: `node src/parallel.js src/game.js '{"T":11,"firstRole":"odd","budgetFirst":8,"budgetSecond":8}' greedy greedy 10000 999001 8`
