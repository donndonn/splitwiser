#!/usr/bin/env bash
# Per-boot startup: ensure the local PostgreSQL server is running.
# Idempotent and safe to run on every environment start.
set -euo pipefail

PGDATA="${SPLITWISER_PGDATA:-$HOME/.splitwiser/pgdata}"
PGPORT=5432

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "PostgreSQL data dir missing at $PGDATA; run .cursor/install.sh first." >&2
  exit 1
fi

if ! "$PG_BIN/pg_isready" -h /tmp -p "$PGPORT" >/dev/null 2>&1; then
  "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k /tmp" \
    -l "$PGDATA/server.log" -w start
fi

"$PG_BIN/pg_isready" -h /tmp -p "$PGPORT"
