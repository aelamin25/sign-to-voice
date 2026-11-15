# Sourced by start.sh and share.sh. Not run on its own.
# The same for everyone, whatever is in their .env: the real camera and the trained sign model.
# A service that needs a key runs for real when its key is in .env, and on a stand-in when it is not.
has() { grep -Eq "^$1=.+" .env; }
export VITE_MOCK=false
export VITE_PY_BACKEND=http://localhost:8000
export VITE_RECOGNITION=python
export VITE_AUTO_SIGN=true
export VITE_CAMERA_STREAM=http://localhost:8001/video
export VITE_MOCK_TRANSLATE=true VITE_MOCK_SIGNVIDEO=true
if has ELEVENLABS_API_KEY; then export VITE_MOCK_STT=false VITE_MOCK_TTS=false; else export VITE_MOCK_STT=true VITE_MOCK_TTS=true; fi
if has ANAM_API_KEY && has ANAM_AVATAR_ID; then export VITE_MOCK_AVATAR=false; else export VITE_MOCK_AVATAR=true; fi
# Practice mode:  AVATAR=off sh scripts/start.sh   A drawing speaks instead of the live avatar, with the same
# voice. The live avatar's minutes are limited (Anam's free plan: 30 a month), so practise without her.
[ "$AVATAR" = "off" ] && export VITE_MOCK_AVATAR=true
