# DOCXエンジンPoC実測（#11 / #15）

2026-10-25 JST。**採用候補は未決定、既定変更・移行・旧経路撤去は行わない。**
現行mainの製品エクスポートには変更を加えず、独立したPoCで比較した。

## 実行条件

- Windows x64、Node 24.22.1。
- vscode-html-to-docx 1.1.3、docx 9.14.0、html-to-docx 1.8.0、
  @oxfordabstracts/html-to-docx 2.3.0。専用package-lockで推移依存も固定。
- 10合成入力×4候補×embedded/linked = 80条件。
  これとは別にリンク切れ入力1件を前処理で意図どおり拒否。
- Mermaid 11.15.0、KaTeX 0.16.2とChromeで実際にPNGを生成。
  fixtureごとに前処理は1回だけ実行し、同じHTML・画像バイト・hashを全候補に使用。
- 全候補で同じA4サイズを明示。画像はwidth/height属性を含む同一HTML。
- raw（生成直後）を保存し、legacyのみ既存normalizerを適用した別のfinalを保存。
  新候補へlegacy補正は適用しない。linkedのPNG/JPEG参照追加は別段階。
- SDK 3.3.0のOffice2013/Office2019双方でraw/finalを検証。
  ローカルは既存.NET5へのtarget overrideで実行し、System.IO.Packagingの
  framework support警告あり。新CIは.NET8を使用する。ローカル結果を
  .NET8/他OSでの検証完了とは扱わない。

## 比較結果

「SDK合格」はOffice2019条件でエラー0だった件数。Word実機合格ではない。
生成不可はSVG/画像モードの明示的未対応であり、黙って画像を変更していない。
独自検査は限定検査なので、0件でもSDKエラーが残る場合がある。

| 候補 | モード | 生成数 | 独自検査エラー raw→final | SDK合格 | 本文/画像寸法差のあるケース | 未対応 |
| --- | --- | --- | --- | --- | --- | --- |
| 現行 | embedded | 10/10 | 15→0 | 10/10 | 2 | 0 |
| 現行 | linked | 0/10 | — | — | — | 10 |
| docx.js | embedded | 8/10 | 0→0 | 8/8 | 0 | 2 |
| docx.js | linked | 8/10 | 0→0 | 8/8 | 0 | 2 |
| privateOmega | embedded | 10/10 | 15→15 | 0/10 | 3 | 0 |
| privateOmega | linked | 8/10 | 11→11 | 0/8 | 2 | 2 |
| Oxford | embedded | 10/10 | 5→5 | 2/10 | 3 | 0 |
| Oxford | linked | 8/10 | 3→3 | 2/8 | 2 | 2 |

詳細: [測定JSON](../poc/docx-engines/measurements/windows-node24.json)、
[自動集計](../poc/docx-engines/measurements/comparison.md)。JSONに入力/出力SHA-256、
SDKエラーのpart/path、版/integrity、診断、処理時間を保存。
`status`は独自検査、`overallStatus`はSDK結果を反映する。

### 観測した差

- **現行**: 重複tblGrid、sectPr順序、SVG Content Type等のraw欠陥が再現。
  既存normalizer後は10件すべてSDK合格。PNG/JPEGのwidth/height属性が示す
  表示寸法との差は残る。linkedは製品側も#2〜#5の実装待ち。
- **docx.js**: 生成した表・セル結合・段落・見出し/リスト/改ページ・PNG/JPEGは
  SDK合格。PNG/JPEG外部リンクは出現IDから参照を編集し構造検査に合格した。
  ただしCSSの完全再現性を意味しない。明示table幅、動的画像の一部CSSや
  Mermaid補助要素等にエラー診断を残しており、これらは候補合格ではない。
- docx.js 9.14.0のSVG APIはラスターfallbackを要求する。この最小アダプターは
  SVGケース2件を未対応にした。SVGをPNGに置換して成功扱いしていない。
  ライブラリ自体にSVG機能がない、という結論ではない。
- **privateOmega**: sectPr位置、表grid/罫線等の要素順、SVG Content Typeに
  SDKエラー。エンジンを同系統の別パッケージへ変えるだけでは解消しなかった。
- **Oxford**: sectPrの問題は改善している一方、表grid/罫線・結合セルの順序、
  numberingの要素順、SVG Content Typeなどの問題が残った。SDK合格2件は
  PNG/JPEGとKaTeXで、画像寸法/実機を含めた合格とは異なる。
- linked PNG/JPEGはpic:cNvPrまたはwp:docPrの明示出現IDを使用。
  同じ画像を2回使っても別IDで対応し、ID消失/競合は拒否する。
  参照追加後も元embedded mediaを診断用に保持するため、不要media削除や
  可搬性・リンク更新は未受入。SVG linkedは#4の実機判断待ち。

## 配布・環境・性能

候補パッケージ本体のLICENSEはすべてMIT。専用lockに版・integrityを記録。
jszip等の推移依存の配布NOTICE監査は製品統合前に別途必要。
公式npmでの公開日/由来はPoC READMEに記載し、公開日だけで保守品質を順位付けしない。

| 候補 | Node用minify bundle目安 | ポリフィルなしbrowser bundle |
| --- | --- | --- |
| 現行 | 869,073 bytes | 失敗（Node組込み依存） |
| docx.js | 476,939 bytes | ビルド成功 |
| privateOmega | 1,292,941 bytes | 失敗（Node組込み依存） |
| Oxford | 1,100,803 bytes | 失敗（Node組込み依存） |

これは候補ライブラリ単体のesbuild結果。アダプター、Chromium、動的描画依存を
含まず、ブラウザ実行成功やVSIX増分を証明しない。PoC自体は`poc/**`を
.vscodeignoreで除外し、製品依存へ追加していない。

単回生成のfixture横断中央値はembeddedで現行26.9ms、docx.js43.0ms、
privateOmega17.8ms、Oxford29.2ms。異なるfixture数、初回ロード、後処理差があり、
速度順位の根拠にしない。ADRで予定したcold/warm5回・メモリ・実VSIXの
統制比較は未完了の受入項目として残す。

## 原稿の再検査とWord実機

ローカルarticle16原本コピーのSHA-256は既存記録と一致:
`593ac260236ebdc372e3456a24c12a63206769508c195c4f7c9aaf943a0656bf`。
今回の非修正検査でも表1個5行、重複grid、SVG未登録、sectPr位置を検出。
既存のnormalizedコピーは独自検査0件、SDK Office2019条件0件。
原本とnormalizedコピーのSVG2点は同一バイトで、画像寸法・段落数も保持されていた。
これは既存補正の再確認であり、新候補で原稿を再生成した結果ではない。
原本・本文・画像は公開も変更もしていない。

Windows Wordは起動しアクセシビリティ情報を取得できたが、ファイルを開く操作で
`coordinate input geometry is unavailable`、再取得で
`FrameArrived timed out: timed out waiting on channel`。生成物を開く前に停止した。
このホストにはMac版Wordの実行環境がない。
[Word受入表](../poc/docx-engines/WORD-ACCEPTANCE.md)はすべてnot-runのまま。
PR #10のarticle18保存クラッシュや内部SVG名対照の実機結論は更新していない。

## 結論と次の条件

docx.jsは構造制御の追加調査を進める候補。ただしSVG、CSS、画像リンク実機の
不足があり、採用決定ではない。HTML系2候補も今回のraw出力のままでは移行不可。
現行補正を維持し、#16・#17は着手条件未達のままにする。

1. このPoCのレビューと.NET8/各OS CI結果を確認する。
2. SVGを保持するdocx.js出力方式と必要なfallbackの方針を決め、CSS対応を拡張する。
3. #4/#7/#9と連携し、Windows/Macで開く→編集/保存2回→閉じる→再オープンを実施。
4. #2〜#5の画像契約、#6の回帰/新VSIX、性能・ライセンス条件を満たしてから採用ADR。

今回の回帰: PoC 14件、既存DOCX 22件がローカル成功。
CI合格は比較処理の再現性であり、候補のWord互換性合格とは分けて扱う。
