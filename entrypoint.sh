#!/usr/bin/env bash
set -e

if [ -d "/certs" ] && [ "$(ls -A /certs/*.crt 2>/dev/null)" ]; then
  cp /certs/*.crt /usr/local/share/ca-certificates/
  update-ca-certificates
fi

# Bootstrap: create the first superuser only on the very first startup.
# "pb_data/data.db" only exists once PocketBase has run at least once,
# so its absence means this is a fresh volume. Skipping "create" once
# it exists avoids "email: Value must be unique" on every restart,
# without resorting to "upsert", which would silently reset any
# password the user has since changed via the UI.
# Throwaway credential meant to be rotated via the UI right after first login.
ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL:-admin@mail.internal}"
ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-password}"
DATA_DIR="${MYAPP_DATA_DIR:-pb_data}"

if [ ! -f "$DATA_DIR/data.db" ]; then
  su-exec myapp:myapp myapp superuser create "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
fi

exec su-exec myapp:myapp "$@"
