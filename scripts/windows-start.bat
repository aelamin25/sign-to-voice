@echo off
rem SignBridge on Windows: one file to start everything with Ahmed's recorded signs (no camera needed).
rem Double-click it, or run:  scripts\windows-start.bat
rem First run sets up Python (5 to 10 minutes). After that it starts in seconds.
rem Keys are read from the .env file in the project folder; without keys it still runs on stand-ins.

cd /d "%~dp0.."

if not exist ".venv\Scripts\python.exe" (
  echo Setting up Python for the first time. This takes 5 to 10 minutes...
  py -3.12 -m venv .venv || py -3 -m venv .venv || python -m venv .venv
  if not exist ".venv\Scripts\python.exe" (
    echo Could not create the Python environment. Install Python 3.12 from python.org and run this again.
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

if not exist "node_modules" (
  echo Installing the web app's packages...
  call npm install
)

echo Starting the backend (port 8000)...
start "SignBridge backend" cmd /k "cd /d "%CD%\model\backend" && "%CD%\.venv\Scripts\python.exe" -m uvicorn server:app --host 0.0.0.0 --port 8000"

echo Starting the web app (port 5180)...
start "SignBridge web app" cmd /k "cd /d "%CD%" && npm run dev"

echo.
echo Open http://localhost:5180 in Chrome and click once on the page.
echo The camera tag should read "Sign recogniser ready".
echo.
echo When it does, press any key here to play Ahmed's five recorded turns (12 seconds apart).
pause >nul

cd /d "%CD%\model\vision"
"..\..\.venv\Scripts\python.exe" live.py --replay "samples\PAIN+HEAD+THUMBS-UP\take1.npy" "samples\THREE+DAY+THUMBS-UP\take1.npy" "samples\DONT-UNDERSTAND+THUMBS-UP\take1.npy" "samples\NO+THUMBS-UP\take1.npy" "samples\THANK-YOU+THUMBS-UP\take1.npy" --replay-pause 12 --send http://localhost:8000/phrase 2>nul
echo.
echo Done. Press any key here to play them again, or close this window.
pause >nul
"..\..\.venv\Scripts\python.exe" live.py --replay "samples\PAIN+HEAD+THUMBS-UP\take1.npy" "samples\THREE+DAY+THUMBS-UP\take1.npy" "samples\DONT-UNDERSTAND+THUMBS-UP\take1.npy" "samples\NO+THUMBS-UP\take1.npy" "samples\THANK-YOU+THUMBS-UP\take1.npy" --replay-pause 12 --send http://localhost:8000/phrase 2>nul
pause
