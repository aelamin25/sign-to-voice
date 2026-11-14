#!/bin/sh
# Run the demo script with Veer: shows each turn, checks the signs, speaks the sentence.
# Run from this folder with:  sh rehearse.sh
cd "$(dirname "$0")"
../.venv/bin/python -u live.py 2>/dev/null | ../.venv/bin/python -u rehearse_check.py
