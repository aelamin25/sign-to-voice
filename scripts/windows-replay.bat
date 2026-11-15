@echo off
rem Plays Ahmed's five recorded turns into a running SignBridge (start scripts\windows-start.bat first).
cd /d "%~dp0..\model\vision"
"..\..\.venv\Scripts\python.exe" live.py --replay "samples\PAIN+HEAD+THUMBS-UP\take1.npy" "samples\THREE+DAY+THUMBS-UP\take1.npy" "samples\DONT-UNDERSTAND+THUMBS-UP\take1.npy" "samples\NO+THUMBS-UP\take1.npy" "samples\THANK-YOU+THUMBS-UP\take1.npy" --replay-pause 12 --send http://localhost:8000/phrase 2>nul
pause
