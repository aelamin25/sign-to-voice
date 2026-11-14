#!/bin/sh
# Records the two-sign turns from the demo script as single flowing movements, then trains.
# Run from this folder with:  sh phrases.sh
cd "$(dirname "$0")"
PY=../.venv/bin/python
$PY collect.py --signer ahmed --takes 25 --labels PAIN+HEAD+THUMBS-UP THREE+DAY+THUMBS-UP 2>/dev/null
$PY train.py
