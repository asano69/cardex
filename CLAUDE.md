# Overview

- このプロジェクトの目的は、汎用的なカード箱を作ることです。
- Cardexは、SPA＋CSRの個人・チーム向けのWiki兼カード型DBです。

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


