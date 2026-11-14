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
