#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ARTIFACTS_DIR="$ROOT_DIR/artifacts"

BACKEND_HOST="${FLOWDESK_BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${FLOWDESK_BACKEND_PORT:-8000}"
FRONTEND_HOST="${FLOWDESK_FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FLOWDESK_FRONTEND_PORT:-5173}"
DB_PATH="${FLOWDESK_DB_PATH:-$ARTIFACTS_DIR/flowdesk.db}"
BACKEND_PROXY_HOST="${FLOWDESK_BACKEND_PROXY_HOST:-127.0.0.1}"

export FLOWDESK_DATABASE_URL="${FLOWDESK_DATABASE_URL:-sqlite:///$DB_PATH}"
export VITE_BACKEND_ORIGIN="${VITE_BACKEND_ORIGIN:-http://$BACKEND_PROXY_HOST:$BACKEND_PORT}"

BACKEND_PID=""
FRONTEND_PID=""

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  wait "$FRONTEND_PID" "$BACKEND_PID" >/dev/null 2>&1 || true
}

wait_for_url() {
  local label="$1"
  local url="$2"
  local pid="$3"

  for _ in {1..80}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "$label stopped before it became ready." >&2
      wait "$pid" || true
      return 1
    fi
    sleep 0.25
  done

  echo "Timed out waiting for $label at $url" >&2
  return 1
}

port_is_listening() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltn | awk 'NR > 1 {print $4}' | grep -Eq ":${port}$"
    return
  fi

  (echo >"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
}

need_command uv
need_command npm
need_command curl

mkdir -p "$ARTIFACTS_DIR" "$(dirname "$DB_PATH")"

echo "Flow Desk dev startup"
echo "Database: $FLOWDESK_DATABASE_URL"
echo "Backend:  http://$BACKEND_HOST:$BACKEND_PORT"
echo "Frontend: http://$FRONTEND_HOST:$FRONTEND_PORT"

if port_is_listening "$BACKEND_PORT"; then
  echo "Backend port $BACKEND_PORT is already in use. Stop the existing service or set FLOWDESK_BACKEND_PORT." >&2
  exit 1
fi

if port_is_listening "$FRONTEND_PORT"; then
  echo "Frontend port $FRONTEND_PORT is already in use. Stop the existing service or set FLOWDESK_FRONTEND_PORT." >&2
  exit 1
fi

if [[ "${FLOWDESK_SKIP_INSTALL:-0}" != "1" ]]; then
  echo
  echo "Syncing backend dependencies..."
  (cd "$BACKEND_DIR" && uv sync)

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo
    echo "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
fi

echo
echo "Applying database migrations..."
(cd "$BACKEND_DIR" && uv run alembic upgrade head)

trap cleanup EXIT INT TERM

echo
echo "Starting backend..."
(
  cd "$BACKEND_DIR"
  uv run uvicorn flowdesk.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload
) &
BACKEND_PID="$!"

wait_for_url "backend" "http://$BACKEND_PROXY_HOST:$BACKEND_PORT/api/healthz" "$BACKEND_PID"

echo
echo "Starting frontend..."
(
  cd "$FRONTEND_DIR"
  npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort
) &
FRONTEND_PID="$!"

wait_for_url "frontend" "http://$FRONTEND_HOST:$FRONTEND_PORT/" "$FRONTEND_PID"

cat <<EOF

Flow Desk is running.

Open:    http://$FRONTEND_HOST:$FRONTEND_PORT/
Backend: http://$BACKEND_PROXY_HOST:$BACKEND_PORT/api/healthz

Press Ctrl+C to stop both services.
EOF

wait -n "$BACKEND_PID" "$FRONTEND_PID"
