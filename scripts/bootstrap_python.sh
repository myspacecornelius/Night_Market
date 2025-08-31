#!/usr/bin/env bash
set -euo pipefail

# Services that have requirements.txt
SERVICES=(
  "."
  "backend"
  "services/api"
  "services/monitor"
  "services/checkout"
  "services/proxy"
  "worker"
)

# Prefer uv if available; otherwise fall back to venv+pip
have_uv() { command -v uv >/dev/null 2>&1; }

for svc in "${SERVICES[@]}"; do
  req="${svc}/requirements.txt"
  [ -f "$req" ] || continue
  echo "▶ ${svc}"

  cd "$svc"

  if have_uv; then
    uv venv .venv --python 3.12
    . .venv/bin/activate
    uv pip install -r requirements.txt
  else
    python3 -m venv .venv
    . .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
  fi

  deactivate
  cd - >/dev/null
done

echo "✅ Python envs created per service (.venv in each)."
echo "Tip: run a service with: source <service>/.venv/bin/activate && uvicorn app:app --reload"