import { estimateTimings, splitWords, type WordTiming } from "../lib/timing";
import { api } from "./http";
import type { SignVideoResult, SignVideoService } from "./types";

/** Signing pace for captions on the sign video (slower than speech). */
const SIGN_WPS = 1.9;

/** Spread caption words across clips: 1:1 when counts match, else evenly by clip. */
function alignWords(plain: string, clips: string[], words?: string[]): Pick<SignVideoResult, "words" | "clipWordIndex"> {
  const w = words?.length ? words : splitWords(plain);
  const timings: WordTiming[] = estimateTimings(w.join(" "), SIGN_WPS);
  if (!clips.length) return { words: timings };
  const per = w.length / clips.length;
  return { words: timings, clipWordIndex: clips.map((_, i) => Math.floor(i * per)) };
}

/* ── Real: POST /api/sign-video {plain} → {clips:[url], words:[...]} ── */
export function createRealSignVideo(): SignVideoService {
  return {
    kind: "real",
    async generate(plain, onProgress) {
      let p = 0;
      const timer = window.setInterval(() => { p = Math.min(0.9, p + 0.04); onProgress(p); }, 120);
      try {
        const res = await api<{ clips: string[]; words?: string[] }>("/api/sign-video", { plain }, 60000);
        onProgress(1);
        return { clips: res.clips ?? [], ...alignWords(plain, res.clips ?? [], res.words) };
      } catch (e) {
        console.warn("[signVideo] falling back to the animated signer:", e);
        onProgress(1);
        return { clips: [], ...alignWords(plain, []) };
      } finally {
        clearInterval(timer);
      }
    },
  };
}

/* ── Mock: progress for ~1.8 s, then the animated signer with captions ── */
export function createMockSignVideo(): SignVideoService {
  return {
    kind: "mock",
    generate(plain, onProgress) {
      return new Promise((resolve) => {
        const t0 = performance.now();
        const dur = 1800;
        const tick = () => {
          const p = Math.min(1, (performance.now() - t0) / dur);
          onProgress(1 - Math.pow(1 - p, 2));
          if (p < 1) setTimeout(tick, 60);
          else resolve({ clips: [], ...alignWords(plain, []) });
        };
        tick();
      });
    },
  };
}
