import { create } from "zustand";
import { compose, painFromGlosses } from "../lib/compose";
import { SPEAK_THRESHOLD, type Gloss } from "../lib/signs";
import { toneOfDoctorLine, withCue, withDoctorCue, type DoctorTone, type Expression } from "../lib/expression";
import { AVATAR_REPLY } from "../app/config";
import { estimateTimings, wait, type WordTiming } from "../lib/timing";
import { pickDoctor, pickPatient, UNCLEAR_TURN } from "../mocks/script";
import { services } from "../services";
import { timerPlayback } from "../services/tts";
import { glossConfidence } from "../services/translate";
import type {
  AvatarTool, GlossEvent, LogItem, Playback, RecognitionSession, SimplifyResult, SttSession, ToolCall, VisitSummaryData,
} from "../services/types";
import { next, type MachineEvent, type Phase } from "./machine";
import { AVATAR_VIDEO_ID, media } from "./media";

export type { Phase } from "./machine";

export interface Chip { id: number; gloss: Gloss; confidence: number }
export interface Speech {
  text: string;
  words: WordTiming[];
  index: number;
  status: "idle" | "talking" | "done";
  confidence: number;
}
export interface Reply {
  text: string;
  plain: string;
  /** how the doctor's line comes across (asking, reassuring, concerned), shown to the patient */
  tone: DoctorTone;
  terms: SimplifyResult["terms"];
  clips: string[];
  words: WordTiming[];
  clipWordIndex?: number[];
  index: number;
  playing: boolean;
  done: boolean;
  playKey: number;
}
export type MenuView = "main" | "log" | "signs" | "how";
export type CameraState = { state: "off" | "starting" | "live" | "unavailable"; message?: string };

export interface State {
  phase: Phase;
  /* patient */
  chips: Chip[];
  /** the patient's face during this turn, when the recogniser reads it; null = not read */
  expression: Expression | null;
  lastChips: Gloss[];
  liveSentence: string;
  checking: boolean;
  uncertainConfidence: number;
  camera: CameraState;
  handsVisible: boolean;
  speech: Speech;
  pain: { area: string | null; level: number } | null;
  /* doctor */
  transcript: string;
  sttError: string | null;
  gen: { progress: number; stage: 0 | 1 | 2 | 3 };
  reply: Reply | null;
  /* visit */
  log: LogItem[];
  patientTurn: number;
  doctorTurn: number;
  unclearNext: boolean;
  summary: VisitSummaryData | null;
  summaryOpen: boolean;
  saved: boolean | null;
  /* chrome */
  menu: MenuView | null;
  tabletop: boolean;
  demo: boolean;
  voice: boolean;
  textSize: 0.9 | 1 | 1.15;
  reducedMotion: boolean;
  toast: ToolCall | null;
}

export interface Actions {
  startSigning(): Promise<void>;
  /** Retry the camera while still on the signing step (e.g. after the permission prompt was dismissed). */
  restartSigning(): Promise<void>;
  doneSigning(): Promise<void>;
  sayAgain(): Promise<void>;
  doctorSpeak(): Promise<void>;
  doneSpeaking(): void;
  replyIndex(i: number): void;
  replyEnded(): void;
  watchAgain(): void;
  tryUnclear(): void;
  endVisit(): Promise<void>;
  newVisit(): void;
  closeSummary(): void;
  setSaved(v: boolean): void;
  playDemo(): Promise<void>;
  stopDemo(): void;
  setMenu(v: MenuView | null): void;
  toggleTabletop(v?: boolean): void;
  toggleVoice(): void;
  toggleReducedMotion(): void;
  setTextSize(v: State["textSize"]): void;
  showToast(t: ToolCall): void;
}

const IDLE_SPEECH: Speech = { text: "", words: [], index: 0, status: "idle", confidence: 0 };

const visitDefaults = (): Pick<State,
  "phase" | "chips" | "expression" | "lastChips" | "liveSentence" | "checking" | "uncertainConfidence" | "camera" | "handsVisible" |
  "speech" | "pain" | "transcript" | "sttError" | "gen" | "reply" | "log" | "patientTurn" | "doctorTurn" |
  "unclearNext" | "summary" | "summaryOpen" | "saved"> => ({
  phase: "start", chips: [], expression: null, lastChips: [], liveSentence: "", checking: false, uncertainConfidence: 0,
  camera: { state: "off" }, handsVisible: false, speech: IDLE_SPEECH, pain: null, transcript: "", sttError: null,
  gen: { progress: 0, stage: 0 }, reply: null, log: [], patientTurn: 0, doctorTurn: 0, unclearNext: false,
  summary: null, summaryOpen: false, saved: null,
});

/* ── async bookkeeping (outside React state) ─────────────────────────── */
let run = 0;          // bumps on every new step; stale async work checks it and bails
let demoRun = 0;
let uid = 0;
let events: GlossEvent[] = [];
let finishing = false;
const active: { recognition?: RecognitionSession; stt?: SttSession; playback?: Playback } = {};

function cancelActive() {
  active.recognition?.stop(); active.recognition = undefined;
  active.stt?.stop(); active.stt = undefined;
  active.playback?.stop(); active.playback = undefined;
  services(false).avatar.stop();
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
}

const prefs = (() => {
  try { return JSON.parse(localStorage.getItem("signbridge.prefs") ?? "{}") as Partial<State>; } catch { return {}; }
})();

export const useStore = create<State & Actions>()((set, get) => {
  const svc = () => services(get().demo);
  const alive = (r: number) => r === run;
  const go = (ev: MachineEvent): Phase | null => next(get().phase, ev);
  const tool = (name: AvatarTool, args: Record<string, unknown>) => svc().avatar.reportTool(name, args);
  const savePrefs = () => {
    const { voice, textSize, reducedMotion } = get();
    try { localStorage.setItem("signbridge.prefs", JSON.stringify({ voice, textSize, reducedMotion })); } catch { /* private mode */ }
  };

  const waitFor = (pred: (s: State) => boolean, ms = 90000) =>
    new Promise<void>((resolve, reject) => {
      if (pred(get())) return resolve();
      const timer = setTimeout(() => { un(); reject(new Error("timeout")); }, ms);
      const un = useStore.subscribe((s) => { if (pred(s)) { clearTimeout(timer); un(); resolve(); } });
    });

  /* ── patient speaks (Maya / ElevenLabs) ──────────────────────────── */
  async function speakPatient(text: string, opts: { log: boolean; glosses?: Gloss[]; confidence: number }) {
    cancelActive();
    const r = ++run;
    const S = svc();
    set({ phase: "speaking", speech: { text, words: estimateTimings(text), index: 0, status: "talking", confidence: opts.confidence }, camera: { state: "off" } });

    if (opts.log && opts.glosses) {
      const pain = painFromGlosses(opts.glosses);
      set((s) => ({
        log: [...s.log, { id: ++uid, who: "patient", text, glosses: opts.glosses!, confidence: opts.confidence, at: Date.now() }],
        patientTurn: s.patientTurn + 1,
        pain: pain.level ? { area: pain.area, level: pain.level } : s.pain,
      }));
      if (pain.level) tool("show_pain_scale", { level: pain.level, area: pain.area?.toLowerCase() ?? "" });
    }
    tool("speak_patient_message", { text });

    // The avatar starts connecting when the patient's turn starts, and a turn from live.py can end
    // almost at once, so the first sentence used to be spoken by the stand-in voice while the avatar
    // was still connecting. Give the connection a few seconds before falling back.
    if (S.avatar.kind === "real" && !S.avatar.isLive()) {
      await Promise.race([S.avatar.connect(AVATAR_VIDEO_ID).catch(() => false), wait(12000)]);
      if (!alive(r)) return;
    }

    let pb: Playback;
    if (S.avatar.isLive()) {
      const words = estimateTimings(text);
      const timer = timerPlayback(words);
      pb = {
        words,
        // the avatar gets a delivery cue from the patient's expression; captions and the log keep the plain text
        play: async (onWord) => { await Promise.all([S.avatar.speak(withCue(text, get().expression), words).catch(() => undefined), timer.play(onWord)]); },
        stop: () => { timer.stop(); S.avatar.stop(); },
      };
    } else {
      pb = await S.tts.synthesize(text, { voice: get().voice });
    }
    if (!alive(r)) { pb.stop(); return; }
    active.playback = pb;
    set((s) => ({ speech: { ...s.speech, words: pb.words } }));
    await pb.play((i) => { if (alive(r)) set((s) => ({ speech: { ...s.speech, index: i } })); });
    if (!alive(r)) return;
    active.playback = undefined;
    set((s) => ({ speech: { ...s.speech, index: s.speech.words.length, status: "done" } }));
  }

  /* ── doctor's transcript → plain words → sign video ───────────────── */
  async function onTranscriptFinal(r: number, text: string) {
    if (!alive(r)) return;
    active.stt = undefined;
    if (!text.trim()) { set({ sttError: "I didn't catch that. Please tap and speak again." }); return; }
    if (!go("TRANSCRIPT_FINAL")) return;
    set({ phase: "generating", transcript: text, gen: { progress: 0.08, stage: 1 } });
    const S = svc();
    const simp = await S.translate.simplify(text);
    if (!alive(r)) return;
    set((s) => ({
      gen: { progress: 0.3, stage: 2 },
      log: [...s.log, { id: ++uid, who: "doctor", text, plain: simp.plain, terms: simp.terms, at: Date.now(), medicine: simp.medicine, next: simp.next }],
      doctorTurn: s.doctorTurn + 1,
    }));
    tool("generate_sign_video", { text: simp.plain });
    const vid = await S.signVideo.generate(simp.plain, (p) => { if (alive(r)) set({ gen: { progress: 0.3 + 0.7 * p, stage: 2 } }); });
    if (!alive(r)) return;
    set({ gen: { progress: 1, stage: 3 } });
    await wait(350);
    if (!alive(r) || !go("VIDEO_READY")) return;
    set((s) => ({
      phase: "watching",
      reply: { text, plain: simp.plain, tone: toneOfDoctorLine(text), terms: simp.terms, clips: vid.clips, words: vid.words, clipWordIndex: vid.clipWordIndex, index: 0, playing: true, done: false, playKey: (s.reply?.playKey ?? 0) + 1 },
    }));
    // Optional (VITE_AVATAR_REPLY=true, live Anam avatar only): the avatar performs the plain-words
    // reply for the patient with a face that matches the doctor's tone. Its sound is switched off
    // for this, because the doctor has just said it aloud.
    if (AVATAR_REPLY && S.avatar.isLive()) {
      const el = document.getElementById(AVATAR_VIDEO_ID) as HTMLVideoElement | null;
      const wasMuted = el?.muted ?? false;
      if (el) el.muted = true;
      void S.avatar.speak(withDoctorCue(simp.plain, toneOfDoctorLine(text)), vid.words)
        .catch(() => undefined)
        .finally(() => { if (el) el.muted = wasMuted; });
    }
  }

  return {
    ...visitDefaults(),
    menu: null,
    tabletop: false,
    demo: false,
    voice: prefs.voice ?? true,
    textSize: prefs.textSize ?? 1,
    reducedMotion: prefs.reducedMotion ?? false,
    toast: null,

    async startSigning() {
      const to = go("START_SIGNING") ?? go("SIGN_AGAIN") ?? go("REPLY_IN_SIGN");
      if (!to) return;
      cancelActive();
      const r = ++run;
      events = [];
      finishing = false;
      const s = get();
      set({
        phase: "signing", chips: [], expression: null, liveSentence: "", checking: false, handsVisible: false,
        lastChips: s.chips.length ? s.chips.map((c) => c.gloss) : s.lastChips,
        camera: { state: "starting" }, speech: IDLE_SPEECH, sttError: null,
      });
      const S = svc();
      if (S.avatar.kind === "real" && !S.avatar.isLive()) void S.avatar.connect(AVATAR_VIDEO_ID);
      // Let the view that owns the camera element mount first (the mobile sign screen appears
      // only after this state change). One frame; no visible effect on the web view.
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
      if (!alive(r)) return;
      const script = s.unclearNext ? UNCLEAR_TURN : pickPatient(s.patientTurn);
      const session = await S.recognition.start({ video: media.video, canvas: media.canvas, script }, {
        onGloss: (e) => {
          if (!alive(r) || finishing) return;
          events.push(e);
          const glosses = events.map((x) => x.gloss);
          set((st) => ({ chips: [...st.chips, { id: ++uid, gloss: e.gloss, confidence: e.confidence }], liveSentence: compose(glosses) }));
        },
        onHands: (p) => { if (alive(r)) set({ handsVisible: p }); },
        onExpression: (e) => { if (alive(r) && !finishing) set({ expression: e }); },
        onAutoEnd: () => { if (alive(r)) void get().doneSigning(); },
        onStatus: (st) => { if (alive(r)) set({ camera: { state: st.camera, message: st.message } }); },
      });
      if (!alive(r)) { session.stop(); return; }
      active.recognition = session;
    },

    async restartSigning() {
      if (get().phase !== "signing") return;
      cancelActive();
      ++run;
      // Step back to the state the signing step came from, then start it again.
      set({ phase: "start" });
      await get().startSigning();
    },

    async doneSigning() {
      if (get().phase !== "signing" || finishing) return;
      finishing = true;
      const r = run;
      active.recognition?.stop(); active.recognition = undefined;
      const glosses = events.map((e) => e.gloss);
      const gc = glossConfidence(events);
      set({ camera: { state: "off" }, handsVisible: false, unclearNext: false });

      const toUncertain = (confidence: number) => {
        if (!alive(r)) return;
        set({ phase: "uncertain", uncertainConfidence: confidence, checking: false });
        tool("request_clarification", { reason: glosses.length ? "low confidence" : "no signs seen", confidence: Math.round(confidence * 100) / 100 });
      };

      // Safety rule: below 0.6 we never speak, and never even ask Claude to guess.
      if (!glosses.length || gc < SPEAK_THRESHOLD) return toUncertain(gc);
      set({ checking: true });
      const tr = await svc().translate.translate(glosses);
      if (!alive(r)) return;
      const confidence = Math.min(gc, tr.confidence);
      if (confidence < SPEAK_THRESHOLD || !tr.sentence.trim()) return toUncertain(confidence);
      set({ checking: false, liveSentence: tr.sentence });
      if (!go("CONFIDENT")) return;
      await speakPatient(tr.sentence, { log: true, glosses, confidence });
    },

    async sayAgain() {
      const { phase, speech } = get();
      if (phase !== "speaking" || speech.status !== "done" || !speech.text) return;
      await speakPatient(speech.text, { log: false, confidence: speech.confidence });
    },

    async doctorSpeak() {
      if (!go("DOCTOR_SPEAK")) return;
      cancelActive();
      const r = ++run;
      set({ phase: "listening", transcript: "", sttError: null, gen: { progress: 0, stage: 0 } });
      try {
        const session = await svc().stt.start({
          onPartial: (t) => { if (alive(r)) set({ transcript: t }); },
          onFinal: (t) => { void onTranscriptFinal(r, t); },
          onError: (m) => { if (alive(r)) set({ sttError: m }); },
        }, { script: pickDoctor(get().doctorTurn) });
        if (!alive(r)) { session.stop(); return; }
        active.stt = session;
      } catch (e) {
        if (!alive(r)) return;
        console.warn("[stt]", e);
        set({ sttError: "The microphone or transcription isn't available. Check the mic permission and try again." });
      }
    },

    doneSpeaking() {
      const s = get();
      if (s.phase !== "listening") return;
      if (s.sttError) { set({ phase: "speaking" }); void get().doctorSpeak(); return; }
      active.stt?.finish();
    },

    replyIndex(i) { set((s) => (s.reply ? { reply: { ...s.reply, index: i } } : {})); },
    replyEnded() { set((s) => (s.reply ? { reply: { ...s.reply, playing: false, done: true, index: s.reply.words.length } } : {})); },
    watchAgain() { set((s) => (s.reply ? { reply: { ...s.reply, playing: true, done: false, index: 0, playKey: s.reply.playKey + 1 } } : {})); },

    tryUnclear() {
      set({ unclearNext: true, menu: null, tabletop: get().tabletop });
      const p = get().phase;
      if (p === "start" || p === "uncertain" || p === "watching" || (p === "speaking" && get().speech.status === "done")) void get().startSigning();
    },

    async endVisit() {
      if (!go("END_VISIT")) return;
      cancelActive();
      ++run;
      tool("create_visit_summary", { messages: get().log.length });
      set({ phase: "ended", menu: null, camera: { state: "off" }, summary: null, summaryOpen: true, saved: null });
      const summary = await svc().translate.summarize(get().log);
      set({ summary });
    },

    newVisit() {
      cancelActive();
      ++run;
      set({ ...visitDefaults() });
    },

    closeSummary() { set({ summaryOpen: false }); },

    setSaved(v) {
      set({ saved: v });
      if (v) {
        try { localStorage.setItem(`signbridge.visit.${new Date().toISOString().slice(0, 10)}`, JSON.stringify(get().summary)); } catch { /* noop */ }
      }
    },

    async playDemo() {
      const d = ++demoRun;
      get().newVisit();
      set({ demo: true, menu: null });
      const ok = () => d === demoRun;
      const pause = async (ms: number) => { await wait(ms); if (!ok()) throw new Error("demo stopped"); };
      const patient = async () => {
        await get().startSigning();
        await waitFor((s) => !ok() || s.phase === "uncertain" || (s.phase === "speaking" && s.speech.status === "done"));
        await pause(900);
      };
      const doctor = async () => {
        await get().doctorSpeak();
        await waitFor((s) => !ok() || (s.phase === "watching" && !!s.reply?.done));
        await pause(1300);
      };
      const unclear = async () => {
        set({ unclearNext: true });
        await get().startSigning();
        await waitFor((s) => !ok() || s.phase === "uncertain");
        await pause(2400);
      };
      try {
        await pause(600);
        await patient();
        await doctor();
        await unclear();
        await patient();
        await doctor();
        await patient();
        await doctor();
        // the agreed demo script has five patient turns: finish the conversation, don't stop mid-question
        await patient();
        await doctor();
        await patient();
        await pause(400);
        await get().endVisit();
      } catch { /* stopped */ }
      if (ok()) set({ demo: false });
    },

    stopDemo() {
      demoRun++;
      set({ demo: false });
      get().newVisit();
    },

    setMenu(v) { set({ menu: v }); },
    toggleTabletop(v) { set((s) => ({ tabletop: v ?? !s.tabletop, menu: null })); },
    toggleVoice() {
      set((s) => ({ voice: !s.voice }));
      if (!get().voice) try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
      savePrefs();
    },
    toggleReducedMotion() { set((s) => ({ reducedMotion: !s.reducedMotion })); savePrefs(); },
    setTextSize(v) { set({ textSize: v }); savePrefs(); },
    showToast(t) { set({ toast: t }); },
  };
});
