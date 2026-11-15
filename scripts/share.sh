#!/bin/sh
# Gives the running app ONE link that any phone or laptop can open, anywhere (no same Wi-Fi needed).
#   1. start the app first:   sh scripts/start.sh
#   2. in a second window:    sh scripts/share.sh
# It prints a https://....trycloudflare.com link. The link works only while this window stays open,
# and it changes every time. Anyone who has the link uses this laptop's app and its keys, so share it
# with the team only. Needs cloudflared:  brew install cloudflared
command -v cloudflared >/dev/null || { echo "cloudflared is missing. Install it with:  brew install cloudflared"; exit 1; }
curl -s -m 3 -o /dev/null http://localhost:5180 || { echo "The app is not running. Start it first:  sh scripts/start.sh"; exit 1; }
echo "Making the link (about 10 seconds). Look for the https://....trycloudflare.com line below."
exec cloudflared tunnel --url http://localhost:5180
