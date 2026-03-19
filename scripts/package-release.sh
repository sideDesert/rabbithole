#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
VERSION="${1:-$(git describe --tags --always 2>/dev/null || echo dev)}"
APP_NAME="rabbithole"
STAGING_DIR="$DIST_DIR/$APP_NAME-$VERSION"
ARCHIVE_PATH="$DIST_DIR/$APP_NAME-$VERSION.tar.gz"

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
mkdir -p "$DIST_DIR"

copy_tree() {
  src="$1"
  dest="$2"
  mkdir -p "$(dirname "$dest")"
  rsync -a \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'venv' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.DS_Store' \
    --exclude 'dist' \
    --exclude 'backend/config.json' \
    "$src" "$dest"
}

copy_tree "$ROOT_DIR/" "$STAGING_DIR/"

rm -f "$ARCHIVE_PATH"
tar -czf "$ARCHIVE_PATH" -C "$DIST_DIR" "$APP_NAME-$VERSION"

echo "Created release archive:"
echo "$ARCHIVE_PATH"
