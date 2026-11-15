#!/bin/sh
# Stops every part of SignBridge that is still running and turns the camera off: the web app, the API,
# the Python backend, the sign reader (the part that holds the camera) and the shared link.
# It also finds copies that were left running in the background with no Terminal window.
#   sh scripts/stop.sh
QUIET="$1"
say() { [ "$QUIET" = "quiet" ] || echo "$@"; }

left() {
  for port in 5180 5181 8787 8000 8001; do lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null; done
  pgrep -f "live\.py .*--stream 8001" 2>/dev/null
  pgrep -f "cloudflared tunnel --url http://localhost:518" 2>/dev/null
}

pids=$(left)
if [ -z "$pids" ]; then say "Nothing was running. The camera is off."; exit 0; fi
kill $pids 2>/dev/null
# give them a moment to close, then insist
for i in 1 2 3 4 5 6 7 8 9 10; do [ -z "$(left)" ] && break; sleep 0.5; done
pids=$(left)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null && sleep 1
if [ -z "$(left)" ]; then say "All stopped. The camera is off."
else say "Something would not stop. Restart the Mac if the camera light stays on."; exit 1; fi
