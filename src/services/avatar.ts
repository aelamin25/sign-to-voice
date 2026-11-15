import { estimateTimings, splitWords, totalDuration, wait, wordsFromCharacters, type WordTiming } from "../lib/timing";
import { api } from "./http";
import type { AvatarService, AvatarTool, Playback, ToolCall } from "./types";

/** Delay between sending audio to Anam and the avatar starting to speak it (captions wait for it). */
const AVATAR_RENDER_DELAY_MS = 350;

/** Tiny event bus for "Anam tool" toasts — fed by real Anam tool calls and by the app. */
function toolBus() {
  const subs = new Set<(t: ToolCall) => void>();
  return {
    emit(t: ToolCall) { subs.forEach((s) => s(t)); },
    on(cb: (t: ToolCall) => void) { subs.add(cb); return () => { subs.delete(cb); }; },
  };
}

/* ── Real: Anam JS SDK. Session token from /api/anam-session (llmId CUSTOMER_CLIENT_V1,
      so Maya never improvises — she only says what talk() sends). ─────────────── */
export function createRealAvatar(): AvatarService {
  const bus = toolBus();
  let client: import("@anam-ai/js-sdk").AnamClient | null = null;
  // ElevenLabs voice mode (audio passthrough): we send Maya ElevenLabs PCM and Anam lip-syncs to it.
  let audioIn: import("@anam-ai/js-sdk").AgentAudioInputStream | null = null;
  let live = false;
  let connecting: Promise<boolean> | null = null;
  let cancelSpeak: (() => void) | null = null;

  // Close the session when the page goes away (tab closed, reloaded, or the code hot-reloaded while
  // developing). An unclosed session keeps the account's single slot busy and blocks the next page.
  const closeNow = () => {
    live = false;
    connecting = null;
    audioIn = null;
    const c = client;
    client = null;
    try { void c?.stopStreaming(); } catch { /* noop */ }
  };
  if (typeof window !== "undefined") window.addEventListener("pagehide", closeNow);
  if (import.meta.hot) import.meta.hot.dispose(closeNow);

  return {
    kind: "real",
    connect(videoElementId) {
      if (live) return Promise.resolve(true);
      if (connecting) return connecting;
      // Anam plans often allow ONE session at a time. A session that was not closed (a reloaded tab,
      // a second tab, the phone view) blocks the next one for a few seconds, so try again before giving up.
      const attempt = async (): Promise<boolean> => {
        let c: import("@anam-ai/js-sdk").AnamClient | null = null;
        try {
          const { sessionToken, voice } = await api<{ sessionToken: string; voice?: "elevenlabs" | "anam" }>("/api/anam-session", {});
          const passthrough = voice === "elevenlabs";
          const { createClient, AnamEvent } = await import("@anam-ai/js-sdk");
          // The doctor's voice goes to Scribe, never to Maya, so Maya needs no microphone.
          c = createClient(sessionToken, passthrough ? { disableInputAudio: true } : undefined);
          const mine = c;
          // Listeners must be attached before streaming starts.
          // "Connected" is not yet "ready to speak": text sent with talk() before the session is ready
          // is silently dropped (seen with the real service: the first sentence never reached the avatar).
          let markReady: () => void = () => undefined;
          const ready = new Promise<void>((resolve) => { markReady = resolve; });
          c.addListener(AnamEvent.SESSION_READY, () => markReady());
          c.addListener(AnamEvent.CONNECTION_CLOSED, () => {
            if (client === mine) { live = false; client = null; connecting = null; }
          });
          c.addListener(AnamEvent.TOOL_CALL_STARTED, (e) => {
            bus.emit({ name: e.toolName, args: e.arguments ?? {}, at: Date.now(), source: "anam" });
          });
          await c.streamToVideoElement(videoElementId);
          // wait for the session to be ready (or 15 s at most) before saying we are live
          await Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, 15000))]);
          // The doctor's voice goes to Scribe, not to Maya.
          if (!passthrough) { try { c.muteInputAudio(); } catch { /* older SDKs */ } }
          // Format Anam expects for passthrough: 16-bit PCM, 16 kHz, mono (what /api/tts-pcm returns).
          audioIn = passthrough ? c.createAgentAudioInputStream({ encoding: "pcm_s16le", sampleRate: 16000, channels: 1 }) : null;
          client = c;
          live = true;
          return true;
        } catch (e) {
          console.warn("[avatar] Anam session did not start:", e);
          // never leave a half-open session behind: it would count against the one-session limit
          try { await c?.stopStreaming(); } catch { /* noop */ }
          return false;
        }
      };
      connecting = (async () => {
        // Two quick tries, so that when the avatar cannot come (her minutes are used up) the sentence
        // is spoken by the stand-in voice after a second or two, not after a long silence.
        for (let i = 0; i < 2; i++) {
          if (i > 0) await wait(1200);
          if (await attempt()) return true;
        }
        console.warn("[avatar] Anam unavailable, using the portrait + ElevenLabs voice");
        connecting = null;
        return false;
      })();
      return connecting;
    },
    isLive: () => live && !!client,
    usesExternalVoice: () => !!audioIn,
    async speak(text: string, words: WordTiming[]) {
      if (!client || !live) throw new Error("Avatar not connected");
      // ElevenLabs voice mode has no Anam voice to talk() with: patient sentences go through
      // voicePlayback(); anything else (e.g. VITE_AVATAR_REPLY) is skipped quietly.
      if (audioIn) { await wait(totalDuration(words) * 1000); return; }
      await client.talk(text);
      // talk() resolves once queued; hold the step for the estimated speaking time.
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, totalDuration(words) * 1000 + 400);
        cancelSpeak = () => { clearTimeout(t); resolve(); };
      });
      cancelSpeak = null;
    },
    async voicePlayback(text: string): Promise<Playback | null> {
      if (!client || !live || !audioIn) return null;
      let res: { audioBase64: string; sampleRate: number; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null };
      try {
        res = await api("/api/tts-pcm", { text });
      } catch (e) {
        console.warn("[avatar] ElevenLabs voice for Maya unavailable, falling back:", e);
        return null;
      }
      const a = res.alignment;
      let words = a ? wordsFromCharacters(a.characters, a.character_start_times_seconds, a.character_end_times_seconds) : estimateTimings(text);
      if (words.length !== splitWords(text).length) words = estimateTimings(text);
      const pcm = Uint8Array.from(atob(res.audioBase64), (ch) => ch.charCodeAt(0));
      const stream = audioIn;
      let stopped = false;
      let resolveWait: (() => void) | null = null;
      return {
        words,
        play: async (onWord) => {
          stopped = false;
          // Anam buffers faster-than-realtime audio and renders lip-sync at the right pace; send in ~0.5 s chunks.
          const CHUNK = 16000; // bytes = 0.5 s at 16 kHz × 2 bytes
          for (let i = 0; i < pcm.length && !stopped; i += CHUNK) stream.sendAudioChunk(pcm.subarray(i, i + CHUNK));
          stream.endSequence();
          // Captions follow the ElevenLabs word timings, offset by Anam's render delay.
          const t0 = performance.now() + AVATAR_RENDER_DELAY_MS;
          const dur = totalDuration(words);
          await new Promise<void>((resolve) => {
            resolveWait = resolve;
            let last = -1;
            const tick = () => {
              if (stopped) { resolve(); return; }
              const t = (performance.now() - t0) / 1000;
              let i = words.findIndex((w) => t < w.end);
              if (i === -1) i = words.length;
              if (i !== last && t >= 0) { last = i; onWord(i); }
              if (t >= dur) { onWord(words.length); resolve(); return; }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        },
        stop: () => {
          stopped = true;
          try { client?.interruptPersona(); } catch { /* noop */ }
          resolveWait?.();
        },
      };
    },
    stop() {
      cancelSpeak?.();
      try { client?.interruptPersona(); } catch { /* not all SDKs */ }
    },
    async disconnect() {
      live = false;
      audioIn = null;
      connecting = null;
      try { await client?.stopStreaming(); } catch { /* noop */ }
      client = null;
    },
    reportTool(name: AvatarTool, args) { bus.emit({ name, args, at: Date.now(), source: "app" }); },
    onToolCall: bus.on,
  };
}

/* ── Mock: the illustrated Maya portrait (animated in AvatarStage) ──── */
export function createMockAvatar(): AvatarService {
  const bus = toolBus();
  return {
    kind: "mock",
    connect: async () => false,
    isLive: () => false,
    async speak(_text, words) { await wait(totalDuration(words) * 1000); },
    stop() { /* noop */ },
    async disconnect() { /* noop */ },
    reportTool(name, args) { bus.emit({ name, args, at: Date.now(), source: "app" }); },
    onToolCall: bus.on,
  };
}
