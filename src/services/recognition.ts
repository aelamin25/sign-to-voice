import type {
  GlossEvent, Landmark, LandmarkFrame, RecognitionHandlers, RecognitionService, RecognitionSession,
  RecognitionStartOptions, SignClassifier,
} from "./types";
import { isKnownGloss, type Gloss } from "../lib/signs";
import { pickPatient } from "../mocks/script";

/** Hands down for this long (after at least one sign) ends the turn on its own. */
export const AUTO_END_MS = 1200;

/* ════════════════════════════════════════════════════════════════════
   Classifier stub — keyboard driven, for testing the real camera path.
   1 HELLO · 2 DOCTOR · 3 HURT · 4 HEAD · 5 FEVER · 6 YES · 7 NO · 8 THANK-YOU · 9 unclear
   Shift + 1…9 → numbers 1…9, Shift + 0 → 10.
   Replace with the trained model: implement SignClassifier and pass it to createRealRecognition().
   ════════════════════════════════════════════════════════════════════ */
export const KEY_MAP: Record<string, Gloss> = {
  "1": "HELLO", "2": "DOCTOR", "3": "HURT", "4": "HEAD", "5": "FEVER",
  "6": "YES", "7": "NO", "8": "THANK-YOU", "9": "?",
};

export class KeyboardClassifier implements SignClassifier {
  private queue: GlossEvent[] = [];
  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const m = /^Digit(\d)$/.exec(e.code);
    if (!m) return;
    const d = m[1];
    if (e.shiftKey) {
      this.queue.push({ gloss: (d === "0" ? "10" : d) as Gloss, confidence: 0.93 });
    } else if (KEY_MAP[d]) {
      const g = KEY_MAP[d];
      this.queue.push({ gloss: g, confidence: g === "?" ? 0.41 : 0.92 });
    }
  };
  constructor() { window.addEventListener("keydown", this.onKey); }
  push(_frame: LandmarkFrame): GlossEvent | null { return this.queue.shift() ?? null; }
  reset() { this.queue = []; }
  dispose() { window.removeEventListener("keydown", this.onKey); }
}

/* ════════════════════════════════════════════════════════════════════
   Real adapter: getUserMedia + MediaPipe tasks-vision (HandLandmarker + PoseLandmarker)
   ════════════════════════════════════════════════════════════════════ */
const TASKS_VERSION = "1.2.3"; // keep in sync with package.json
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type Vision = typeof import("@mediapipe/tasks-vision");
type Landmarkers = { hand: import("@mediapipe/tasks-vision").HandLandmarker; pose: import("@mediapipe/tasks-vision").PoseLandmarker | null; vision: Vision };
let landmarkersPromise: Promise<Landmarkers> | null = null;

async function loadLandmarkers(): Promise<Landmarkers> {
  if (!landmarkersPromise) {
    landmarkersPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      const make = async (delegate: "GPU" | "CPU") => {
        const hand = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate },
          runningMode: "VIDEO",
          numHands: 2,
        });
        let pose: Landmarkers["pose"] = null;
        try {
          pose = await vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: POSE_MODEL, delegate },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        } catch { pose = null; /* hands are enough to run */ }
        return { hand, pose, vision };
      };
      try { return await make("GPU"); } catch { return await make("CPU"); }
    })();
    landmarkersPromise.catch(() => { landmarkersPromise = null; });
  }
  return landmarkersPromise;
}

const TEAL = "rgba(110,220,204,0.95)";
const TEAL_DIM = "rgba(110,220,204,0.55)";
const PEACH = "rgba(255,225,211,0.9)";
const POSE_UPPER: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24]];

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: LandmarkFrame, conns: { start: number; end: number }[]) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  if (frame.pose) {
    ctx.strokeStyle = TEAL_DIM; ctx.lineWidth = 3;
    for (const [a, b] of POSE_UPPER) {
      const p = frame.pose[a], q = frame.pose[b];
      if (!p || !q || (p.visibility ?? 1) < 0.5 || (q.visibility ?? 1) < 0.5) continue;
      ctx.beginPath(); ctx.moveTo(p.x * w, p.y * h); ctx.lineTo(q.x * w, q.y * h); ctx.stroke();
    }
    ctx.fillStyle = PEACH;
    for (const i of [0, 2, 5, 9, 10]) { const p = frame.pose[i]; if (p && (p.visibility ?? 1) > 0.5) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 3, 0, 7); ctx.fill(); } }
  }
  for (const hand of frame.hands) {
    ctx.strokeStyle = TEAL_DIM; ctx.lineWidth = 2;
    for (const c of conns) {
      const p = hand.landmarks[c.start], q = hand.landmarks[c.end];
      ctx.beginPath(); ctx.moveTo(p.x * w, p.y * h); ctx.lineTo(q.x * w, q.y * h); ctx.stroke();
    }
    ctx.fillStyle = TEAL;
    for (const p of hand.landmarks) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 3.2, 0, 7); ctx.fill(); }
  }
}

export function createRealRecognition(makeClassifier: () => SignClassifier = () => new KeyboardClassifier()): RecognitionService {
  return {
    kind: "real",
    async start(opts: RecognitionStartOptions, h: RecognitionHandlers): Promise<RecognitionSession> {
      const classifier = makeClassifier();
      let stopped = false;
      let stream: MediaStream | null = null;
      let raf = 0;
      let glossCount = 0;
      let lastActivity = performance.now();
      let handsWere = false;

      // Classifier events and the auto-end keep working even if the camera fails,
      // so the keyboard stub can always drive the flow.
      const emptyFrame = (): LandmarkFrame => ({ t: performance.now(), hands: [], pose: null });
      const tickNoCamera = () => {
        if (stopped) return;
        const ev = classifier.push(emptyFrame());
        if (ev) { glossCount++; lastActivity = performance.now(); h.onGloss(ev); }
        if (glossCount > 0 && performance.now() - lastActivity > AUTO_END_MS + 1300) { h.onAutoEnd(); return; }
        raf = requestAnimationFrame(tickNoCamera);
      };

      const stop = () => {
        stopped = true;
        cancelAnimationFrame(raf);
        stream?.getTracks().forEach((t) => t.stop());
        if (opts.video) opts.video.srcObject = null;
        const ctx = opts.canvas?.getContext("2d");
        if (ctx && opts.canvas) ctx.clearRect(0, 0, opts.canvas.width, opts.canvas.height);
        classifier.dispose?.();
      };

      const describe = (err: unknown, fallback: string) =>
        err instanceof Error ? err.message : typeof err === "string" ? err : fallback;

      h.onStatus?.({ camera: "starting" });
      // 1) camera
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("this browser has no camera access");
        if (!opts.video) throw new Error("camera view not ready");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return { stop }; }
        opts.video.srcObject = stream;
        opts.video.muted = true;
        opts.video.playsInline = true;
        await opts.video.play();
      } catch (err) {
        h.onStatus?.({ camera: "unavailable", message: describe(err, "permission denied") });
        stream?.getTracks().forEach((t) => t.stop());
        raf = requestAnimationFrame(tickNoCamera);
        return { stop };
      }
      // 2) MediaPipe models (camera stays on even if these fail)
      let lm: Landmarkers;
      try {
        lm = await loadLandmarkers();
      } catch (err) {
        if (stopped) return { stop };
        h.onStatus?.({ camera: "unavailable", message: describe(err, "the hand-tracking model could not be downloaded (check the internet connection)") });
        raf = requestAnimationFrame(tickNoCamera);
        return { stop };
      }
      if (stopped) return { stop };
      h.onStatus?.({ camera: "live" });

      const video = opts.video;
      const conns = lm.vision.HandLandmarker.HAND_CONNECTIONS;
      const ctx = opts.canvas?.getContext("2d") ?? null;
      let lastVideoTime = -1;
      const loop = () => {
        if (stopped) return;
        const now = performance.now();
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const hr = lm.hand.detectForVideo(video, now);
          const pr = lm.pose ? lm.pose.detectForVideo(video, now) : null;
          const frame: LandmarkFrame = {
            t: now,
            hands: hr.landmarks.map((l, i) => ({ landmarks: l as Landmark[], handedness: hr.handedness[i]?.[0]?.categoryName ?? "?" })),
            pose: (pr?.landmarks?.[0] as Landmark[] | undefined) ?? null,
          };
          if (ctx && opts.canvas) {
            if (opts.canvas.width !== video.videoWidth) { opts.canvas.width = video.videoWidth; opts.canvas.height = video.videoHeight; }
            draw(ctx, opts.canvas.width, opts.canvas.height, frame, conns);
          }
          const present = frame.hands.length > 0;
          if (present !== handsWere) { handsWere = present; h.onHands?.(present); }
          if (present) lastActivity = now;
          const ev = classifier.push(frame);
          if (ev) { glossCount++; lastActivity = now; h.onGloss(ev); }
          if (glossCount > 0 && !present && now - lastActivity > AUTO_END_MS) { h.onAutoEnd(); return; }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return { stop };
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   Mock adapter: plays a scripted turn, ~680 ms per sign, then "lowers hands".
   ════════════════════════════════════════════════════════════════════ */
export function createMockRecognition(): RecognitionService {
  return {
    kind: "mock",
    async start(opts, h) {
      const turn = opts.script ?? pickPatient(0);
      const timers: number[] = [];
      let stopped = false;
      h.onStatus?.({ camera: "live" });
      h.onHands?.(true);
      turn.glosses.forEach((g, i) => {
        timers.push(window.setTimeout(() => {
          if (stopped) return;
          const jitter = g === "?" ? 0 : (((i * 37) % 7) - 3) / 100;
          h.onGloss({ gloss: g, confidence: g === "?" ? turn.confidence : Math.min(0.99, turn.confidence + jitter) });
        }, 700 + i * 680));
      });
      const lowered = 700 + turn.glosses.length * 680 + 250;
      timers.push(window.setTimeout(() => { if (!stopped) h.onHands?.(false); }, lowered));
      timers.push(window.setTimeout(() => { if (!stopped) h.onAutoEnd(); }, lowered + AUTO_END_MS));
      return { stop() { stopped = true; timers.forEach(clearTimeout); } };
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   Bridge adapter: signs come from the trained recogniser (model/vision/live.py),
   which owns the camera, through the Python backend (model/backend) websocket.
     live.py --send http://<backend>:8000/phrase   → {"type":"phrase","tokens":[...],"confs":[...]}
   A phrase ends the patient's turn (live.py sends it on THUMBS-UP or after ~1.5 s of rest).
   ════════════════════════════════════════════════════════════════════ */
const MODEL_TO_GLOSS: Record<string, Gloss> = {};
const toGloss = (t: string): Gloss | null => {
  if (t === "THUMBS-UP" || t === "FIDGET" || t === "NOTHING") return null; // approval / non-signs: never shown
  if (t === "?") return "?";
  if (MODEL_TO_GLOSS[t]) return MODEL_TO_GLOSS[t];
  return isKnownGloss(t) ? t : "?";
};

/** How long to wait for the first sign from live.py before hinting that it may not be running. */
export const BRIDGE_IDLE_HINT_MS = 8000;

export function createBridgeRecognition(base: string): RecognitionService {
  return {
    kind: "real",
    async start(_opts: RecognitionStartOptions, h: RecognitionHandlers): Promise<RecognitionSession> {
      h.onStatus?.({ camera: "starting", message: "Connecting to the sign recogniser…" });
      const url = base.replace(/^http/, "ws") + "/ws?replay=0";
      let ws: WebSocket | null = null;
      let stopped = false;
      let emitted = 0; // signs already shown this turn
      const emit = (token: string, conf: number) => {
        const g = toGloss(token);
        if (!g) return;
        emitted++;
        h.onGloss({ gloss: g, confidence: conf });
      };
      // If the backend is up but nothing ever arrives, live.py is probably not running: say so.
      let idleTimer = 0;
      const armIdleHint = () => {
        clearTimeout(idleTimer);
        if (emitted > 0) return;
        idleTimer = window.setTimeout(() => {
          if (!stopped && emitted === 0) {
            h.onStatus?.({ camera: "live", message: `No signs arriving yet. Is model/vision/live.py running with --send ${base}/phrase?` });
          }
        }, BRIDGE_IDLE_HINT_MS);
      };
      const connect = () => {
        if (stopped) return;
        try { ws = new WebSocket(url); } catch {
          h.onStatus?.({ camera: "unavailable", message: `Invalid backend address: ${base}` });
          return;
        }
        ws.onopen = () => { h.onStatus?.({ camera: "live", message: "Signing camera: sign recognition app" }); armIdleHint(); };
        ws.onclose = () => {
          if (stopped) return;
          clearTimeout(idleTimer);
          h.onStatus?.({ camera: "unavailable", message: `Can't reach the sign recogniser at ${base}. Start model/backend (uvicorn server:app --port 8000). Retrying…` });
          setTimeout(connect, 1500);
        };
        ws.onmessage = (m) => {
          let ev: { type?: string; token?: string; conf?: number; tokens?: string[]; confs?: number[] };
          try { ev = JSON.parse(String(m.data)); } catch { return; }
          if (ev.type === "sign" && ev.token) {
            if (emitted === 0) h.onStatus?.({ camera: "live", message: "Signing camera: sign recognition app" });
            h.onHands?.(true);
            emit(ev.token, ev.conf ?? 0.9);
          } else if (ev.type === "phrase" && ev.tokens) {
            // Any signs not already shown live, then the turn is over.
            const signs = ev.tokens.map((t, i) => ({ t, c: ev.confs?.[i] ?? 0.9 })).filter((x) => toGloss(x.t) !== null);
            signs.slice(emitted).forEach((x) => emit(x.t, x.c));
            h.onHands?.(false);
            if (emitted > 0) h.onAutoEnd();
          }
        };
      };
      connect();
      return {
        stop() {
          stopped = true;
          clearTimeout(idleTimer);
          try { ws?.close(); } catch { /* already closed */ }
        },
      };
    },
  };
}
