#!/bin/sh
set -eu

BOOTSTRAP_URL="https://raw.githubusercontent.com/sideDesert/rabbithole/main/scripts/install-release.sh"

if ! command -v curl >/dev/null 2>&1; then
  echo "Missing required command: curl" >&2
  exit 1
fi

tmp_script="$(mktemp)"
cleanup() {
  rm -f "$tmp_script"
}
trap cleanup EXIT INT TERM

curl -fsSL "$BOOTSTRAP_URL" -o "$tmp_script"
sh "$tmp_script" "$@"
