#!/bin/sh
# Starts the Python backend (model/backend) on port 8000, with the keys from .env.
#   sh scripts/backend.sh
cd "$(dirname "$0")/.."
PY=model/.venv/bin/python
[ -x "$PY" ] || PY=python3
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
else
  echo "No .env file here yet: starting without keys (sentences fall back to the built-in composer)."
fi
cd model/backend
case "$PY" in /*|python3) ;; *) PY="../../$PY";; esac
exec "$PY" -m uvicorn server:app --host 0.0.0.0 --port 8000
