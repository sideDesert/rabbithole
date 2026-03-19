#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

APP_NAME="rabbithole"
INSTALL_BIN_DIR="${RABBITHOLE_BIN_DIR:-$HOME/.local/bin}"
INSTALL_LAUNCHER="${RABBITHOLE_INSTALL_LAUNCHER:-1}"
PYTHON_CMD="${RABBITHOLE_PYTHON_CMD:-python3}"
SKIP_PREREQ_CHECKS="${RABBITHOLE_SKIP_PREREQ_CHECKS:-0}"
SKIP_DEP_INSTALL="${RABBITHOLE_SKIP_DEP_INSTALL:-0}"
SKIP_FRONTEND_BUILD="${RABBITHOLE_SKIP_FRONTEND_BUILD:-0}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_python_version() {
  "$PYTHON_CMD" - <<'PY'
import sys
required = (3, 12)
if sys.version_info < required:
    raise SystemExit(
        f"{sys.executable} must be Python {required[0]}.{required[1]}+; found "
        f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    )
PY
}

require_node_version() {
  node - <<'JS'
const major = Number(process.versions.node.split(".")[0] || "0");
if (major < 20) {
  console.error(`node 20+ is required; found ${process.versions.node}`);
  process.exit(1);
}
JS
}

install_launcher() {
  mkdir -p "$INSTALL_BIN_DIR"
  cat >"$INSTALL_BIN_DIR/$APP_NAME" <<EOF
#!/bin/sh
set -eu
APP_DIR="$ROOT_DIR"
exec sh "\$APP_DIR/run-local.sh" "\$@"
EOF
  chmod +x "$INSTALL_BIN_DIR/$APP_NAME"
}

if [ "$SKIP_PREREQ_CHECKS" != "1" ]; then
  require_cmd "$PYTHON_CMD"
  require_python_version
  require_cmd node
  require_node_version
  require_cmd pnpm
  require_cmd uv
fi

if [ "${RABBITHOLE_SKIP_SETUP:-0}" = "1" ]; then
  if [ ! -f "$ROOT_DIR/backend/config.json" ]; then
    echo "RABBITHOLE_SKIP_SETUP=1 requires backend/config.json to already exist." >&2
    exit 1
  fi
else
  "$PYTHON_CMD" ./scripts/setup_local.py
fi

if [ "$SKIP_DEP_INSTALL" != "1" ]; then
  echo "Installing backend dependencies..."
  (cd backend && UV_PYTHON="$PYTHON_CMD" uv sync)

  echo "Installing frontend dependencies..."
  (cd client && pnpm install)
fi

if [ "$SKIP_FRONTEND_BUILD" != "1" ]; then
  echo "Building frontend..."
  (cd client && NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:8000/api}" pnpm build)
fi

if [ "$INSTALL_LAUNCHER" = "1" ]; then
  install_launcher
fi

echo ""
echo "Local install complete."
echo "Run the app with: sh ./run-local.sh"
if [ "$INSTALL_LAUNCHER" = "1" ]; then
  echo "Launcher installed at: $INSTALL_BIN_DIR/$APP_NAME"
  echo "If $INSTALL_BIN_DIR is on your PATH, you can run: $APP_NAME"
fi
