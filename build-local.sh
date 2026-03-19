#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

PYTHON_CMD="${RABBITHOLE_PYTHON_CMD:-python3}"

echo "Syncing backend dependencies..."
(cd backend && UV_PYTHON="$PYTHON_CMD" uv sync)

echo "Building frontend..."
(cd client && NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:8000/api}" pnpm build)

echo "Build complete."
