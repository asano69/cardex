# Overview

- Cardpotは、組織ではなく個人にフォーカスしており、個人が最も快適に使えるカード型Wikiです。
- Cardpotは、汎用的なカード型ナレッジベースであり、多様な用途で使えます。
- Cardpotは、個人での快適な活用を最重要視していますが、小規模なチーム（2~20人）での活用もスコープに含まれます。
    - 大規模グループで使えない理由は、DBにSQLiteを使っているためです。そのような場合は、他のアプリを探したほうが良いでしょう。
- Cardpotは、以前Cardexと呼んでいましたが、名前を変えました。

## Rules

- 後方互換性は維持しなくてよい。
- データベースのマイグレーションはPocketBaseのWEB UIから行うのでマイグレーションコードを作成する必要はない。
- When fixing bugs, add a failing regression test first.
- All errors are user-facing, so messages should be clear.
- Keep functions small and focused.
- Module files should re-export what's needed, hide implementation details.
- 変更内容を Codex形式(Search/Replace形式)で出力してください。
例）
```
mathweb/flask/app.py
<<<<<<< SEARCH
from flask import Flask
=======
import math
from flask import Flask
>>>>>>> REPLACE
```
- ファイルを削除・移動するときや、変更が非常に大きい場合はSearch/Replace形式は非効率なので、rm・mvコマンド・必要に応じて全文ファイルとして出力してください
- Tailwindを使っており、marginのような親/兄弟レイアウトに影響を及ぼすスタイルは親コンポーネントから使うようにするべき。
- jsxにおいて、return の先頭にコメント（{/*...*/} ）を置く場合は Fragment （<>...</>）で囲まなければならない。


## Tech Stack
### backend
- Go
- PocketBase v0.39+
- reearth/ygo v1.49.5
- blevesearch/bleve

### frontend
- Solid.js v1.9
- Kobalte v0.13+
- Tailwind v4
- clauderic/dnd-kit v0.5.0
- ProseKit (ProseMirror)
- yjs


## Work in progress



