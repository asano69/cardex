### 1. CodeMirror移行の妥当性そのもの
- 現状の`emphasisRevealPlugin.ts`は、ProseMirrorの「markベースの表現」と「テキストベースの見た目（`*text*`のようなdelimiter）」の二重化を無理やり橋渡ししており、これ自体が「PM上でテキストエディタ的UXを再現しようとした歪み」の証拠になっている。
- Scrapbox風bracket linkもObsidian的なlive previewも、本質的にはplain textを前提にした構文なので、CodeMirrorの設計思想と自然に合致する。
- ツールバー前提かどうかは、ProseMirror自体の制約ではなくエコシステムの慣習の話にすぎず、大きな論点ではない。

### 2. 移行コストの内訳（4項目）
| 項目 | 見通し |
|---|---|
| 行の安定ID（`blockIdPlugin.ts` + `card_lines`） | 最大のリスク要因 → 後述の通り解決策あり |
| テーブル編集 | CM6に標準の等価物なし。markdown生テキストで妥協するか使用頻度次第で後回し |
| 画像 | **むしろ単純化する**。markdown文字列のままなら変換ステップも`internal/xmldoc`も不要、正規表現で直接`src`を取れる |
| Yjsバインディングの成熟度（`y-codemirror.next`） | `y-prosemirror`ほどの実績はないが、実装自体はYjs標準機能の薄いラッパーなので大きな懸念ではない |

### 3. 行の安定ID問題：核心の発見
- **CodeMirror自体はこの問題を解決していない**（作者Marijn本人がフォーラムで明言：コア機能化の予定なし、プラグインで作るのも簡単ではない）。
- 真の解決策は**Yjs（CRDT）自体が持つ`RelativePosition`機構**：
  - 各文字挿入は元々`Item{Client, Clock}`という一意IDを持つ
  - `RelativePosition`はそのIDへの参照であり、他ユーザーの同時編集があっても「意味的に同じ位置」を指し続ける
  - **UUIDを自前で発行・管理する必要が最初からない**＝`blockIdPlugin.ts`相当の仕組みが丸ごと不要になる
- Go版実装`reearth/ygo`も対応するAPI（`CreateRelativePositionFromIndex` / `ToAbsolutePosition` / `EncodeRelativePosition` / `DecodeRelativePosition`）を実装済みであることを確認。JSの`Y.createRelativePositionFromTypeIndex`等とほぼ1対1対応。
- 興味深い点として、この機構自体は**CodeMirror固有ではない**（`y-prosemirror`側にも同等のAPIがあるはず）ため、理論上は現状のProseMirror構成のままでも導入可能——CodeMirror移行の必須条件ではなく、独立した改善として検討できる。

### 4. RelativePosition方式そのものの限界（ユーザー指摘・重要な反論）
- `RelativePosition`は「一括解決」がなく、1アンカーずつdocに対して解決するコストがかかる（行数が少なければ問題にならない）。
- より本質的な懸念：**行を丸ごと削除するとアンカー自体が消え、識別情報を失う**。これは「行削除ならcard_linesからも消えて当然」という点では望ましい挙動とも言えるが、実装の複雑さ（bulk解決API不在、assocの向きの設計判断が必要など）は残る。

### 5. 対案として浮上した「行内容ベースのdiff（LCS）方式」
- 位置固定キー（`position`）方式は「途中に1行挿入すると、それ以降の全行が別内容として誤判定され`updated`が意図せず動く」という具体的な欠陥がある。
- 代替として、保存済み行リストと今回の行リストを**内容ハッシュでLCS diff**し、
  - LCSに含まれる行＝内容不変とみなし`updated`を保持したままpositionだけ更新
  - LCSに含まれない古い行＝削除
  - LCSに含まれない新しい行＝新規作成
  という方式が提案された。
- この方式の利点：
  - 永続ID（UUIDでもRelativePositionでも）が一切不要
  - 挿入・削除・並べ替えに対して`updated`が正しく保持される
  - 実装量がUUID方式より減る
- 欠点：同一内容の行が複数ある場合（空行の連続など）の曖昧性は残るが、LCS系アルゴリズムは位置的近さを優先してマッチする性質があるため実用上大きく破綻しにくい。
- 行数はカード1枚あたり数百程度想定なので、LCSの計算コスト（O(n·d)程度）も問題にならない。

### 6. 現時点での分岐点
行の識別方式について、**RelativePosition方式**（CRDTネイティブ、削除検出が自然だが一括解決コスト・assoc設計の検討が必要）と、**LCS diff方式**（永続ID不要でよりシンプル、挿入時の`updated`誤爆を根本的に防げる）という2つの有力な選択肢が出そろった状態。どちらを採用するか、あるいは組み合わせるかがまだ決まっていない。
