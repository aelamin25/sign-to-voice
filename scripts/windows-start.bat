@echo off
rem SignBridge on Windows: one file starts everything, with YOUR camera and the trained sign model.
rem Double-click it, or run:  scripts\windows-start.bat
rem First run sets up Python (5 to 10 minutes). After that it starts in seconds.
rem Keys are read from the .env file in the project folder; without keys the voice, avatar and the
rem doctor's speech are stand-ins, but the camera and the signs still work.

cd /d "%~dp0.."

where node >nul 2>nul || (echo Node.js is missing. Install it from https://nodejs.org ^(LTS^), then run this again. & pause & exit /b 1)

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

if not exist ".env" copy ".env.example" ".env" >nul

rem The same for everyone, whatever is in their .env: the real camera and the trained sign model.
set VITE_MOCK=false
set VITE_PY_BACKEND=http://localhost:8000
set VITE_RECOGNITION=python
set VITE_AUTO_SIGN=true
set VITE_CAMERA_STREAM=http://localhost:8001/video
set VITE_MOCK_TRANSLATE=true
set VITE_MOCK_SIGNVIDEO=true
set VITE_MOCK_STT=true
set VITE_MOCK_TTS=true
set VITE_MOCK_AVATAR=true
findstr /r /b /c:"ELEVENLABS_API_KEY=." .env >nul && (set VITE_MOCK_STT=false& set VITE_MOCK_TTS=false)
findstr /r /b /c:"ANAM_API_KEY=." .env >nul && set VITE_MOCK_AVATAR=false

echo Starting the backend (port 8000)...
start "SignBridge backend" cmd /k "cd /d "%CD%\model\backend" && "%CD%\.venv\Scripts\python.exe" -m uvicorn server:app --host 0.0.0.0 --port 8000"

echo Starting the web app (port 5180)...
start "SignBridge web app" cmd /k "cd /d "%CD%" && npm run dev"

echo Starting the sign reader (it uses the camera)...
start "SignBridge sign reader" cmd /k "cd /d "%CD%\model\vision" && "%CD%\.venv\Scripts\python.exe" live.py --plain --camera 0 --send http://localhost:8000/phrase --stream 8001 --no-window"

echo.
echo ==================================================
echo  SignBridge is starting. In about 20 seconds, open this in Chrome:
echo      http://localhost:5180
echo  You should see YOURSELF in the left box.
echo  Keep ONE tab only. To stop, close the three black windows.
echo  No camera? Run:  scripts\windows-replay.bat   (plays Ahmed's recorded signs)
echo ==================================================
pause
