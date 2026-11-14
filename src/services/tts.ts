import { estimateTimings, splitWords, totalDuration, wordsFromCharacters, type WordTiming } from "../lib/timing";
import { api } from "./http";
import type { Playback, TtsService } from "./types";

/** Drive caption highlighting from a clock (audio.currentTime or a timer). */
function trackWords(words: WordTiming[], now: () => number, onWord: (i: number) => void, isDone: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    let last = -1;
    const tick = () => {
      const t = now();
      let i = words.findIndex((w) => t < w.end);
      if (i === -1) i = words.length;
      if (i !== last) { last = i; onWord(i); }
      if (isDone()) { onWord(words.length); resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Silent playback on a timer, used when there is no audio (voice off, or as a fallback). */
export function timerPlayback(words: WordTiming[]): Playback {
  let stopped = false;
  const dur = totalDuration(words);
  return {
    words,
    play(onWord) {
      const t0 = performance.now();
      return trackWords(words, () => (performance.now() - t0) / 1000, onWord, () => stopped || (performance.now() - t0) / 1000 >= dur);
    },
    stop() { stopped = true; },
  };
}

/* ── Real: ElevenLabs TTS with character timestamps (via /api/tts) ───── */
interface TtsResponse {
  audioBase64: string;
  mimeType: string;
  alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
}

export function createRealTts(): TtsService {
  return {
    kind: "real",
    async synthesize(text, { voice }) {
      if (!voice) return timerPlayback(estimateTimings(text));
      let res: TtsResponse;
      try {
        res = await api<TtsResponse>("/api/tts", { text });
      } catch (e) {
        console.warn("[tts] falling back to captions only:", e);
        return timerPlayback(estimateTimings(text));
      }
      const a = res.alignment;
      let words = a ? wordsFromCharacters(a.characters, a.character_start_times_seconds, a.character_end_times_seconds) : estimateTimings(text);
      if (words.length !== splitWords(text).length) words = estimateTimings(text); // keep captions aligned to the text shown
      const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType || "audio/mpeg" }));
      const audio = new Audio(url);
      let ended = false;
      audio.addEventListener("ended", () => { ended = true; });
      audio.addEventListener("error", () => { ended = true; });
      return {
        words,
        async play(onWord) {
          ended = false;
          audio.currentTime = 0;
          try { await audio.play(); } catch (e) {
            console.warn("[tts] autoplay blocked, showing captions only", e);
            await timerPlayback(words).play(onWord);
            return;
          }
          await trackWords(words, () => audio.currentTime, onWord, () => ended || audio.paused);
        },
        stop() { audio.pause(); ended = true; },
      };
    },
  };
}

/* ── Mock: the browser's own voice ("Demo voice"), else a silent timer ── */
export function createMockTts(): TtsService {
  return {
    kind: "mock",
    async synthesize(text, { voice }) {
      const words = estimateTimings(text);
      const ss = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!voice || !ss) return timerPlayback(words);
      let stopped = false;
      return {
        words,
        play(onWord) {
          return new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; onWord(words.length); resolve(); } };
            // Captions run on the estimate; speech boundaries nudge them forward when the browser reports them.
            const timer = timerPlayback(words);
            let idx = 0;
            timer.play((i) => { if (i > idx) { idx = i; onWord(i); } }).then(() => setTimeout(finish, 400));
            try {
              ss.cancel();
              const u = new SpeechSynthesisUtterance(text);
              u.lang = "en-GB";
              u.rate = 0.98;
              u.onboundary = (e) => {
                if (e.name !== "word") return;
                const n = splitWords(text.slice(0, e.charIndex)).length;
                if (n > idx) { idx = n; onWord(n); }
              };
              u.onend = () => { timer.stop(); setTimeout(finish, 200); };
              u.onerror = () => { /* timer keeps going */ };
              if (!stopped) ss.speak(u);
            } catch { /* timer keeps going */ }
            // hard cap so a stuck speech engine never blocks the demo
            setTimeout(() => { timer.stop(); finish(); }, totalDuration(words) * 1700 + 1500);
          });
        },
        stop() { stopped = true; try { ss.cancel(); } catch { /* noop */ } },
      };
    },
  };
}
