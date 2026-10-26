# Pandoc追加試験（#11）

2026-10-26 JST。ユーザーの明示的な依頼で、当初のPandoc除外方針を今回の
追加試験に限り変更した。製品への採用や外部CLI依存追加は決定していない。

## 同一HTMLによる比較

公式Pandoc 3.12.1 Windowsポータブル版を使用。公開SHA-256とダウンロードを照合。
前回4候補へ渡した保存済みHTML・画像を読み、入力hashの一致を全10件で確認した。
Mermaid/KaTeXのPNGも再描画せず同じバイトを使用。
標準reference.docxにはページ寸法が省略されていたため、参照テンプレートに
A4（11906×16838twip）だけを設定し、出力XMLを後から修復していない。

| モード | 生成 | SDK Office2013/2019合格 | 独自構造エラー | 基本の本文/画像寸法差 | 改ページ欠落 | 未対応 |
| --- | --- | --- | --- | --- | --- | --- |
| embedded | 10/10 | 10/10（両条件） | 0 | 0 | 1 | 0 |
| linked | 8/10 | 8/8（両条件） | 0 | 0 | 1 | SVGの2入力 |

linkedのPNG/JPEGは他候補と同じ明示出現IDによるOOXML処理を使用した。
Pandoc標準機能だけで外部画像リンクを作れた、という意味ではない。
SVG linkedは#4の実機結論待ちで未対応とした。

SVGの元バイトは保持され、無断のPNG置換は行われなかった。
ただしrsvg-convertがない環境ではSVGのラスターfallback生成に警告が出る。
純粋SVG参照のSDK合格はMac版Wordの表示・保存安定性を保証しない。

`no-table`入力にある空の`div.page-break`は落ち、出力に明示改ページがなかった。
この欠落を検出する項目を共通ハーネスにも追加した。本文・画像寸法の基本検査が
一致しても、HTML/CSSの全再現性合格とはしない。表幅・罫線・フォント等の実機
表示差分も未受入。compatibilityModeは省略されており、Wordタイトルバーの
互換モード有無は別途確認する。

生成時間のfixture横断中央値はembedded約309ms、linked約302ms。
毎回CLI起動、版照会、参照テンプレート取得を含むため、既存JS候補の関数呼出し
時間とそのまま性能順位を比較しない。

合成データのみの証跡:
[測定JSON](../poc/docx-engines/measurements/pandoc-windows-node24.json)。
ローカルSDKは前回同様3.3.0/.NET5 overrideでframework警告あり。
CIでは固定版をハッシュ検証後、Windows/.NET8で同じ保存入力を再検証する。

## article18の非公開Markdownによる別診断

既存のarticle18 Markdownから直接Pandoc出力する別の対照ファイルも作成した。
これは同一HTMLの比較とは別経路であり、因果関係の証明に混ぜない。

- 表2個、画像2点を保持。SVG2点はMarkdownが参照する元ファイルと同一バイト。
- SDK Office2019でエラー0。ラスターfallback用rsvg-convert不在の警告あり。
- 出力SHA-256: `4938fc12d460e03deac4bc6fd98a710f6a6178ad89dbcc6d3d427ff312e2d126`。
- 診断コピー: `F:/Apps/vscode-office/investigation-issue9-art18/pandoc-3.12.1/article18-pandoc.docx`。
- 原稿・SVG・私的DOCX・全文はコミット/CI公開していない。原本を変更していない。

Windows/MacのWordで開く→編集/保存2回→閉じる→再オープンは未実施。
前回のWindows画面取得失敗とMac環境不在は解消していない。
今回の結果はPandocを追加調査する根拠にはなるが、#9の保存クラッシュ解消や
採用決定、既定変更の根拠としては不十分。

## 再実行

`PANDOC_BIN`を実行ファイルに設定する。通常の4候補比較は変えていない。

```sh
node run.cjs --engine=pandoc --fixture=table-five-rows
node evaluate.cjs --engineNames=pandoc --output=output/pandoc --preparedRoot=output/evaluation/attempt-1/legacy/embedded --validator=validator/bin/Release/net8.0/Validator.dll
```

Pandoc本体はPoCの無視対象`.tools/`にのみ置き、VSIXにも含めない。
ライセンス/配布要件と外部CLIの配置は、採用する場合に別途設計する。
