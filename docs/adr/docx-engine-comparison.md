# ADR: DOCXエンジン比較とPoC実装仕様（#11）

- 日付: 2026-10-25 JST
- 状態: Proposed。比較設計のみ。候補の実装・実測・採用判断は未完了。
- 対象: docx.jsとHTML-to-DOCX系。Pandocは評価・導入とも対象外。
- このPR: 文書のみ。製品コード、既定設定、依存を変更しない。
- 親: [#11](https://github.com/makotosan/vscode-office/issues/11)

## 1. 確認範囲と現行経路

GitHub mainの下記ソースを確認（調査対象blob）:

| 対象 | blob SHA | 役割 |
| --- | --- | --- |
| src/service/markdown/html-export.js | 623e82bc87dca32b0dc9a1b5e5148d87bd26321f | DOCX生成・動的画像化・保存 |
| src/service/markdown/markdown-pdf.js | c34c71d5e7135ded6b87a19fc5926d4818cde499 | Markdown→HTML、画像パス、テンプレート/CSS |
| src/service/markdown/docx-package.js | d6f308660ad0a0de92a708d89c3e47a2ec8e242f | ZIP/XML限定補正と整合性検査 |
| package.json | 5844406a6a50422f59ac42df95bc097a7c97d63c | vscode-html-to-docx 1.1.3固定、test:docx |

経路:
`MarkdownService.exportMarkdown()/getConfig()`
→ `convertMd()/convertMarkdown()`
→ `convertMarkdownToHtml()`
→ `mergeHtml()`
→ `exportByType(..., "docx", config)`
→ `exportDocx()`
→ `replaceDynamicContentWithImages()`
→ `vscode-html-to-docx(html, "", {}, "")`
→ Blob.arrayBuffer
→ `normalizeDocxPackage()`
→ `fs.writeFileSync()`。

HTML生成はmarkdown-itと拡張群。Markdown画像とHTMLブロックのimgはconvertImgPathでパスを処理し、相対/絶対パスをfile URI化する。data/HTTP(S)はそれぞれ別の経路となるため、ライブラリが実際に読み込めるかはfixtureで評価する。テンプレートにはmarkdown.css、markdown-pdf.css、構文強調、KaTeX CSSを組み込む。ブラウザのCSS描画とDOCXライブラリのCSS解釈は同一ではない。

動的Mermaid/KaTeXがあるとPuppeteer/ChromiumでHTMLを開き、フォント/図の描画を待ちPNG data URIに置換。通常のSVG画像をPNG化する処理とは区別する。動的変換のcatchが元HTMLへ戻る場合があり、PoCではこれを成功として集計せず診断する。動的画像化がなければこの関数はHTMLをそのまま返す。

getConfigにtype、Chromium、Puppeteer引数、A4、余白等がある一方、現行DOCX呼び出しのdocumentOptionsは空のオブジェクト。PDF用ページ設定がDOCXにも効くとは扱わない。#2のdocxImageModeは確認したmainのgetConfigには存在しない。embedded/linkedは後続実装の契約であり、現行実装済みと記載しない。

normalizeDocxPackageは同一重複tblGridの整理、既知プロパティ順、結合セルspan、body末尾sectPr、SVG Content Type、compatibilityMode=15を補正し、XML/Content Type/Relationshipを確認する。未知要素や競合gridを拒否する限定補正で、完全なスキーマ検証器ではない。エラー時は書き込み前に停止するが、現行writeFileSync自体が原子的保存であるとは主張しない。新候補の未知拡張を拒否する可能性があるため、全候補に無条件適用しない。

PDF/HTMLはDOCX normalizerを通らない。現行DOCX経路はNodeのfs/Bufferを使用し、動的画像にはChromiumが必要。ライブラリ単体のbrowser対応は、Web版拡張機能でのDOCX出力対応を意味しない。

## 2. 比較評価表（仕様・仮説と実測を分離）

「要検証」は未実施であり、対応/合格を意味しない。保守性の順位、速度、サイズは未計測。

| 評価軸 | 現行 vscode-html-to-docx 1.1.3 | docx.js（npm docx） | privateOmega/html-to-docx | @oxfordabstracts/html-to-docx |
| --- | --- | --- | --- | --- |
| 入力/統合 | 現行HTMLを直接使用 | HTML→中間モデル→宣言的API。変換実装が必要 | HTMLを直接使用する候補 | パッケージ実体/由来を先に確認 |
| HTML/CSS | 既存CSSの対応範囲はfixtureで可視化 | 対応CSSをモデルへ写像。未対応を診断 | 上流に未対応範囲あり。ブラウザ同等とみなさない | 要調査 |
| 表/セル結合 | mainに限定補正あり | 構造を明示構築する案、同一fixtureで検査 | 同系統でも同じ欠陥かはraw検査で確認 | 要調査 |
| 見出し/リスト/改ページ | 基準出力を取得 | モデルから構築し番号/スタイルを検査 | HTML/CSS解釈を検査 | 要調査 |
| PNG/JPEG/SVG embedded | 既存テストあり。実機一般化不可 | API/参照形式/画像保持を要検証 | MIME/参照/描画を要検証 | 要調査 |
| linked/動的画像 | #2〜#5未完了の契約 | 外部relationship用の隔離処理を検討 | 同左。ネイティブ対応を要確認 | 要調査 |
| altChunk | 出力で検査 | 出力で不使用を確認 | 上流はaltChunkの互換問題を回避する設計と説明。出力でも検査 | 要調査 |
| 実行環境 | 現行Node経路 | 上流はNode/browser対応を明示。統合は別検証 | READMEはブラウザ直接実行非対応と説明 | 要調査 |
| ライセンス | 配布パッケージLICENSE/NOTICEを採取 | 上流MIT。採用版と推移依存も確認 | 上流MIT。採用版と推移依存も確認 | 実体・ライセンス未確認 |
| 保守/配布 | バージョン固定。上流差分を調査 | 採用版、最終release/commit、課題対応を記録 | 同左。fork間の修正差分も確認 | 出所確認後に評価 |
| 性能/VSIX | 実測ベースライン未取得 | 未計測 | 未計測 | 未計測 |
| 修復/互換モード/Mac保存 | #8の限定改善証跡あり、#9/#10の未解決例あり | 未実施 | 未実施 | 未実施 |

一次資料（2026-10-25確認）:

- [docx上流](https://github.com/dolanmiu/docx): Node/browser対応とMIT表記。
- [html-to-docx上流README](https://github.com/privateOmega/html-to-docx/blob/master/README.md): HTML入力、Buffer/Blob返値、ブラウザ直接実行制約、CSS/改ページ等の注意とMIT表記。
- [現行ソース](https://github.com/makotosan/vscode-office/blob/main/src/service/markdown/html-export.js)と[既存調査](https://github.com/makotosan/vscode-office/blob/main/docs/docx-ooxml-integrity.md)。
- @oxfordabstractsの公開情報取得はこの調査では完了していない。存在しない/保守停止とは推定せず#14で公式npmメタデータからrepository URL、版、LICENSE、fork差分を確定。

候補導入時に正確なversion、tarball integrity、上流commit、調査日、依存グラフ、license/NOTICEを固定する。最新という記載だけで再現性を代替しない。html-docx-js等altChunk依存方式は本PoCの主要候補に加えない。

## 3. 実装境界と共通入力

`poc/docx-engines/` を独立した実験領域とし、候補依存は専用package.json/lockで固定。通常の製品ビルドへ組み込まない。1 Issue = 1ブランチ = 1PR。最初はCLIで比較し、製品の設定追加/既定変更は#16に分離。

実験コマンドの仕様（この文書時点では未実装）:

```text
node poc/docx-engines/run.cjs --engine=legacy --fixture=table-five-rows --image-mode=embedded
node poc/docx-engines/run.cjs --engine=docxjs --fixture=table-five-rows --image-mode=embedded
node poc/docx-engines/run.cjs --engine=html-to-docx --fixture=table-five-rows --image-mode=embedded
```

engine省略時はlegacy。不明なengine/画像モード、未実装機能は明示的失敗。既存エンジンやPNGへ黙ってfallbackしない。実験フラグは既存ユーザー設定とは区別する。

共通前処理は一度だけ実行し、元HTML・動的PNG置換後HTML・CSS・画像台帳・各hashを固定。同じ置換後HTMLを全候補に渡す。docx.jsだけがHTMLからモデルを構築し、HTML系は元の置換後HTMLを直接読む。双方の結果を独立した期待値（文字列、表寸法、結合、画像種別/表示寸法等）と比較する。

モデル案:

```ts
type ImageMode = "embedded" | "linked";
interface Input {
  html: string; css: string; baseUri: string;
  assets: Asset[]; page: PageSpec; imageMode: ImageMode;
}
interface Asset {
  id: string; sourceUri: string; mime: string; sha256: string;
  widthPx: number; heightPx: number;
  generatedBy?: "mermaid" | "katex";
}
interface Adapter {
  id: string; version: string;
  generate(input: Input): Promise<{
    bytes: Uint8Array; diagnostics: Diagnostic[];
    assetReferences: Record<string, string[]>;
  }>;
}
```

Asset内容バイト/解決済みURIは別のresolverが供給。linkedの相対URIはDOCX出力先を基準とし、data URIや動的画像は#5の永続アセットへ移す。台帳IDをHTML要素からDrawingML/Relationshipへ追跡し、複数の同一画像も識別する。配列順/画像hashだけを根拠に置換しない。

中間モデルDocumentはblocks（paragraph、heading、table、list、pageBreak、image）とpage/styleを持つ。runは文字列/装飾/リンク、tableは列幅とrows/cells、cellはcolSpan/rowSpanと子blocks、画像はassetIdと寸法/配置を持つ。単位はモデル内で明示し、px→twip/EMU変換を一箇所に集約。日本語フォント、段落間隔、行間、罫線、背景色、太字/斜体等の対応CSS一覧を作る。未対応要素/CSSはsource位置付き診断を残す。

## 4. rawと出荷候補の比較

1. 各候補の生成直後raw.docxを保持し、非修正型検査器とSDKに通す。
2. legacyだけは既存normalizeDocxPackageを適用した出荷基準も保存する。
3. 新候補が後処理を必要とする場合は別段階として実装し、適用した修正名と前後diffを記録する。raw失敗を補正後成功で隠さない。
4. linked用処理は名前空間対応XML/ZIP操作に隔離し、a:blip/@r:linkとTargetMode=External、Content Type、参照先を検査する。SVG拡張は#4の実機条件に従う。
5. 最終候補を検証してから一時ファイルへ書き、成功時のみ対象へ置き換える。失敗時は既存DOCXを維持する。
6. 実際にWordへ渡した生成物とWord保存後のコピーをhashで結び、両方を再検査する。

既存normalizerは限定補正であるため、検査専用APIと修正APIを分離して設計する。SVG/拡張を利用する候補にlegacyのプロパティ制限を無条件適用しない。

## 5. 共通fixtureと計測

| 群 | ケース | 確認 |
| --- | --- | --- |
| 基本 | 表なし、日本語、見出し、装飾、リスト、改ページ | 本文保持、階層、番号、ページ設定 |
| 表 | 5行3列、複数表、thead/tbody、空セル、列幅、罫線 | tblGridの回数/位置、tblPr/tcPr順、行列/幅 |
| 結合 | colspan、rowspan、同時結合、境界ケース | span/merge整合と表示 |
| 画像 | PNG/JPEG/SVG、同一画像複数、混在 | MIME、参照、寸法、画像バイト |
| 動的 | Mermaid、KaTeX inline/display | 前処理成功、台帳、表示/linked永続化 |
| パス | 相対/絶対/file/data/HTTP(S)、日本語/空白/# | URI解決、リンク更新、切れたリンクの扱い |
| 異常 | 競合grid、壊れた参照、未対応CSS、描画失敗 | 明示診断、既存出力維持 |

embedded/linkedを別々に実行。HTTP(S)は制御したテストサーバーを利用し外部サイト変動を避ける。同一OS/Node/フォント/ページ仕様で比較し、生成のみと動的描画込みの時間を分ける。cold 1回とwarm 5回の中央値・最大値、メモリ、DOCXサイズ、desktop/web bundle差、VSIX差を記録。許容性能/配布サイズの閾値はベースライン取得後、採用判断前に明文化し、後から結果に合わせて変えない。

## 6. 添付文書と不具合検証

ユーザー指定の/mnt/data/draft-art16-pld.docxはこのWindowsセッションに直接添付されていない。一方、ローカル過去調査の
`F:/Apps/vscode-office/investigation-issue7/draft-art16-pld.original.docx`
のSHA-256が
`593ac260236ebdc372e3456a24c12a63206769508c195c4f7c9aaf943a0656bf`
であることを今回再確認し、既存調査記録と一致した。今回Wordによる再試験はしていない。原稿、画像、全文XML、端末固有情報を公開しない。非公開入力は実行時の明示パスで読み、原本を上書きせず、CIの自動収集対象から除外する。

既存証跡:

- [PR #8](https://github.com/makotosan/vscode-office/pull/8)はマージ済み。表の重複grid/プロパティ順、SVG Content Type、互換設定を補正。
- [#8実機報告](https://github.com/makotosan/vscode-office/pull/8#issuecomment-6326393213)は修正コピーについて改善を報告。SVG表示、互換モード表示なし、保存済み表示が確認された。全候補/全環境の合格ではない。
- 既存文書は原稿が表1個・5行3列と記録する。「表のプロパティ1〜5」は5表という意味ではなく、各修復項目とXML欠陥の一対一対応は未確定。
- [PR #10](https://github.com/makotosan/vscode-office/pull/10)はDraftで未マージ。article16の一部対照がWord 16.106.1で改善しても、article18ではSVGのみ/元SVG+PNGプレビューがクラッシュし、PNG表示対照のみ問題なしとの報告。SDK 0エラーでもMac安全性を証明しない。SVG描画が優先候補であるが、特定XML要素やWord自身の不具合とは断定しない。
- #10の内部SVG名 .svg+xml/.svg の最小比較は別の変数として追跡。未検証修正をmainや全候補に混入しない。

切り分けは元DOCX、表だけ補正、SVG参照/Content Typeだけ補正、両方補正を用意。compatibilityModeだけ変える対照も別途作り、複数変数を同時に変えた結果から原因を断定しない。元Markdownを取得できれば各エンジンで再生成する。DOCX原本だけの場合、DOCX→HTMLの別変換を同一入力の比較に混ぜず、原本は不具合再現/パッケージ調査に使う。

Word Windows/macOSそれぞれでOS、CPU、Word版/build、フォント、入力/出力hash、画像モード、リンク更新条件を記録。作業コピーを開く→本文編集→上書き保存→再編集→2回目保存→閉じる→再オープンを行う。修復要求/表プロパティ修復、互換モード表示、表/画像/改ページ、クラッシュ有無は個別項目。macOS上のCIはWord実機試験ではない。保存バイトに追記が存在しても、保存操作の正常終了とは扱わない。

## 7. 結果レコードと合格条件

候補×fixture×画像モード×OS×段階(raw/後処理後/Word再保存後)で以下を記録する:

```text
runId, sourceRevision, engine/version/integrity, inputHash, outputHash
OS/CPU, Node, Chromium, Word/build, fonts, imageMode, schemaTarget
rawSchemaErrors, finalSchemaErrors, relationshipErrors, postprocessNames
repairPrompt, tableRepair, compatibilityLabel, layoutResult, save1, save2, reopen
elapsedGenerationMs, elapsedTotalMs, outputBytes, bundleBytes, vsixBytes
status = pass | fail | unsupported | not-run
evidencePaths, limitation, nextAction
```

SDK 3.3.0/.NET 8の既存検証器を再利用し、Office2013相当の基準とOffice2019 SVG拡張検証を区別して版を記録。document.xml、settings.xml、styles/numbering、全関連rels、Content Types、mediaを検査。XMLがwell-formedであるだけでは合格にしない。raw失敗も評価表に残す。最終生成物では構造/参照エラー0、修復0、意図しない互換モード0、Windows/Macの保存2回・再オープンでクラッシュ0、内容/表/画像の保持が必須。

画像モードは#2〜#5の契約を満たす。SVG linkedの制約は#4で明示判断し、無断PNG化しない。PDF/HTML/Markdown回帰、ライセンス/配布、性能・サイズ基準も満たした候補から採用する。未実施は合格に数えない。合格候補がなければ現行既定を維持し未解決点を報告する。

## 8. 既存Issueとの依存関係

| 番号 | 役割 | #11との関係 |
| --- | --- | --- |
| #1 | 生成/画像リンク方式調査 | 台帳・URI・OOXML境界を共有。PoC調査は並行可 |
| #2 | embedded/linked設定 | PoCはCLI先行可。製品統合#16までに設定伝播を完成 |
| #3 | PNG/JPEG外部リンク | #1/#2の契約を共有し候補ごとに関係参照を検証 |
| #4 | SVG linked互換性 | 独立した実機結論が必要。embeddedの結果を流用しない |
| #5 | 動的/data URI外部保存 | #3へ画像台帳で接続。PoCは固定PNG入力と実描画を区別 |
| #6 | 回帰/CI/VSIX | PoC合成検査を接続。最終リリースは画像仕様+#7+#9の受入が必要 |
| #7 | 修復/表/互換モード | #8の限定修正を基準に残存症状を評価。エンジン置換だけで閉じない |
| #8 | マージ済み修正PR | Issueではない。mainにある補正を保持し比較基準にする |
| #9 | Mac保存クラッシュ | #7とは独立の合格条件。#10の失敗例を回帰に含める |
| #10 | 未マージ調査PR | 証跡を参照。PoC設計の前提としてマージ/有効性を要求しない |

既存Issueは閉じず、置換対象として消費しない。#6のCI整備は早期着手可能、完了判定は実機受入後とし依存循環を避ける。

## 9. Codex向け実行順とPR運用

| サブIssue | 成果物/PR | 開始条件 |
| --- | --- | --- |
| #12 | 共通入力・台帳・ハーネス・legacy測定 | このADR、#1の調査と合流 |
| #13 | docx.jsアダプター | #12 |
| #14 | HTML-to-DOCX選定/アダプター | #12（#13とは別PR） |
| #15 | SDK/Word比較・採用ADR | #13+#14、#4/#7/#9と証跡共有 |
| #16 | 合格候補の製品統合 | #15で合格・採用判断、#2〜#5契約、#6リリース検証 |
| #17 | 旧経路撤去 | #16後の新VSIX実機受入完了、ロールバック記録 |

#12〜#15では既定を変更しない。#16の既定変更と#17の旧経路撤去は別PR。各PRは変更理由、raw/最終検証、実機証跡、未対応、ロールバックを記載。自動マージ/Issue自動closeはしない。本調査PRも#11をcloseしない。

今回の確認はソース/Issue/上流一次資料とローカル原本hash。PoCベンチマーク、SDK再実行、Word実機比較は未実施。次の実装単位は#12。
