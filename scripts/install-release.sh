#!/bin/sh
set -eu

APP_NAME="rabbithole"
REPO_SLUG="${RABBITHOLE_REPO:-sideDesert/rabbithole}"
INSTALL_ROOT="${RABBITHOLE_INSTALL_ROOT:-$HOME/.local/share/$APP_NAME}"
BIN_DIR="${RABBITHOLE_BIN_DIR:-$HOME/.local/bin}"
ARCHIVE_PATH="${RABBITHOLE_RELEASE_ARCHIVE:-}"
RELEASE_TAG="${RABBITHOLE_RELEASE_TAG:-}"
CONFIG_SOURCE="${RABBITHOLE_CONFIG_SOURCE:-}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

fetch_latest_tag() {
  curl -fsSL "https://api.github.com/repos/$REPO_SLUG/releases/latest" \
    | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -n 1
}

download_archive() {
  tag="$1"
  archive_name="$APP_NAME-$tag.tar.gz"
  url="https://github.com/$REPO_SLUG/releases/download/$tag/$archive_name"
  curl -fsSL "$url" -o "$TMP_DIR/$archive_name"
  printf '%s\n' "$TMP_DIR/$archive_name"
}

require_cmd sh
require_cmd curl
require_cmd tar
require_cmd mktemp

if [ -n "$ARCHIVE_PATH" ]; then
  archive_file="$ARCHIVE_PATH"
else
  if [ -z "$RELEASE_TAG" ]; then
    RELEASE_TAG="$(fetch_latest_tag)"
  fi
  if [ -z "$RELEASE_TAG" ]; then
    echo "Unable to determine latest release tag for $REPO_SLUG" >&2
    exit 1
  fi
  archive_file="$(download_archive "$RELEASE_TAG")"
fi

mkdir -p "$INSTALL_ROOT"
rm -rf "$INSTALL_ROOT/app"
mkdir -p "$INSTALL_ROOT/app"
tar -xzf "$archive_file" -C "$INSTALL_ROOT/app" --strip-components=1

if [ -n "$CONFIG_SOURCE" ]; then
  cp "$CONFIG_SOURCE" "$INSTALL_ROOT/app/backend/config.json"
fi

(
  cd "$INSTALL_ROOT/app"
  RABBITHOLE_BIN_DIR="$BIN_DIR" \
  RABBITHOLE_PYTHON_CMD="${RABBITHOLE_PYTHON_CMD:-python3}" \
  RABBITHOLE_SKIP_SETUP="${RABBITHOLE_SKIP_SETUP:-0}" \
  RABBITHOLE_SKIP_PREREQ_CHECKS="${RABBITHOLE_SKIP_PREREQ_CHECKS:-0}" \
  RABBITHOLE_SKIP_DEP_INSTALL="${RABBITHOLE_SKIP_DEP_INSTALL:-0}" \
  RABBITHOLE_SKIP_FRONTEND_BUILD="${RABBITHOLE_SKIP_FRONTEND_BUILD:-0}" \
  sh ./install.sh
)

echo ""
echo "$APP_NAME installed to $INSTALL_ROOT/app"
echo "Launcher path: $BIN_DIR/$APP_NAME"
