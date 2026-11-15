#!/bin/sh
# Stops every part of SignBridge that is still running (web app, API, Python backend, sign reader).
#   sh scripts/stop.sh
for port in 5180 8787 8000 8001; do
  pids=$(lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null)
  [ -n "$pids" ] && kill $pids 2>/dev/null && echo "Stopped what was on port $port"
done
echo "All stopped."
