#!/usr/bin/env bash
# Idempotent repository bootstrap for the Splitwiser Cloud Agent environment.
# Installs PostgreSQL (system dep), initializes a local cluster, installs npm
# deps, writes a dev .env.local, and applies Drizzle migrations.
set -euo pipefail

cd "$(dirname "$0")/.."

PGDATA="${SPLITWISER_PGDATA:-$HOME/.splitwiser/pgdata}"
PGPORT=5432
PGDB=splitwiser
PGUSER=postgres

# 1. System dependency: PostgreSQL server + client.
if ! ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql postgresql-contrib
fi
PG_BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"

# 2. Initialize a local cluster (idempotent). Uses trust auth for local dev.
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  "$PG_BIN/initdb" -D "$PGDATA" -U "$PGUSER" \
    --auth-local trust --auth-host trust -E UTF8 >/dev/null
  {
    echo "unix_socket_directories = '/tmp'"
    echo "listen_addresses = 'localhost'"
    echo "port = $PGPORT"
  } >> "$PGDATA/postgresql.conf"
fi

# 3. Start the server if it is not already accepting connections.
if ! "$PG_BIN/pg_isready" -h /tmp -p "$PGPORT" >/dev/null 2>&1; then
  # Remove a stale pid file left over from a previous boot / snapshot.
  rm -f "$PGDATA/postmaster.pid"
  "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k /tmp" \
    -l "$PGDATA/server.log" -w start
fi
for _ in $(seq 1 30); do
  "$PG_BIN/pg_isready" -h /tmp -p "$PGPORT" >/dev/null 2>&1 && break
  sleep 1
done

# 4. Create the application database (idempotent).
if ! "$PG_BIN/psql" -h /tmp -p "$PGPORT" -U "$PGUSER" -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$PGDB'" | grep -q 1; then
  "$PG_BIN/psql" -h /tmp -p "$PGPORT" -U "$PGUSER" -c "CREATE DATABASE $PGDB"
fi

# 5. Node dependencies.
npm ci

# 6. Local dev environment file (git-ignored). Only written if missing so a
#    user-provided .env.local (e.g. real Google OAuth creds) is preserved.
if [ ! -f .env.local ]; then
  DB_URL="postgresql://$PGUSER@localhost:$PGPORT/$PGDB"
  cat > .env.local <<EOF
# Auto-generated for local Cloud Agent development.
DATABASE_URL=$DB_URL
DATABASE_URL_UNPOOLED=$DB_URL
AUTH_SECRET=$(openssl rand -base64 32)
# Google OAuth is optional for local dev; sign-in requires real credentials.
AUTH_GOOGLE_ID=${AUTH_GOOGLE_ID:-}
AUTH_GOOGLE_SECRET=${AUTH_GOOGLE_SECRET:-}
# Gemini receipt parsing (optional).
GOOGLE_API_KEY=${GOOGLE_API_KEY:-}
EOF
fi

# 7. Apply database migrations.
npm run db:migrate

echo "Splitwiser environment ready."
