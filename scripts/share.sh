#!/bin/sh
# Gives the running app ONE link that any phone or laptop can open, anywhere (no same Wi-Fi needed).
#   1. start the app first:   sh scripts/start.sh
#   2. in a second window:    sh scripts/share.sh
# It prints a https://....trycloudflare.com link. The link works only while this window stays open,
# and it changes every time. Anyone who has the link uses this laptop's app and its keys, so share it
# with the team only. Needs cloudflared:  brew install cloudflared
cd "$(dirname "$0")/.." || exit 1
command -v cloudflared >/dev/null || { echo "cloudflared is missing. Install it with:  brew install cloudflared"; exit 1; }
curl -s -m 3 -o /dev/null http://localhost:8000/health || { echo "The app is not running. Start it first:  sh scripts/start.sh"; exit 1; }
[ -f .env ] || cp .env.example .env
. scripts/_settings.sh

# An older link that is still running would hold the same port: close it first.
old_link() {
  lsof -ti tcp:5181 -sTCP:LISTEN 2>/dev/null
  pgrep -f "cloudflared tunnel --url http://localhost:518" 2>/dev/null
}
close_link() { pids=$(old_link); [ -n "$pids" ] && kill $pids 2>/dev/null; rm -f /tmp/signbridge-link.txt; }
close_link; sleep 1
# Ctrl+C, or closing this window, closes the link. The app itself keeps running.
trap 'echo; close_link; echo "The link is closed. The app is still running."; exit 0' INT TERM HUP

# The link serves a packed copy of the app (a few files) instead of the developer copy (hundreds of
# small files), so it opens in seconds on a phone.
echo "Packing the app for the link (about 10 seconds)..."
npx vite build > /tmp/signbridge-build.log 2>&1 || { echo "Packing failed. Details: /tmp/signbridge-build.log"; exit 1; }
npx vite preview --port 5181 --strictPort > /tmp/signbridge-preview.log 2>&1 &
i=0
until curl -s -m 2 -o /dev/null http://localhost:5181; do
  i=$((i + 1)); [ $i -gt 30 ] && { echo "The packed app did not start. Details: /tmp/signbridge-preview.log"; close_link; exit 1; }
  sleep 0.5
done

echo "Making the link (about 15 seconds)..."
cloudflared tunnel --url http://localhost:5181 > /tmp/signbridge-tunnel.log 2>&1 &
TUNNEL=$!
LINK=""; i=0
while [ -z "$LINK" ] && [ $i -lt 60 ] && kill -0 $TUNNEL 2>/dev/null; do
  sleep 0.5; i=$((i + 1))
  LINK=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/signbridge-tunnel.log | head -1)
done
if [ -z "$LINK" ]; then
  echo "Could not make the link. Is the internet working? Details: /tmp/signbridge-tunnel.log"
  close_link; exit 1
fi
# A new link's name takes some seconds to appear on the internet. Do NOT open it from this laptop before
# then: asking too early makes this network (and a phone on it) remember "no such address" for a while.
# So ask Cloudflare's own address book directly (1.1.1.1), and test the link by its number, not its name.
HOST=${LINK#https://}
IP=""; i=0
while [ -z "$IP" ] && [ $i -lt 45 ]; do
  sleep 2; i=$((i + 2))
  IP=$(dig +short +time=2 +tries=1 @1.1.1.1 "$HOST" A 2>/dev/null | grep -E '^[0-9.]+$' | head -1)
done
READY=""
if [ -n "$IP" ]; then
  i=0
  while [ $i -lt 20 ]; do
    [ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' --resolve "$HOST:443:$IP" "$LINK/py/health")" = "200" ] && { READY=1; break; }
    i=$((i + 1)); sleep 1
  done
fi
sleep 3
echo "$LINK" > /tmp/signbridge-link.txt
echo
echo "=================================================="
echo " Your link (open it on any phone or laptop):"
echo
echo "     $LINK"
echo
echo " Keep this window open: closing it, or Ctrl+C, closes the link."
[ -n "$READY" ] || echo " It may need another half minute before it opens."
echo " The avatar works on ONE screen at a time, so open the app in one place only."
echo " Share the link with the team only: it uses this laptop's keys."
echo "=================================================="
wait $TUNNEL
echo "The link has stopped (the tunnel closed). Run this again for a new one:  sh scripts/share.sh"
close_link
