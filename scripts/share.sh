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
# The link serves a packed copy of the app (a few files) instead of the developer copy (hundreds of
# small files), so it opens in seconds on a phone.
echo "Packing the app for the link (about 10 seconds)..."
npx vite build > /tmp/signbridge-build.log 2>&1 || { echo "Packing failed. See /tmp/signbridge-build.log"; exit 1; }
lsof -ti tcp:5181 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
npx vite preview --port 5181 --strictPort > /tmp/signbridge-preview.log 2>&1 &
trap 'kill 0' INT TERM
sleep 3
echo "Making the link. Look for the https://....trycloudflare.com line below."
cloudflared tunnel --url http://localhost:5181
