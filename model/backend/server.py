"""SignVoice backend: glues vision -> language -> voice, and doctor speech -> text + ASL clips.

    cd backend
    pip install fastapi uvicorn python-multipart httpx
    uvicorn server:app --host 0.0.0.0 --port 8000
    open http://localhost:8000          (test page)

Env vars:
    ANTHROPIC_API_KEY / ADAPTION_API_KEY / LLM_PROVIDER   same as lang/translate.py
    ELEVENLABS_API_KEY        optional: without it, no audio and no speech-to-text (text only)
    ELEVENLABS_VOICE_ID       the patient's voice (pick one in ElevenLabs Voice Design / Voice Library)
    ELEVENLABS_TTS_MODEL      default eleven_flash_v2_5 (low latency)
    ELEVENLABS_STT_MODEL      default scribe_v1

Endpoints:
    POST /phrase     from vision/live.py --send   {"tokens": [...], "confs": [...]}  -> passed to the web app as-is
    POST /tokens     same input, but also translates (and speaks, with ElevenLabs) here: for the test page
    POST /translate  {"tokens": [...], "doctor_said": "..."} -> {"text": "..."}       (no side effects)
    POST /reply      {"text": "doctor's words"}   -> {"gloss": [...]}, shown to the patient
    POST /simplify   {"text": "doctor's words"}   -> {"text": "plain-words version"}
    POST /stt        multipart audio file (doctor speaking) -> transcribed, then same as /reply
    GET  /audio/{id}.mp3                        generated speech
    WS   /ws         every event is pushed here as JSON:
        {"type": "patient", "tokens": [...], "text": "...", "audio_url": "/audio/ab12.mp3" | null}
        {"type": "doctor",  "text": "...", "gloss": ["MEDICINE", "TAKE", ...]}
        {"type": "sign",    "token": "HEAD", "conf": 0.91}     (live progress while signing; THUMBS-UP = approve)
        {"type": "doctor_simplified", "original": "...", "text": "..."}   (after the patient signs DONT-UNDERSTAND)
"""
import os
import sys
import uuid

import httpx
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

HERE = os.path.dirname(os.path.abspath(__file__))


def load_env_file(path):
    """Read KEY=value lines from the project's .env, so the keys are typed in one place and the
    backend can be started the same way on Windows and Mac. Anything already set in the terminal
    wins; blank values and comments are skipped. Returns the names it set (never the values)."""
    names = []
    if not os.path.exists(path):
        return names
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value
                names.append(key)
    return names


_from_env_file = load_env_file(os.path.join(HERE, "..", "..", ".env"))
if _from_env_file:
    print("Settings read from .env:", ", ".join(sorted(_from_env_file)))

sys.path.insert(0, os.path.join(HERE, "..", "lang"))
import translate  # noqa: E402
import usage_log  # noqa: E402  (saves examples only when USAGE_LOG=1; off by default)

AUDIO_DIR = os.path.join(HERE, "audio_cache")
os.makedirs(AUDIO_DIR, exist_ok=True)
EL_KEY = os.environ.get("ELEVENLABS_API_KEY")
EL_VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
EL_TTS_MODEL = os.environ.get("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5")
EL_STT_MODEL = os.environ.get("ELEVENLABS_STT_MODEL", "scribe_v1")

app = FastAPI(title="SignVoice")


@app.on_event("startup")
async def warm_up():
    """The first model call is slow (~6 s) while connections open, so make it before the demo starts."""
    try:
        text = await run_in_threadpool(translate.gloss_to_sentence, ["HEAD", "PAIN"], None)
        print("Model warmed up:", text)
    except Exception as e:
        print("Warm-up call failed (check API keys):", e)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

state = {"doctor_said": None, "history": []}
clients: set[WebSocket] = set()


async def broadcast(event: dict):
    state["history"] = (state["history"] + [event])[-50:]
    for ws in list(clients):
        try:
            await ws.send_json(event)
        except Exception:
            clients.discard(ws)


async def tts(text: str):
    """Text -> mp3 file in audio_cache, returns its URL path (or None without ElevenLabs)."""
    if not EL_KEY or not text:
        return None
    name = f"{uuid.uuid4().hex[:10]}.mp3"
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{EL_VOICE}",
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": EL_KEY},
            json={"text": text, "model_id": EL_TTS_MODEL},
        )
    if r.status_code != 200:
        print("ElevenLabs TTS error:", r.status_code, r.text[:300])
        return None
    with open(os.path.join(AUDIO_DIR, name), "wb") as f:
        f.write(r.content)
    return f"/audio/{name}"


async def stt(audio: bytes, filename: str, content_type: str):
    async with httpx.AsyncClient(timeout=60) as http:
        r = await http.post(
            "https://api.elevenlabs.io/v1/speech-to-text",
            headers={"xi-api-key": EL_KEY},
            data={"model_id": EL_STT_MODEL},
            files={"file": (filename or "speech.webm", audio, content_type or "audio/webm")},
        )
    r.raise_for_status()
    return r.json().get("text", "").strip()


class Phrase(BaseModel):
    tokens: list[str]
    confs: list[float] | None = None
    doctor_said: str | None = None
    type: str | None = None


class Sign(BaseModel):
    token: str
    conf: float | None = None


class DoctorText(BaseModel):
    text: str


@app.post("/translate")
async def translate_only(p: Phrase):
    text = await run_in_threadpool(translate.gloss_to_sentence, p.tokens, p.doctor_said)
    usage_log.record([t for t in p.tokens if t != "THUMBS-UP"], p.doctor_said, text)
    return {"text": text}


@app.post("/tokens")
async def patient_phrase(p: Phrase):
    tokens = [t for t in p.tokens if t != "THUMBS-UP"]
    if not tokens:
        return {"type": "noop"}
    last_doctor = p.doctor_said or state["doctor_said"]
    text = await run_in_threadpool(translate.gloss_to_sentence, tokens, last_doctor)
    audio_url = await tts(text)
    event = {"type": "patient", "tokens": tokens, "text": text, "audio_url": audio_url}
    await broadcast(event)
    if "DONT-UNDERSTAND" in tokens and last_doctor:
        simple = await run_in_threadpool(translate.simplify, last_doctor)
        state["doctor_said"] = simple
        await broadcast({"type": "doctor_simplified", "original": last_doctor, "text": simple})
    return event


@app.post("/simplify")
async def simplify_only(d: DoctorText):
    return {"text": await run_in_threadpool(translate.simplify, d.text)}


@app.post("/phrase")
async def phrase_only(body: dict):
    """From vision/live.py --send .../phrase. Passed straight to the web app (no model call here).
    {"type": "sign", "token": ..., "conf": ...}  one sign as it is recognised (shown live)
    {"type": "phrase", "tokens": [...], ...}      the finished turn
    THUMBS-UP and non-signs are dropped."""
    skip = ("THUMBS-UP", "FIDGET", "NOTHING")
    if "tokens" not in body:
        token = body.get("token")
        if not token or token in skip:
            return {"type": "noop"}
        event = {"type": "sign", "token": token, "conf": body.get("conf")}
        await broadcast(event)
        return event
    tokens, confs = body.get("tokens") or [], body.get("confs") or []
    pairs = [(t, confs[i] if i < len(confs) else None) for i, t in enumerate(tokens) if t not in skip]
    event = {"type": "phrase", "tokens": [t for t, _ in pairs], "confs": [c for _, c in pairs]}
    # live.py --face: how the patient's face looked during the turn (sign language uses the face too)
    if body.get("expression") in ("question", "strained", "neutral"):
        event["expression"] = body["expression"]
    await broadcast(event)
    return event


@app.post("/sign")
async def live_sign(s: Sign):
    event = {"type": "sign", "token": s.token, "conf": s.conf}
    await broadcast(event)
    return event


async def doctor_said(text: str):
    state["doctor_said"] = text
    gloss = await run_in_threadpool(translate.sentence_to_gloss, text)
    event = {"type": "doctor", "text": text, "gloss": gloss}
    await broadcast(event)
    return event


@app.post("/reply")
async def doctor_reply(d: DoctorText):
    return await doctor_said(d.text)


@app.post("/stt")
async def doctor_speech(file: UploadFile = File(...)):
    if not EL_KEY:
        return Response("ELEVENLABS_API_KEY not set", status_code=503)
    text = await stt(await file.read(), file.filename, file.content_type)
    return await doctor_said(text)


@app.post("/reset")
async def reset():
    state.update(doctor_said=None, history=[])
    await broadcast({"type": "reset"})
    return {"ok": True}


@app.get("/audio/{name}")
async def audio(name: str):
    path = os.path.join(AUDIO_DIR, os.path.basename(name))
    if not os.path.exists(path):
        return Response(status_code=404)
    return FileResponse(path, media_type="audio/mpeg")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/health")
async def health():
    return {"ok": True, "elevenlabs": bool(EL_KEY), "llm": os.environ.get("LLM_PROVIDER", "adaption"),
            "translate_backend": os.environ.get("TRANSLATE_BACKEND", "fewshot")}


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    if websocket.query_params.get("replay") != "0":  # the web app connects with ?replay=0
        for event in state["history"]:
            await websocket.send_json(event)
    try:
        while True:
            await websocket.receive_text()  # keep-alive; clients only listen
    except WebSocketDisconnect:
        clients.discard(websocket)


app.mount("/", StaticFiles(directory=os.path.join(HERE, "static"), html=True), name="static")
