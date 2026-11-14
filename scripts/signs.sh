#!/bin/sh
# Starts the sign recogniser with the camera and sends each finished turn to the backend.
#   sh scripts/signs.sh                      backend on this laptop
#   sh scripts/signs.sh http://HOST:8000     backend somewhere else
cd "$(dirname "$0")/../model/vision"
PY=../.venv/bin/python
[ -x "$PY" ] || PY=python3
# --plain: the camera window shows only the picture and the dots. Take it out to see the words while testing.
BASE="${1:-http://localhost:8000}"
exec "$PY" live.py --plain --send "${BASE%/}/phrase" 2>/dev/null
