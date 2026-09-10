

## フェーズ0: 新フォーマットの確定

Y.Docの構造を「単一のYText」に決める必要がありますが、これは実は`scripts/migrate_pm_to_codemirror/main.go`が既に先取りして設計しています（`textFieldName = "content"`、1行=旧textblock 1つ分のテキストを`\n`区切りで連結）。これに合わせるのが一番手戻りが少ないです。

決めておきたいこと:
- YTextのルート名は`"content"`で固定（migrate scriptと一致させる）

## フェーズ1: バックエンド（`internal/serve`）

対象は`ydoc.go`と`lines.go`。

- **`ydoc.go`の`store()`**: `doc.GetXmlFragment("prosemirror").ToXML()`を`doc.GetText("content")`ベースの処理に置き換え。
- **`updatePreview` / `buildPreview`**: XML正規表現パースをやめて、プレーンテキストの行処理に書き換え。旧仕様は「先頭の`<heading>`を除外して残りの`<paragraph>`を`\n`結合、`descriptionMaxRunes`で切る」だったので、新仕様は「1行目（タイトル相当）を除いた残りの行を`\n`結合して切る」に単純化できます。
- **image抽出（`internal/xmldoc.FirstImageSrc`）**: `imageMarkdownPlugin`が無くなるとテキスト中に`<image>`ノードは存在しなくなるので、このフェーズでは呼び出しごと削除し、`image`フィールドの更新は一旦諦めます（TODOコメントで後回しを明記）。`internal/xmldoc`パッケージ自体は将来markdown画像記法を直接文字列から拾う形に作り直す前提で、いったん未使用のまま残すか消すか、これはお任せします。
- **`lines.go`のupdateLines呼び出し**: `store()`からの呼び出しを削除。ファイル自体・テストはそのまま残し、「CodeMirror移行後の行トラッキング設計待ち」であることをコメントで明記（前回議論したRelativePosition方式かLCS diff方式のどちらか）。
- タイトル解決API（`cards.go`, `slug.go`）はXMLに依存していないので**無変更**。ここは助かるポイントです。

`ydoc_test.go`の`buildPreview`系テストは新仕様に合わせて書き直しが必要です。

## フェーズ2: フロントエンド（`noteEditor`）

`package.json`:
- 追加: `codemirror`, `@codemirror/state`, `@codemirror/view`, `y-codemirror.next`
- 削除: `prosemirror-*`一式, `y-prosemirror`

`components/noteEditor/`配下で**削除**するファイル（ProseMirror Plugin APIに依存しており、CM6ではAPIが根本的に別物なので流用不可）:
- `schema.ts`
- `blockIdPlugin.ts`
- `emphasisRevealPlugin.ts`
- `forceFirstHeadingPlugin.ts`
- `imageMarkdownPlugin.ts`
- `linkClickPlugin.ts`
- `pasteUrlDecodePlugin.ts`
- `syntheticTransaction.ts`
- `urlLinkRule.ts`

**書き直す**もの:
- `titleCandidatePlugin.ts` → CM6の`ViewPlugin`/`updateListener`で「1行目のテキスト」を見るだけの最小版に作り直し。Enterコミット判定やdebounce(2000ms)のロジックは移植しますが、装飾は持たせません。これは「プラグイン」というより「カード作成に必須の配線」なので後回しにできないと考えています。
- `index.tsx` → `EditorState`/`EditorView`を`ytext`ベースで組み直し。`yCollab`拡張（`y-codemirror.next`）をバインド。`initialTitle`の挿入は`ytext.insert(0, ...)`に、"Untitled"埋めも同様にYText直接操作に置き換え。ProseMirrorの`markSynthetic`相当は、Yjsには無いので「挿入中はフラグを立ててcandidate発火を抑制する」形に作り直します。

`yCollab`はYjs自身のUndoManagerを使うため、CM6標準の`history()`拡張は入れない（二重undo防止）点だけ注意が必要です。

## フェーズ3: 動作確認
- ドラフト作成 → 1行目確定 → `/api/admin/cards`でカード作成 → WebSocket同期 → サーバ側`buildPreview`でdescription生成、という一連の流れがCardListの一覧に反映されることを確認。


