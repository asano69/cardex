実際にPM(ProseMirror) JSON ⇔ Yjs の変換をしているのは **ProseKit自身ではなく `y-prosemirror`** というライブラリです。ProseKitはエディタのUI/拡張の面倒を見るだけで、Yjs連携は`NoteEditor/index.tsx`で`ySyncPlugin(fragment)`を差し込んでいるだけ（`y-prosemirror`をそのまま利用）でした。実物のtarballを取得して中身を確認したので、場所と仕組みをまとめます。

## どこにあるか

- パッケージ: `y-prosemirror`（`frontend/bun.lock`に `y-prosemirror@1.3.7` として固定されています）
- GitHub: `yjs/y-prosemirror`
- 本体のパス（npm配布物内）:
  - `src/plugins/sync-plugin.js` … **実際の変換ロジック**（PMノード⇔`Y.XmlElement`/`Y.XmlText`）
  - `src/lib.js` … 変換の入口となる高レベルAPI（`Y.XmlFragment`全体⇔PMの`doc` JSON）
  - `src/utils.js` … mark⇔XML属性の変換ヘルパー

## マッピングの実体（`sync-plugin.js`）

**PM → Yjs**（`createTypeFromElementNode` / `createTypeFromTextNodes`）:
- PMの要素ノード1つにつき `new Y.XmlElement(node.type.name)` を作る。`nodeName`はそのままPMの`node.type.name`（`"paragraph"`, `"heading"`など）。
- `node.attrs` はそのまま `Y.XmlElement` の属性としてセットされる（`ychange`だけは除外）。
- 連続するテキストノード列は1つの `Y.XmlText` にまとめられ、`node.marks`（bold/italic等）は `marksToAttributes` を介して `Y.Text` の delta 側の `attributes`（インラインフォーマット）として埋め込まれる（XML属性ではない）。

**Yjs → PM**（`createNodeFromYElement` / `createTextNodesFromYText`）:
- `Y.XmlElement` を再帰的にたどり、`schema.node(el.nodeName, attrs, children)` でPMノードを再構築。
- `Y.XmlText` は `toDelta()` の各deltaを `schema.text(insert, attributesToMarks(...))` に変換し、フォーマット属性をPMの `marks` に戻す。

## `lib.js` 側（フラグメント全体の変換）
`yXmlFragmentToProsemirrorJSON` / `prosemirrorJSONToYXmlFragment` などが、`Y.XmlFragment`全体とPMの`doc` JSON全体を相互変換する入口です（内部で上記の`sync-plugin.js`の関数を使う）。

