# Overview

- このプロジェクトの目的は、汎用的なカード箱を作ることです。
 Cardexは、SPA＋CSRの個人・チーム向けのアプリです。

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
- Tailwindを使っている。marginのような外側レイアウトに影響を及ぼすスタイルは親コンポーネントから使うようにする。

## Tech Stack

- backend: Go + PocketBase **v0.39+**
- frontend: solid.js + **tailwind v4**


## Work in progress

