# Cardex: ノート編集のリアルタイム同期化 設計計画

## 1. 目的

`NoteEditor`の自動保存を、現状の「全文を毎回PocketBaseに送信」する方式から、
CRDT（Yjs）ベースの差分同期に置き換える。将来的な複数人コラボレーションを見据えつつ、
今回のスコープでは以下を実現する：

- 編集のたびに全文を送信しない（差分updateのみをやり取り）
- サーバー再起動やクラッシュに対して頑健（Y.Docバイナリを永続化）
- リアルタイム編集のレイテンシを損なわない（永続化は非同期・定期処理）

## 2. 全体アーキテクチャ

```
[ブラウザ: prosekit + yjs拡張]
        │ WebSocket (Yjs sync protocol / updates)
        ▼
[Goプロセス: WSハンドラ]
        │
        ▼
[ルームマネージャ: map[cardID]*Room]  ← プロセス内メモリ、単一プロセス構成なので
        │                                Redis等の外部共有ストアは不要
        ├─ Room.YDoc (ygoによるインメモリCRDT状態)
        └─ Room.Clients (接続中のWSクライアント一覧)
        │
        ▼ (30秒毎 or 全員切断時、dirtyな場合のみ)
[スナップショットライター]
        │
        ▼
[PocketBase "cards" コレクション]
   ├─ content: json  (既存、人間可読なProseKit doc。プレビュー表示等に使用)
   └─ ydoc:    file   (新規、Y.Docバイナリのスナップショット。常に最新1個で上書き)
```

デプロイ構成は単一Dockerコンテナ・単一プロセス前提のため、複数インスタンス間の
状態共有（Redis等）は今回不要と判断（別途確認済み）。

## 3. データモデルの変更

`cards`コレクションに`ydoc`フィールド（`file`型、単一ファイル）を追加する。

- `content`（JSON）: 引き続き人間可読な現在のドキュメント内容。`CardItem.tsx`のプレビュー等はこれを読む。
- `ydoc`（file）: Y.Docバイナリのスナップショット。履歴は持たず、常に最新の1ファイルで上書き。
  PocketBaseのfileフィールドは実体をディスク上の別ファイルとして管理するため、
  レコード自体の読み込み（一覧取得など）にバイナリの重さが影響しない。

両フィールドは**同一の`Update()`呼び出し内で同時に更新**し、片方だけ書き込まれる不整合を防ぐ。

## 4. ライフサイクル

### 4.1 カードを開いたとき（クライアント視点）

1. WebSocket接続を開始し、対象カードのルームに参加を要求する。
2. サーバー側でルームが存在しなければ新規作成する：
   - `ydoc`ファイルが存在する場合 → それをロードしてY.Docを復元。
   - 存在しない場合（移行前の既存カード、またはydoc未生成の初回）
     → クライアント（prosekitのyjs拡張）が現在の`content`(JSON)から初期Y.Docを
       構築し、最初の同期アップデートとしてサーバーに送信する。
       **Go側はここでスキーマを意識した変換を一切行わない**（受け取ったupdateを
       そのままygoのY.Docに適用するだけ）。
3. 以降、同じカードを開いている複数クライアント（タブ／デバイス）は同一ルームを共有し、
   差分updateをブロードキャストし合う。

### 4.2 永続化（スナップショット）

- 自前のdirtyフラグ・tickerは持たない。ygoの`Server.PersistCoalesceWindow`/
  `PersistCoalesceMaxWait`（デフォルト: 2秒でまとめて、最大10秒ごとに強制flush）
  がroom単位で自動的にデバウンスしてくれるため、`PersistenceAdapter.StoreUpdate`
  （およびそのcontext版`StoreUpdateContext`）はそのまま「今のroomの状態を保存する」
  処理を書くだけでよい。
- 保存のたびにY.Docの現在状態を`ydoc`へバイナリのままエンコードして書き込む
  （前回保存分とバイト列が同じ場合はスキップし、無駄な`updated`更新を避ける）。
- 最後のクライアントが切断した瞬間のflushは、ygo自身の
  "durable flush-before-evict"（room eviction前の保存保証）に任せる。

### 4.3 メモリ上のY.Doc解放

- 全員切断後、直後にルームをメモリから解放する（`Server.RoomIdleTimeout`は
  デフォルト0＝即時解放）。解放前に必ずflushされる（ygoの
  durable flush-before-evict）ため、バイナリを失う心配はない。次に誰かが開いた
  際は`ydoc`ファイルから再ロードされる。
- 再接続に備えて多少ディレイを入れたい場合は、`Server.RoomIdleTimeout` /
  `MaxResidentRooms`を設定すれば自前の実装なしで実現できる（現時点では未設定 =
  即時解放のまま）。

## 5. WebSocketエンドポイント

- 既存の`/api/admin`グループと同様、認証済みルートとして追加する想定
  （既存の`RequireSuperuserAuth`相当のチェックをハンドシェイク時に行う）。
- 実装は`internal/serve/handler.go`の既存ルート登録パターンに乗せる。

## 6. 今回のスコープ外（将来対応）

- 複数プロセス／複数インスタンスでの水平分散、およびそれに伴うRedis等の導入
- Awareness（カーソル共有・プレゼンス表示）
- トゥームストーンのGC・スナップショット圧縮
  （Y.Docがカードの生涯にわたって正のデータであり続けるため、編集を重ねるほど
  削除済み要素が蓄積しうる。個人用途の規模では当面問題にならない想定だが、
  将来的にygoのsnapshot/GC機能を使って刈り込む余地を残しておく）

## 7. 未検証・要確認事項

- prosekitのyjs拡張が実際に「JSON → 初期Y.Doc構築」をクライアント側で
  どう提供しているか（API仕様の確認が必要）。
- PocketBaseの`file`フィールド更新をygoのデフォルトcoalesce間隔（2〜10秒）で
  行う際のディスクI/O・フックのオーバーヘッドが実運用で問題にならないか。
- `app.OnTerminate()`のイベント型（`core.TerminateEvent`という想定で実装した）
  が、vendoringしているPocketBaseのバージョンと一致しているかの確認
  （`go doc github.com/pocketbase/pocketbase/core App.OnTerminate`で要確認）。

## 8. ざっくりとした実装タスク分解

1. `cards`コレクションに`ydoc`（file）フィールドを追加（PocketBase管理画面から）
2. Goバックエンド: ygoを導入し、ルームマネージャ（`map[cardID]*Room`）を実装
3. Goバックエンド: WSハンドラを`internal/serve`に追加し、sync protocolを配線
4. Goバックエンド: スナップショットライター（30秒ticker、dirty判定、即時flush）を実装
5. フロントエンド: `NoteEditor`にprosekitのyjs拡張を組み込み、WS接続を張る
6. フロントエンド: 既存カードを開いた際の「JSONからの初期Y.Doc構築」処理を実装
7. 動作確認: 複数タブ・複数デバイスでの同時編集、サーバー再起動後の復元
