import { pickDoctor } from "../mocks/script";
import { api } from "./http";
import type { SttService } from "./types";

/** Silence after the last committed segment before we treat the doctor as finished. */
const END_AFTER_SILENCE_MS = 1800;

/* ── Real: ElevenLabs Scribe v2 realtime, single-use token from /api/scribe-token ── */
export function createRealStt(): SttService {
  return {
    kind: "real",
    async start(h) {
      const { token } = await api<{ token: string }>("/api/scribe-token");
      const { Scribe, RealtimeEvents, CommitStrategy } = await import("@elevenlabs/client");
      const conn = Scribe.connect({
        token,
        modelId: "scribe_v2_realtime",
        commitStrategy: CommitStrategy.VAD,
        vadSilenceThresholdSecs: 0.6,
        microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      let committed = "";
      let partial = "";
      let finished = false;
      let silenceTimer: number | undefined;
      const text = () => [committed, partial].filter(Boolean).join(" ").trim();
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(silenceTimer);
        try { conn.close(); } catch { /* noop */ }
        h.onFinal(text());
      };

      conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (d) => {
        partial = d.text ?? "";
        clearTimeout(silenceTimer);
        h.onPartial(text());
      });
      conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (d) => {
        if (d.text) committed = [committed, d.text].filter(Boolean).join(" ").trim();
        partial = "";
        h.onPartial(text());
        clearTimeout(silenceTimer);
        if (committed) silenceTimer = window.setTimeout(finish, END_AFTER_SILENCE_MS);
      });
      const fail = (e: unknown) => {
        if (finished) return;
        const msg = (e as { message?: string; error?: string })?.message ?? (e as { error?: string })?.error ?? "Transcription error";
        h.onError(String(msg));
      };
      conn.on(RealtimeEvents.ERROR, fail);
      conn.on(RealtimeEvents.AUTH_ERROR, fail);
      conn.on(RealtimeEvents.QUOTA_EXCEEDED, fail);

      return {
        finish() {
          if (finished) return;
          try { conn.commit(); } catch { /* VAD mode may reject manual commit */ }
          // give the last commit a moment to arrive
          window.setTimeout(finish, 450);
        },
        stop() { finished = true; clearTimeout(silenceTimer); try { conn.close(); } catch { /* noop */ } },
      };
    },
  };
}

/* ── Mock: stream the scripted doctor line word by word ─────────────── */
export function createMockStt(): SttService {
  return {
    kind: "mock",
    async start(h, { script }) {
      const turn = script ?? pickDoctor(0);
      const words = turn.text.split(" ");
      const timers: number[] = [];
      let i = 0, stopped = false, done = false;
      const final = () => { if (!done && !stopped) { done = true; timers.forEach(clearTimeout); h.onFinal(turn.text); } };
      const step = () => {
        if (stopped || done) return;
        i++;
        h.onPartial(words.slice(0, i).join(" "));
        if (i < words.length) timers.push(window.setTimeout(step, 115 + ((i * 53) % 90)));
        else timers.push(window.setTimeout(final, 900));
      };
      timers.push(window.setTimeout(step, 700));
      return {
        finish: final,
        stop() { stopped = true; timers.forEach(clearTimeout); },
      };
    },
  };
}
