#!/bin/sh
# Starts ALL of SignBridge in one Terminal window: Python backend, API, web app and the sign reader.
#   sh scripts/start.sh            on this laptop:  http://localhost:5180
#   sh scripts/start.sh phone      also for a phone on the same Wi-Fi or hotspot (https)
#   CAMERA=1 sh scripts/start.sh   use the second camera (when a nearby iPhone has taken over as camera 0)
# The first run sets everything up (a few minutes). Stop it with Ctrl+C.
cd "$(dirname "$0")/.." || exit 1
MODE="${1:-laptop}"

command -v node >/dev/null || { echo "Node.js is missing. Install it from https://nodejs.org (the LTS button), then run this again."; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 is missing. Install it from https://www.python.org/downloads, then run this again."; exit 1; }

if [ ! -d node_modules ]; then echo "First run: installing the web app's parts..."; npm install || exit 1; fi
if [ ! -x model/.venv/bin/python ]; then
  echo "First run: installing the Python parts (this is the slow one)..."
  python3 -m venv model/.venv && model/.venv/bin/pip install -q -r requirements.txt || exit 1
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "No .env file found, so I made one in DEMO mode (scripted, no keys, no camera)."
  echo "For the real thing, ask Ahmed for his .env file and put it in this folder."
fi

for port in 5180 8787 8000 8001; do
  if lsof -ti tcp:$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use (an older copy is probably still running)."
    echo "Run this, then try again:   sh scripts/stop.sh"
    exit 1
  fi
done

trap 'echo; echo "Stopping..."; kill 0' INT TERM
sh scripts/backend.sh > /tmp/signbridge-backend.log 2>&1 &
npx tsx server/index.ts > /tmp/signbridge-api.log 2>&1 &
if [ "$MODE" = "phone" ]; then HTTPS=1 npx vite --host > /tmp/signbridge-web.log 2>&1 &
else npx vite > /tmp/signbridge-web.log 2>&1 & fi
if grep -q "^VITE_RECOGNITION=python" .env; then sh scripts/signs.sh > /tmp/signbridge-signs.log 2>&1 & fi

sleep 8
IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "=================================================="
if [ "$MODE" = "phone" ]; then
  echo " SignBridge is running."
  echo " On the PHONE open:   https://$IP:5180"
  echo "   (it warns about the certificate once: Show details > visit this website)"
  echo " On this laptop:      https://localhost:5180"
  echo " Open it in ONE place only: the avatar works on one screen at a time."
else
  echo " SignBridge is running. Open this in Chrome:"
  echo "     http://localhost:5180"
  echo " Keep ONE tab only: the avatar works in one tab at a time."
fi
echo " To stop: press Ctrl+C in this window."
echo " If something looks wrong, the logs are in /tmp/signbridge-*.log"
echo "=================================================="
wait
