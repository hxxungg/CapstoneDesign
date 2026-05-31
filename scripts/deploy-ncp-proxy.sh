#!/usr/bin/env bash
# NCP(101.79.18.104)에 ai_service 프록시 배포·실행
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AI_DIR="$ROOT/ai_service"
ENV_FILE="$AI_DIR/.env"
ENV_NCP="$AI_DIR/.env.ncp"

if [[ ! -f "$ENV_NCP" ]]; then
  echo "missing $ENV_NCP" >&2
  exit 1
fi

cp "$ENV_NCP" "$ENV_FILE"
cd "$AI_DIR"

python3 -m pip install -q -r requirements.txt

if pgrep -f "python.*app.py" >/dev/null 2>&1; then
  echo "Stopping existing ai_service..."
  pkill -f "python.*app.py" || true
  sleep 1
fi

nohup python3 app.py > /var/log/capstone-ai-proxy.log 2>&1 &
sleep 2

if curl -sf http://127.0.0.1:8001/health >/dev/null; then
  echo "PROXY_OK http://0.0.0.0:8001/health"
else
  echo "PROXY_FAIL — check /var/log/capstone-ai-proxy.log" >&2
  tail -20 /var/log/capstone-ai-proxy.log 2>/dev/null || true
  exit 1
fi
