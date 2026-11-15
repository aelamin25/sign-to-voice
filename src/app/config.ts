// Mode switching. VITE_MOCK=true runs every service on its mock adapter (no keys, no server).
// With VITE_MOCK=false, individual services can still be kept mocked with VITE_MOCK_<NAME>=true.

export type ServiceName = "recognition" | "translate" | "tts" | "stt" | "avatar" | "signVideo";

const env = import.meta.env as Record<string, string | undefined>;
const truthy = (v: string | undefined) => v === "true" || v === "1";

/** Default to mock when nothing is configured, so a fresh clone always runs. */
export const ALL_MOCK = env.VITE_MOCK === undefined ? true : truthy(env.VITE_MOCK);

const OVERRIDE: Record<ServiceName, string> = {
  recognition: "VITE_MOCK_RECOGNITION",
  translate: "VITE_MOCK_TRANSLATE",
  tts: "VITE_MOCK_TTS",
  stt: "VITE_MOCK_STT",
  avatar: "VITE_MOCK_AVATAR",
  signVideo: "VITE_MOCK_SIGNVIDEO",
};

export function isMock(s: ServiceName): boolean {
  if (ALL_MOCK) return true;
  return truthy(env[OVERRIDE[s]]);
}

export const API_BASE = env.VITE_API_BASE ?? "";

/** Python backend (model/backend) for the trained models, e.g. http://localhost:8000. Empty = not used. */
/** A phone opening the laptop's address can't use the laptop's "localhost" settings. When the page is
 *  not opened from localhost, a localhost address is swapped for the same service behind this page's own
 *  address (Vite passes /py and /camera through; see vite.config.ts). On the laptop nothing changes. */
function reachable(url: string, via: string): string {
  if (!url || typeof location === "undefined") return url;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/;
  if (!local.test(url) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return url;
  return location.origin + via + url.replace(local, "");
}

export const PY_BACKEND = reachable((env.VITE_PY_BACKEND ?? "").replace(/\/$/, ""), "/py");
/** "python" = signs come from model/vision/live.py through the Python backend instead of the browser recogniser. */
export const RECOGNITION_SOURCE = env.VITE_RECOGNITION ?? "browser";
/** With VITE_RECOGNITION=python: a finished turn from live.py starts the patient's turn by itself,
 *  so nobody has to press "Start signing" / "Reply in sign" with their hands full. Off unless set to true. */
export const AUTO_SIGN = truthy(env.VITE_AUTO_SIGN);
/** One screen is passed back and forth between the patient and the doctor. This is the pause, in
 *  milliseconds, that gives them time to turn it round: before the avatar speaks the patient's sentence
 *  (turn it to the doctor), and before signs are read again after the doctor's reply (turn it back).
 *  VITE_PASS_SECONDS sets it; 0 switches it off (two screens, or the tabletop view). */
const passSeconds = Number(env.VITE_PASS_SECONDS ?? "4");
export const PASS_MS = Number.isFinite(passSeconds) && passSeconds > 0 ? passSeconds * 1000 : 0;
/** With a live Anam avatar: the avatar also performs the doctor's plain-words reply for the patient,
 *  silently, with a face that matches the doctor's tone. Off unless set to true (not yet tried with a
 *  real avatar). The tone label on the reply is shown either way. */
export const AVATAR_REPLY = truthy(env.VITE_AVATAR_REPLY);
/** Camera view served by model/vision/live.py --stream PORT, shown in the patient panel, e.g. http://localhost:8001/video */
// Away from the laptop, ask for live.py's small camera picture (/small): the full one is too heavy for a
// phone link or a hotspot, and several viewers of it starve everything else.
const cameraUrl = env.VITE_CAMERA_STREAM ?? "";
const cameraVia = reachable(cameraUrl, "/camera");
export const CAMERA_STREAM = cameraVia === cameraUrl ? cameraUrl : cameraVia.replace(/\/video(\?.*)?$/, "/small$1");
/** Where a phone sends its own camera's pictures, so live.py reads the signs from the phone's camera
 *  instead of the laptop's (see src/mobile/usePhoneCamera.ts). */
export const CAMERA_POST = CAMERA_STREAM ? CAMERA_STREAM.replace(/\/(video|small)(\?.*)?$/, "/frame") : "";
/** True when signs come from live.py through the Python backend (it owns the camera). */
export const PYTHON_RECOGNITION = !!PY_BACKEND && RECOGNITION_SOURCE === "python";
