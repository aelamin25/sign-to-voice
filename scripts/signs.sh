#!/bin/sh
# Starts the sign recogniser with the camera and sends each finished turn to the backend.
#   sh scripts/signs.sh                      backend on this laptop
#   sh scripts/signs.sh http://HOST:8000     backend somewhere else
cd "$(dirname "$0")/../model/vision"
PY=../.venv/bin/python
[ -x "$PY" ] || PY=python3
# The camera picture, with the dots and no words, is shown inside the web page (VITE_CAMERA_STREAM).
#   WINDOW=1 sh scripts/signs.sh   also opens a separate camera window with the words, for testing
#   Stop it with Ctrl+C.
BASE="${1:-http://localhost:8000}"
if [ -n "$WINDOW" ]; then
  exec "$PY" live.py --send "${BASE%/}/phrase" --stream 8001 2>/dev/null
fi
exec "$PY" live.py --plain --send "${BASE%/}/phrase" --stream 8001 --no-window 2>/dev/null
