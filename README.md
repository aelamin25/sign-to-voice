# SignBridge (sign-to-voice)

A Deaf patient signs to the camera, and an avatar speaks the sentence to the doctor. The doctor's spoken reply
comes back to the patient in plain words. Built at Imperial AI Hack 2026 with ElevenLabs, Anam and Adaption.
It is a helper for when an interpreter isn't available, not a replacement for a certified medical interpreter.

## Get the latest version (copy and paste)

The latest version of everyone's work is on the branch called `integration-all`. The `main` branch holds the same thing.

**If you already have the project on your computer**, open Terminal, go into the project folder, and paste:

```
git fetch origin && git checkout integration-all && git pull origin integration-all
```

**If you don't have it yet**, open Terminal and paste:

```
git clone -b integration-all https://github.com/aelamin25/sign-to-voice.git
```

Then start it:

```
cd sign-to-voice && sh scripts/start.sh
```

and open `http://localhost:5180` in Chrome. (If you were already inside the project folder, leave out `cd sign-to-voice &&`.)

## Run it (copy and paste)

You need a Mac with [Node.js](https://nodejs.org) (press the LTS button) and
[Python 3](https://www.python.org/downloads) installed. On Windows, double-click `scripts\windows-start.bat` instead.

**1. Open the Terminal app and paste this.** It downloads the project.

```
git clone -b integration-all https://github.com/aelamin25/sign-to-voice.git
```

**2. Paste this.** It starts everything. The first time takes a few minutes.

```
cd sign-to-voice && sh scripts/start.sh
```

**3. Wait for the box that says "SignBridge is running". Then open this in Chrome:**

```
http://localhost:5180
```

Check the address is exactly that, ending in **5180**. Any other number is a different project.

**4. To stop it,** click the Terminal window and press `Ctrl` and `C` together.

That's it. Without keys it runs in **demo mode**: a scripted visit, no camera needed. Press "Play the full visit" in the menu.

### To run the real thing (camera, real voice, live avatar)

1. Ask Ahmed for his `.env` file, in a private message. It holds the keys. Never post it in a group chat or on GitHub.
2. Put that file inside the `sign-to-voice` folder.
3. Stop the app (`Ctrl` + `C`) and start it again: `sh scripts/start.sh`
4. **The doctor starts.** The doctor taps "Doctor, tap to speak" and greets the patient. (That first tap
   also switches the sound on: browsers keep sound off until the page has been clicked.)
5. Then they take turns: the patient signs to the camera and finishes each turn with a thumbs up; the
   doctor taps "Doctor, tap to speak" and talks.

**The live avatar's minutes are limited.** Anam's free plan gives 30 minutes a month and ends every
session after 3 minutes. The avatar joins at the visit's first turn and leaves when the visit ends, so an
open page costs nothing, but every run-through with her costs a minute or two. To practise without her
(a drawing speaks, same voice): `AVATAR=off sh scripts/start.sh`

### To use it on a phone

1. Put the phone and the laptop on the same Wi-Fi (a phone hotspot works well).
2. Start it with: `sh scripts/start.sh phone`
3. On the phone, open the `https://...:5180` address that the box shows.
4. The phone warns about the certificate once. Choose "Show details", then "visit this website".

The patient signs to the **laptop's** camera. The phone shows the avatar, the doctor's button and the reply.

### One link for the whole team (and any phone)

1. Start the app: `sh scripts/start.sh`
2. Open a second Terminal window in the project folder and paste: `sh scripts/share.sh`
3. It prints a link like `https://something.trycloudflare.com`. Send that link to the team.

Anyone can open the link on a phone or laptop, anywhere, and sees the app running on this laptop, live:
this laptop's camera, the signs, the sentences. No installing. The link stops when that window is closed.
Only one screen at a time gets the live avatar. Share the link with the team only: it uses this laptop's keys.

The link is for showing the app to someone who is somewhere else. For the demo itself use
`http://localhost:5180` on the laptop: the link sends the camera picture out over the internet, so on a
phone hotspot or busy Wi-Fi it lags. Close the link with Ctrl+C in its window (the app keeps running).

### If something goes wrong

| What you see | What to do |
|---|---|
| "Port ... is already in use" | Paste `sh scripts/stop.sh`, then start again |
| A different app opens | The address is wrong. It must be `http://localhost:5180` |
| No avatar, or she is silent | Use Chrome, not Safari, and keep the page open in one tab of one browser only |
| The avatar leaves in the middle | Anam's free plan ends a session after 3 minutes; she comes back at the next turn. If she never comes, the month's 30 minutes are used up: put a teammate's Anam key in `.env` |
| The camera light stays on after you have finished | Paste `sh scripts/stop.sh`. It stops every part, also ones left running with no window |
| The camera shows the wrong view | The app picks the Mac's own camera, not a nearby iPhone's. To choose by hand: `CAMERA=0 sh scripts/start.sh` (then try `CAMERA=1`) |
| The avatar is a drawing, not a person | Only one tab or device can have the live avatar. Close the others and reload |
| The doctor's words are a pre-set line | In `.env`, set `VITE_MOCK_STT=false` |
| Anything else | Look at the files `/tmp/signbridge-*.log` |

## What's in this repository

| Folder | What | Run it |
|---|---|---|
| `src/`, `index.html`, `server/index.ts` | **Web app** (React + TypeScript): the patient/doctor screen | `npm install` then `npm run dev:mock` (demo) or `npm run dev` (real) |
| `model/vision/` | **Sign recognition**: MediaPipe landmarks + trained classifier (`models/sign_model.pt`) | `sh scripts/signs.sh` (camera), or `sh scripts/replay.sh` (no camera, recorded takes) |
| `model/lang/` | **Language model**: signs to sentence, doctor's words to plain words / sign gloss | used by the backend |
| `model/backend/` | **Python backend** (FastAPI): `/translate`, `/simplify`, `/reply`, `/stt`, `/ws` events | `cd model/backend && uvicorn server:app --port 8000` |
| `server/index.js` | ElevenLabs Agent + Anam session server from the first prototype | `npm run agent-server` (port 3001) |
| `legacy/web/` | The first prototype page (kept as it was) | `npm run legacy:web` |

Python setup: `python -m venv .venv`, activate it, then `pip install -r requirements.txt`.

### Running the real signs end to end

Three terminals, from the repository root:

```bash
sh scripts/backend.sh     # 1. Python backend on :8000 (reads the keys in .env)
npm run dev               # 2. web app on :5180
sh scripts/signs.sh       # 3. the camera recogniser: sends each sign, then the finished turn, to the backend
```

`.env` for step 2: `VITE_MOCK=false`, `VITE_PY_BACKEND=http://localhost:8000`, `VITE_RECOGNITION=python`, and
`VITE_CAMERA_STREAM=http://localhost:8001/video`. The last one matters: `scripts/signs.sh` opens no window of its
own, so the camera picture (with the tracking dots) is only seen inside the web app's patient panel.
`WINDOW=1 sh scripts/signs.sh` also opens a separate test window. Stop the recogniser with Ctrl+C.
`scripts/backend.sh` listens on all network addresses (0.0.0.0), so a phone or second laptop on the same
network can reach it.

In the web app press **Start signing**, then sign. A turn is one movement: hands come up, the signs, a thumbs up,
hands leave the picture. The recogniser knows nine single signs and the five turns of the demo script as whole
movements (`model/vision/models/labels.json`). It was trained on one signer's recordings.

### Learning from use (Adaption)

Two optional pieces, both off unless switched on, so the default behaviour is unchanged:

- **A self-improving sentence writer.** `TRANSLATE_BACKEND=stack` with `ADAPTION_STACK=<slug>` and that account's
  `ADAPTION_API_KEY` sends each turn to an Adaption *inference stack*: a hosted model that searches our example
  sentences and that Adaption keeps tuning from its own usage. Try it: `cd model/lang && python translate.py PAIN HEAD`.
- **Saving real turns as training data.** `USAGE_LOG=1` (only with the patient's agreement: by default nothing is
  stored) makes the backend save each turn's signs, the doctor's last line and the sentence.
  `python model/lang/usage_log.py` turns them into the same rows `adaption_pipeline.py` trains on. A person who
  signs should check them first.

**Windows:** double-click `scripts\windows-start.bat`. It sets up Python the first time, starts the backend and the web app,
and plays the five recorded demo turns. The backend reads its keys from `.env` by itself on every platform.

No camera or signer to hand? `sh scripts/replay.sh` plays the five demo turns from recorded takes
(`model/vision/samples/`) through the same recogniser, so the backend and web app can be tested by anyone.
`sh scripts/replay.sh 3` plays only turn 3. The web app must be waiting for the patient: set `VITE_AUTO_SIGN=true`
(a finished turn then starts the patient's turn by itself), or press **Start signing** / **Reply in sign** before each turn.
See the docstring at the top of `model/backend/server.py` for the backend's endpoints and environment variables.

---

Real-time "Google Translate for Deaf patients at the doctor's".
Imperial AI Hackathon, Voice, Vision & Generative Media track (ElevenLabs, Anam).

- **Patient signs** → MediaPipe landmarks → sign classifier → **Claude** writes one natural English sentence → **ElevenLabs** voice → **Anam** avatar "Maya" says it to the doctor, lip-synced, with word-by-word captions.
- **Doctor speaks** → **ElevenLabs Scribe v2 Realtime** transcribes live → **Claude** rewrites it in plain words and explains jargon → a **sign video** plays back to the patient, captions synced.
- Scope: a **20-sign medical ASL prototype** (HELLO, DOCTOR, HURT/PAIN, HEAD, STOMACH, CHEST, THROAT, FEVER, SICK, DIZZY, MEDICINE, ALLERGY, HOW-LONG, DAY, YES, NO, PLEASE, THANK-YOU, AGAIN, HELP) plus numbers 1–10. It does not translate general ASL.
- Safety: if recognition is **< 0.6** confident, nothing is spoken. The patient sees "Not sure — please sign again. Nothing was spoken."

Not a replacement for a certified medical interpreter.

---

## Mobile view

The same URL serves both views. Phones (≤ 767px wide) and portrait tablets (touch screen, ≤ 1024px) get the
one-step mobile view from `flow.html`; laptops get the two-column web view. Force either with `?view=mobile` or
`?view=web`.

It shares everything with the web view (state machine, services, mock mode, scripted demo); only the
presentation in `src/mobile/` is separate, with styles scoped under `.m-root` in `src/mobile/mobile.css`.

### Open it on your phone

Phones only allow the camera and microphone on **https**, so use the phone script:

```bash
npm run dev:phone          # demo data, https, reachable on your Wi-Fi
npm run dev:phone:real     # real services + API server, https
```

Vite prints a `Network: https://192.168.x.x:5180/` address. Open that on a phone on the same Wi-Fi. The
certificate is self-signed, so the browser warns once: choose "Advanced" then "Proceed" (Chrome) or
"Show details" then "visit this website" (Safari). Then allow the camera when asked.

If the laptop and phone can't see each other (guest Wi-Fi, university network), use a tunnel instead, e.g.
`npx cloudflared tunnel --url http://localhost:5180` with `npm run dev:mock`, and open the `https://…trycloudflare.com`
link it prints.

Notes for phones: audio and speech start after the first tap (iOS rule), the camera stops whenever you leave the
signing step, and if the camera is blocked the signing step shows "Allow camera to sign" with Try again.

## Running with the trained models (Python mode)

Signs come from `model/vision/live.py` (it owns the laptop camera), sentences from `model/lang`, both through
the Python backend in `model/backend`. Nothing changes in the app unless `VITE_PY_BACKEND` is set.

1. Once: `npm install`, then `pip install -r requirements.txt` from the repo root.
2. Add to `.env` (next to your keys):
   ```
   VITE_MOCK=false
   VITE_PY_BACKEND=http://localhost:8000
   VITE_RECOGNITION=python
   VITE_CAMERA_STREAM=http://localhost:8001/video
   # optional, keep these in demo mode:
   # VITE_MOCK_AVATAR=true
   # VITE_MOCK_SIGNVIDEO=true
   ```
3. Run three terminals:
   ```
   npm run dev
   cd model/backend  &&  uvicorn server:app --port 8000      # needs ANTHROPIC_API_KEY and LLM_PROVIDER=anthropic in that terminal
   cd model/vision   &&  python live.py --send http://localhost:8000/phrase --stream 8001 --no-window
   ```
   On Windows PowerShell, set the backend's variables first: `$env:ANTHROPIC_API_KEY="..."; $env:LLM_PROVIDER="anthropic"`.

The web and mobile views both show `live.py`'s camera view in the patient's camera box. If something isn't
running, the app says so instead of failing silently:

| What you see | What it means | Fix |
|---|---|---|
| "Can't reach the sign recogniser at http://localhost:8000 … Retrying…" (phone: "Sign recogniser not connected") | the Python backend isn't running | start `uvicorn server:app --port 8000`; the app reconnects by itself |
| "No signs arriving yet. Is model/vision/live.py running …?" (after 8 s) | backend is up, but `live.py` isn't sending | start `live.py --send http://localhost:8000/phrase` |
| "Camera view not available at …/video … Signs still work." | `live.py` runs without `--stream`, or on another port | add `--stream 8001` (and match `VITE_CAMERA_STREAM`) |

If the backend's `/translate` fails, sentences fall back to Claude (`/api/translate`) or the built-in composer,
so the patient is never stuck. A turn ends on THUMBS-UP or after ~1.5 s of rest in `live.py`.

## Web app: quick start (demo mode, no keys)

```bash
npm install
npm run dev:mock        # http://localhost:5180
```

Everything runs on scripted mock adapters: no keys, no server, no camera. **This is the demo fallback.**
Menu → **Play the full visit** runs the whole scripted conversation on its own (it always uses the mocks, even in real mode).

## Real mode

```bash
cp .env.example .env    # fill in the keys, set VITE_MOCK=false
npm run dev             # web on :5180 + API server on :8787 (Vite proxies /api)
```

Any service that fails (missing key, network, mic/camera denied) falls back on its own, so the flow never dead-ends:

| Service | Real adapter | Falls back to |
|---|---|---|
| recognition | webcam + MediaPipe Hand + Pose landmarker, landmark overlay, auto-ends 1.2 s after hands drop | keyboard classifier still works with no camera |
| translate | `POST /api/translate`, `/api/simplify`, `/api/summary` (Claude) | local gloss composer / exact words / local summary |
| tts | `POST /api/tts` → ElevenLabs `with-timestamps` (word timings for captions) | captions only, estimated timing |
| stt | ElevenLabs Scribe v2 Realtime, VAD commits, single-use token from `/api/scribe-token` | "Try again" with a clear error |
| avatar | Anam JS SDK, session from `/api/anam-session`, `llmId: CUSTOMER_CLIENT_V1` so Maya only says our text via `talk()` | illustrated Maya + ElevenLabs voice |
| signVideo | `POST /api/sign-video` → `{clips:[url], words:[...]}`, clips play in sequence | animated signer with synced captions |

### Mixing mock and real

With `VITE_MOCK=false`, keep any single service mocked while you build the others:

```
VITE_MOCK_RECOGNITION=true
VITE_MOCK_AVATAR=true
```

Menu → How it works → "Running now" shows which services are live.

### Environment variables

| Variable | Where | What |
|---|---|---|
| `VITE_MOCK` | web | `true` = everything mocked (default if unset) |
| `VITE_MOCK_<SERVICE>` | web | per-service override: `RECOGNITION`, `TRANSLATE`, `TTS`, `STT`, `AVATAR`, `SIGNVIDEO` |
| `PORT` | server | API port, default 8787 |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | server | Claude (default model `claude-sonnet-5-5`) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL` | server | TTS + Scribe |
| `ANAM_API_KEY`, `ANAM_AVATAR_ID`, `ANAM_VOICE_ID` | server | Maya. Pick an avatar and voice in lab.anam.ai |
| `SIGN_VIDEO_API_URL` | server | optional external sign-video generator |

Keys live only in `.env` on the server. The browser never sees them. `GET /api/health` shows what is configured.

## For the team

**ML: plug in the classifier.** `src/services/recognition.ts` → implement `SignClassifier` (`push(frame) → {gloss, confidence} | null`). Each frame carries both hands' 21 landmarks + upper-body pose. Pass it to `createRealRecognition(() => new YourClassifier())` in `src/services/index.ts`. Until then the stub reads keys:
`1` HELLO · `2` DOCTOR · `3` HURT · `4` HEAD · `5` FEVER · `6` YES · `7` NO · `8` THANK-YOU · `9` unclear (0.41) · `Shift`+digit = number (Shift+0 = 10).

**Sign video.** Drop clips in `server/sign-clips/<WORD>.mp4` (e.g. `TAKE.mp4`, `MEDICINE.mp4`) or set `SIGN_VIDEO_API_URL` to a generator that returns `{clips, words}`.

**Anam tools.** Tool calls (`speak_patient_message`, `request_clarification`, `generate_sign_video`, `create_visit_summary`, plus `show_pain_scale`) show as a small "Anam tool" toast. Real `TOOL_CALL_STARTED` events from Anam go through the same toast.

## How it's built

```
src/
  app/         App.tsx (two-column layout), config.ts (mock/real switches)
  state/       machine.ts (single state machine), store.ts (zustand: orchestration), media.ts
  components/  CameraPanel, SignChips, LiveTranslation, AvatarStage, ListenView, SignVideoPlayer,
               StepBar, PrimaryAction, Menu, ConversationLog, VisitSummary, TabletopView, Toast, Header
  services/    types.ts (interfaces), recognition, translate, tts, stt, avatar, signVideo, index.ts (picks adapters)
  mocks/       script.ts (the scripted visit)
  lib/         signs.ts (vocabulary), compose.ts (gloss → English), timing.ts (caption timing)
  styles/      tokens.css (design tokens), app.css
server/        index.ts (Express: /api/translate, simplify, summary, tts, scribe-token, anam-session, sign-video, health)
```

**State machine:** `start → signing → speaking → listening → generating → watching → (Reply in sign) signing …`, with `signing → uncertain` (confidence < 0.6) and `→ ended` (End visit). `src/state/machine.ts` holds the transition table; every action goes through it.

**UX rule:** one thing at a time. Exactly one primary button per step (`PrimaryAction.tsx` derives it from the state, so no layout can show two). The inactive column dims (and collapses on phones); the active one moves first on narrow screens. The step bar is teal for patient steps and coral for doctor steps.

**Accessibility:** WCAG AA colours from the mockup tokens, visible focus, focus moves to each step's button, `aria-live` on everything that changes, focus-trapped dialogs with Escape, text size control, reduced motion (menu toggle + `prefers-reduced-motion`). No emoji.

**Privacy:** camera frames are processed in the browser and never stored or uploaded. Nothing is saved unless the patient taps "Save with my permission" on the visit summary (saved to this browser only).

## Scripts

| | |
|---|---|
| `npm run dev:mock` | web only, all mocks |
| `npm run dev` | web + API server (real mode, reads `.env`) |
| `npm run dev:phone` / `dev:phone:real` | same over https on your Wi-Fi, for testing on a phone |
| `npm run lint` | oxlint (TypeScript + React hooks rules) |
| `npm run server` | API server only |
| `npm run build` / `build:mock` | typecheck + production build to `dist/` |
| `npm run typecheck` | web + server |
