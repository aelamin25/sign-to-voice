#!/bin/sh
# Starts ALL of SignBridge in one Terminal window: Python backend, API, web app and the sign reader.
#   sh scripts/start.sh            on this laptop:  http://localhost:5180
#   sh scripts/start.sh phone      also for a phone on the same Wi-Fi or hotspot (https)
#   CAMERA=1 sh scripts/start.sh   use the second camera (when a nearby iPhone has taken over as camera 0)
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

# The same for everyone, whatever is in their .env: the real camera and the trained sign model.
# A service that needs a key runs for real when its key is in .env, and on a stand-in when it is not.
has() { grep -Eq "^$1=.+" .env; }
export VITE_MOCK=false
export VITE_PY_BACKEND=http://localhost:8000
export VITE_RECOGNITION=python
export VITE_AUTO_SIGN=true
export VITE_CAMERA_STREAM=http://localhost:8001/video
export VITE_MOCK_TRANSLATE=true VITE_MOCK_SIGNVIDEO=true
if has ELEVENLABS_API_KEY; then export VITE_MOCK_STT=false VITE_MOCK_TTS=false; else export VITE_MOCK_STT=true VITE_MOCK_TTS=true; fi
if has ANAM_API_KEY && has ANAM_AVATAR_ID; then export VITE_MOCK_AVATAR=false; else export VITE_MOCK_AVATAR=true; fi
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

trap 'echo; echo "Stopping..."; kill 0' INT TERM
sh scripts/backend.sh > /tmp/signbridge-backend.log 2>&1 &
npx tsx server/index.ts > /tmp/signbridge-api.log 2>&1 &
if [ "$MODE" = "phone" ]; then HTTPS=1 npx vite --host > /tmp/signbridge-web.log 2>&1 &
else npx vite > /tmp/signbridge-web.log 2>&1 & fi
sh scripts/signs.sh > /tmp/signbridge-signs.log 2>&1 &

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
echo " Keys found: $KEYS"
echo " You should see YOURSELF in the left box. If the Mac asks to let Terminal use the camera, say OK,"
echo " then press Ctrl+C and start again."
echo " To stop: press Ctrl+C in this window."
echo " If something looks wrong, the logs are in /tmp/signbridge-*.log"
echo "=================================================="
wait
