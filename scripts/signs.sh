#!/bin/sh
# Starts the sign recogniser with the camera. It sends each sign, then the finished turn, to the backend.
#   sh scripts/signs.sh                      backend on this laptop
#   sh scripts/signs.sh http://HOST:8000     backend somewhere else
cd "$(dirname "$0")/../model/vision"
PY=../.venv/bin/python
[ -x "$PY" ] || PY=python3
# The camera picture, with the dots and no words, is shown inside the web page (VITE_CAMERA_STREAM).
#   WINDOW=1 sh scripts/signs.sh   also opens a separate camera window with the words, for testing
#   CAMERA=0 sh scripts/signs.sh   choose the camera by hand (0, 1, ...)
#   Stop it with Ctrl+C.
BASE="${1:-http://localhost:8000}"
# Which camera. A nearby iPhone offers itself to the Mac as a camera too and is numbered before the
# Mac's own, so "camera 0" becomes the phone. Unless CAMERA is set by hand, find the Mac's own camera:
# the cameras are numbered in the order of their IDs.
if [ -z "$CAMERA" ] && command -v system_profiler >/dev/null 2>&1; then
  CAMERA=$(system_profiler SPCameraDataType 2>/dev/null \
    | awk -F': ' '/Model ID:/ {m=$2} /Unique ID:/ {print $2 "\t" m}' | LC_ALL=C sort \
    | awk -F'\t' '$2 !~ /^(iPhone|iPad)/ {print NR-1; exit}')
fi
if [ -n "$WINDOW" ]; then
  exec "$PY" live.py --camera "${CAMERA:-0}" --send "${BASE%/}/phrase" --stream 8001 2>/dev/null
fi
exec "$PY" live.py --plain --camera "${CAMERA:-0}" --send "${BASE%/}/phrase" --stream 8001 --no-window 2>/dev/null
