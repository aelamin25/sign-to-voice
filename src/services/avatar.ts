import { totalDuration, wait, type WordTiming } from "../lib/timing";
import { api } from "./http";
import type { AvatarService, AvatarTool, ToolCall } from "./types";

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
  let live = false;
  let connecting: Promise<boolean> | null = null;
  let cancelSpeak: (() => void) | null = null;

  return {
    kind: "real",
    connect(videoElementId) {
      if (live) return Promise.resolve(true);
      if (connecting) return connecting;
      connecting = (async () => {
        try {
          const { sessionToken } = await api<{ sessionToken: string }>("/api/anam-session", {});
          const { createClient, AnamEvent } = await import("@anam-ai/js-sdk");
          const c = createClient(sessionToken);
          // Listeners must be attached before streaming starts.
          // "Connected" is not yet "ready to speak": text sent with talk() before the session is ready
          // is silently dropped (seen with the real service: the first sentence never reached the avatar).
          let markReady: () => void = () => undefined;
          const ready = new Promise<void>((resolve) => { markReady = resolve; });
          c.addListener(AnamEvent.SESSION_READY, () => markReady());
          c.addListener(AnamEvent.CONNECTION_CLOSED, () => { live = false; client = null; connecting = null; });
          c.addListener(AnamEvent.TOOL_CALL_STARTED, (e) => {
            bus.emit({ name: e.toolName, args: e.arguments ?? {}, at: Date.now(), source: "anam" });
          });
          await c.streamToVideoElement(videoElementId);
          // wait for the session to be ready (or 15 s at most) before saying we are live
          await Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, 15000))]);
          // The doctor's voice goes to Scribe, not to Maya.
          try { c.muteInputAudio(); } catch { /* older SDKs */ }
          client = c;
          live = true;
          return true;
        } catch (e) {
          console.warn("[avatar] Anam unavailable, using the portrait + ElevenLabs voice:", e);
          connecting = null;
          return false;
        }
      })();
      return connecting;
    },
    isLive: () => live && !!client,
    async speak(text: string, words: WordTiming[]) {
      if (!client || !live) throw new Error("Avatar not connected");
      await client.talk(text);
      // talk() resolves once queued; hold the step for the estimated speaking time.
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, totalDuration(words) * 1000 + 400);
        cancelSpeak = () => { clearTimeout(t); resolve(); };
      });
      cancelSpeak = null;
    },
    stop() {
      cancelSpeak?.();
      try { client?.interruptPersona(); } catch { /* not all SDKs */ }
    },
    async disconnect() {
      live = false;
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
