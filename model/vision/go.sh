#!/bin/sh
# Records whatever is still missing for the demo script, then trains.
# Run from this folder with:  sh go.sh
cd "$(dirname "$0")"
PY=../.venv/bin/python
$PY collect.py --signer ahmed --takes 20 --labels DONT-UNDERSTAND NO THANK-YOU 2>/dev/null
$PY collect.py --signer ahmed --takes 30 --labels HEAD PAIN NONE FIDGET 2>/dev/null
$PY train.py
