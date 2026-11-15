#!/bin/sh
# No camera and no signer needed: plays the five turns of the demo script from recorded takes,
# through the same recogniser, and sends them to the backend. Use it to test the link.
#   sh scripts/replay.sh                     all five turns, 12 seconds apart
#   sh scripts/replay.sh 1                   only turn 1 (1 to 5)
#   BACKEND=http://HOST:8000 sh scripts/replay.sh
cd "$(dirname "$0")/../model/vision"
PY=../.venv/bin/python
[ -x "$PY" ] || PY=python3
T1="samples/PAIN+HEAD+THUMBS-UP/take1.npy"
T2="samples/THREE+DAY+THUMBS-UP/take1.npy"
T3="samples/DONT-UNDERSTAND+THUMBS-UP/take1.npy"
T4="samples/NO+THUMBS-UP/take1.npy"
T5="samples/THANK-YOU+THUMBS-UP/take1.npy"
BASE="${BACKEND:-http://localhost:8000}"
URL="${BASE%/}/phrase"
case "$1" in
  1) exec "$PY" live.py --replay "$T1" --send "$URL" 2>/dev/null ;;
  2) exec "$PY" live.py --replay "$T2" --send "$URL" 2>/dev/null ;;
  3) exec "$PY" live.py --replay "$T3" --send "$URL" 2>/dev/null ;;
  4) exec "$PY" live.py --replay "$T4" --send "$URL" 2>/dev/null ;;
  5) exec "$PY" live.py --replay "$T5" --send "$URL" 2>/dev/null ;;
  *) exec "$PY" live.py --replay "$T1" "$T2" "$T3" "$T4" "$T5" --replay-pause 12 --send "$URL" 2>/dev/null ;;
esac
