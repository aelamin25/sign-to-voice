#!/bin/sh
# Starts ALL of SignBridge in one Terminal window: Python backend, API, web app and the sign reader.
#   sh scripts/start.sh            on this laptop:  http://localhost:5180
#   sh scripts/start.sh phone      also for a phone on the same Wi-Fi or hotspot (https)
#   CAMERA=0 sh scripts/start.sh   choose the camera by hand (0, 1, ...) if the picture comes from the wrong one
# The first run sets everything up (a few minutes). Stop it with Ctrl+C.
cd "$(dirname "$0")/.." || exit 1
MODE="${1:-laptop}"

command -v node >/dev/null || { echo "Node.js is missing. Install it from https://nodejs.org (the LTS button), then run this again."; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 is missing. Install Python 3.12 from https://www.python.org/downloads, then run this again."; exit 1; }

if [ ! -d node_modules ]; then echo "First run: installing the web app's parts..."; npm install || exit 1; fi
if [ ! -x model/.venv/bin/python ]; then
  echo "First run: installing the Python parts (this is the slow one, a few minutes)..."
  # Computers often have several Pythons, and not every one can install these packages (too new, or
  # built for a different chip). Try each in turn, best first, until one works. Only ready-made
  # packages are used, so a Python that can't do it fails in seconds instead of building for an hour.
  DONE=""
  for name in python3.12 python3.11 python3.10 python3.13 python3; do
    for py in $(which -a $name 2>/dev/null); do
      rm -rf model/.venv
      if "$py" -m venv model/.venv >/dev/null 2>&1 \
        && model/.venv/bin/python -m pip install -q --only-binary=:all: -r requirements.txt >/tmp/signbridge-pip.log 2>&1; then
        DONE="$py"; break 2
      fi
    done
  done
  if [ -z "$DONE" ]; then
    rm -rf model/.venv
    echo "None of the Pythons on this computer could install the packages."
    echo "Install Python 3.12 from https://www.python.org/downloads, then run this again."
    exit 1
  fi
  echo "Python parts installed with $DONE"
fi
[ -f .env ] || cp .env.example .env

. scripts/_settings.sh
KEYS="none (camera and signs work; the voice, avatar and doctor's speech are stand-ins)"
has ELEVENLABS_API_KEY && KEYS="ElevenLabs"
has ANAM_API_KEY && KEYS="$KEYS + Anam"
has ADAPTION_API_KEY && KEYS="$KEYS + Adaption"

for port in 5180 8787 8000 8001; do
  if lsof -ti tcp:$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use (an older copy is probably still running)."
    echo "Run this, then try again:   sh scripts/stop.sh"
    exit 1
  fi
done

# Ctrl+C, or closing this window, stops every part and turns the camera off.
trap 'echo; echo "Stopping..."; sh scripts/stop.sh quiet; echo "Stopped. The camera is off."; exit 0' INT TERM HUP
sh scripts/backend.sh > /tmp/signbridge-backend.log 2>&1 &
npx tsx server/index.ts > /tmp/signbridge-api.log 2>&1 &
if [ "$MODE" = "phone" ]; then HTTPS=1 npx vite --host > /tmp/signbridge-web.log 2>&1 &
else npx vite > /tmp/signbridge-web.log 2>&1 & fi
sh scripts/signs.sh > /tmp/signbridge-signs.log 2>&1 &

# Wait until every part answers (the first start of the day can take a minute), then say what is wrong
# if one of them did not come up, instead of saying "running" when it is not.
echo "Starting SignBridge (up to a minute)..."
if [ "$MODE" = "phone" ]; then WEB=https://localhost:5180; else WEB=http://localhost:5180; fi
up() { curl -sk -m 2 -o /dev/null "$1"; }
camera_up() { lsof -ti tcp:8001 -sTCP:LISTEN >/dev/null 2>&1; }
i=0
while [ $i -lt 90 ]; do
  up http://localhost:8000/health && up "$WEB" && camera_up && break
  i=$((i + 1)); sleep 1
done
PROBLEM=""
up "$WEB" || PROBLEM="The web page did not start. Details: /tmp/signbridge-web.log"
up http://localhost:8000/health || PROBLEM="The Python backend did not start. Details: /tmp/signbridge-backend.log"
if ! camera_up; then
  PROBLEM="The sign reader could not open the camera.
   1. Close anything else that is using the camera (FaceTime, Zoom, Photo Booth, another copy of this).
   2. System Settings > Privacy & Security > Camera: switch on Terminal.
   3. Run this again. If the picture comes from the wrong camera:  CAMERA=0 sh scripts/start.sh"
fi
if [ -n "$PROBLEM" ]; then
  echo
  echo "SignBridge did NOT start properly:"
  echo " $PROBLEM"
  sh scripts/stop.sh quiet
  exit 1
fi
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
echo " Keys found: $KEYS"
echo " You should see YOURSELF in the left box."
echo " To stop (this also turns the camera off): press Ctrl+C in this window,"
echo "   or from any window:   sh scripts/stop.sh"
echo " For a link other people can open: in a second window   sh scripts/share.sh"
echo " If something looks wrong, the logs are in /tmp/signbridge-*.log"
echo "=================================================="
wait
