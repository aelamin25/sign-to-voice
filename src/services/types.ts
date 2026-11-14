import type { Gloss } from "../lib/signs";
import type { WordTiming } from "../lib/timing";
import type { DoctorTurn, PatientTurn } from "../mocks/script";

// Every external service sits behind one of these interfaces.
// Each has a real adapter and a mock adapter; see services/index.ts.

export type AdapterKind = "mock" | "real";

/* ── recognition.ts ─────────────────────────────────────────────────── */
export interface GlossEvent {
  gloss: Gloss;
  /** 0–1 */
  confidence: number;
}

export interface Landmark { x: number; y: number; z?: number; visibility?: number }
export interface LandmarkFrame {
  /** ms, performance.now() */
  t: number;
  hands: { landmarks: Landmark[]; handedness: "Left" | "Right" | string }[];
  pose: Landmark[] | null;
}

/** Pluggable sign classifier. The ML teammate implements this and drops it into recognition.ts. */
export interface SignClassifier {
  /** Called every processed frame. Return a gloss when one is confidently segmented, else null. */
  push(frame: LandmarkFrame): GlossEvent | null;
  reset(): void;
  dispose?(): void;
}

export interface RecognitionHandlers {
  onGloss(e: GlossEvent): void;
  /** hands visible in frame (drives the auto-end) */
  onHands?(present: boolean): void;
  /** recogniser decided the patient finished (hands lowered ~1.2 s, or script ended) */
  onAutoEnd(): void;
  onStatus?(s: { camera: "starting" | "live" | "unavailable"; message?: string }): void;
}

export interface RecognitionStartOptions {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  /** mock only: which scripted turn to play */
  script?: PatientTurn;
}

export interface RecognitionSession { stop(): void }

export interface RecognitionService {
  kind: AdapterKind;
  start(opts: RecognitionStartOptions, h: RecognitionHandlers): Promise<RecognitionSession>;
}

/* ── translate.ts (Claude, server-side) ─────────────────────────────── */
export interface TranslateResult { sentence: string; confidence: number }
export interface SimplifyResult { plain: string; terms: { term: string; meaning: string }[] }

export interface VisitSummaryData {
  said: string[];
  doctor: string[];
  medicines: { name: string; dose?: string; when?: string }[];
  next: string | null;
}

export type LogItem =
  | { id: number; who: "patient"; text: string; glosses: Gloss[]; confidence: number; at: number }
  | { id: number; who: "doctor"; text: string; plain: string; terms: SimplifyResult["terms"]; at: number; medicine?: DoctorTurn["medicine"]; next?: string };

export interface TranslateService {
  kind: AdapterKind;
  translate(glosses: Gloss[]): Promise<TranslateResult>;
  simplify(text: string): Promise<SimplifyResult & { medicine?: DoctorTurn["medicine"]; next?: string }>;
  summarize(log: LogItem[]): Promise<VisitSummaryData>;
}

/* ── tts.ts (ElevenLabs) ────────────────────────────────────────────── */
export interface Playback {
  words: WordTiming[];
  /** resolves when finished or stopped; onWord gets the index of the word being spoken */
  play(onWord: (index: number) => void): Promise<void>;
  stop(): void;
}

export interface TtsService {
  kind: AdapterKind;
  synthesize(text: string, opts: { voice: boolean }): Promise<Playback>;
}

/* ── stt.ts (ElevenLabs Scribe realtime) ────────────────────────────── */
export interface SttHandlers {
  onPartial(text: string): void;
  onFinal(text: string): void;
  onError(message: string): void;
}
export interface SttSession {
  /** doctor tapped "Done speaking": commit what we have and finish */
  finish(): void;
  /** abort without a final */
  stop(): void;
}
export interface SttService {
  kind: AdapterKind;
  start(h: SttHandlers, opts: { script?: DoctorTurn }): Promise<SttSession>;
}

/* ── avatar.ts (Anam) ───────────────────────────────────────────────── */
export type AvatarTool =
  | "speak_patient_message"
  | "request_clarification"
  | "generate_sign_video"
  | "create_visit_summary"
  | "show_pain_scale";

export interface ToolCall { name: AvatarTool | string; args: Record<string, unknown>; at: number; source: "app" | "anam" }

export interface AvatarService {
  kind: AdapterKind;
  /** stream Maya into the <video> with this id. Safe to call more than once. */
  connect(videoElementId: string): Promise<boolean>;
  isLive(): boolean;
  /** Maya says exactly this text (lip-synced). Resolves when she has finished (estimated). */
  speak(text: string, words: WordTiming[]): Promise<void>;
  stop(): void;
  disconnect(): Promise<void>;
  /** surface a tool call (from Anam or mirrored by the app) as a toast */
  reportTool(name: AvatarTool, args: Record<string, unknown>): void;
  onToolCall(cb: (t: ToolCall) => void): () => void;
}

/* ── signVideo.ts ───────────────────────────────────────────────────── */
export interface SignVideoResult {
  /** clip URLs played in sequence; empty = use the animated signer */
  clips: string[];
  /** caption words with timings relative to the whole sequence */
  words: WordTiming[];
  /** for each clip, the index of the first caption word it shows (when known) */
  clipWordIndex?: number[];
}
export interface SignVideoService {
  kind: AdapterKind;
  generate(plain: string, onProgress: (p: number) => void): Promise<SignVideoResult>;
}

export interface Services {
  recognition: RecognitionService;
  translate: TranslateService;
  tts: TtsService;
  stt: SttService;
  avatar: AvatarService;
  signVideo: SignVideoService;
}
