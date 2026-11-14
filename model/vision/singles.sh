#!/bin/sh
# Records the single-sign turns with the thumbs up on the end, as one movement, then trains.
# Run from this folder with:  sh singles.sh
cd "$(dirname "$0")"
PY=../.venv/bin/python
$PY collect.py --signer ahmed --takes 20 --labels DONT-UNDERSTAND+THUMBS-UP NO+THUMBS-UP THANK-YOU+THUMBS-UP 2>/dev/null
$PY train.py
