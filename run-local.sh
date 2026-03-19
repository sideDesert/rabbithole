#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

if [ ! -f backend/config.json ]; then
  echo "Missing backend/config.json. Run: sh ./install.sh" >&2
  exit 1
fi

if [ ! -d client/.next ]; then
  echo "Missing client build output. Running local build first..."
  sh ./build-local.sh
fi

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "${FRONTEND_PID:-}" ]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT ..."
(cd backend && uv run uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT") &
BACKEND_PID=$!

echo "Starting frontend on http://$FRONTEND_HOST:$FRONTEND_PORT ..."
(cd client && pnpm exec next start --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
