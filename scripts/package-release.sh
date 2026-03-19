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

copy_path() {
  src="$1"
  dest="$2"
  parent_dir="$(dirname "$dest")"
  mkdir -p "$parent_dir"
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

echo "Preparing release staging directory..."

copy_path "$ROOT_DIR/backend" "$STAGING_DIR/"
copy_path "$ROOT_DIR/client" "$STAGING_DIR/"
copy_path "$ROOT_DIR/scripts/setup_local.py" "$STAGING_DIR/scripts/"
copy_path "$ROOT_DIR/install.sh" "$STAGING_DIR/"
copy_path "$ROOT_DIR/build-local.sh" "$STAGING_DIR/"
copy_path "$ROOT_DIR/run-local.sh" "$STAGING_DIR/"
copy_path "$ROOT_DIR/README.md" "$STAGING_DIR/"
copy_path "$ROOT_DIR/LICENSE" "$STAGING_DIR/"
copy_path "$ROOT_DIR/package.json" "$STAGING_DIR/"

rm -f "$ARCHIVE_PATH"
echo "Creating release archive..."
tar -czf "$ARCHIVE_PATH" -C "$DIST_DIR" "$APP_NAME-$VERSION"

echo "Created release archive:"
echo "$ARCHIVE_PATH"
