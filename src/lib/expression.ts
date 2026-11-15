// The patient's face during a turn, read by model/vision/live.py --face.
// In sign language the face is part of the grammar: raised brows mark a question, a strained
// face says "a lot" or "it's bad". Hands alone lose that, so it travels with the signs.

export type Expression = "question" | "strained" | "neutral";

export const isExpression = (v: unknown): v is Expression =>
  v === "question" || v === "strained" || v === "neutral";

/** Shown to the patient next to their signs, so they can see what was understood. */
export const EXPRESSION_LABEL: Record<Expression, string | null> = {
  question: "Asked as a question",
  strained: "Strained expression",
  neutral: null,
};

/** Anam "Director Notes" cue for how the avatar delivers the sentence (Cara 4 avatars; other
 *  avatars ignore it). Anam strips the tag from captions, and we only add it to the text sent
 *  to the avatar, never to what is shown or logged. Best effort: a cue guides the performance,
 *  it does not guarantee an exact face. */
const CUE: Record<Expression, string | null> = {
  question: "[curious]",
  strained: "[sad]",
  neutral: null,
};

export function withCue(text: string, expression: Expression | null | undefined): string {
  const cue = expression ? CUE[expression] : null;
  return cue ? `${cue} ${text}` : text;
}

/* ── The other direction: the tone of the doctor's words, for the patient ─────────────────
   A Deaf patient reading captions gets the words but not how they were said. The tone is shown
   as a label on the reply, and (optionally, with a live Anam avatar) on the avatar's face.
   This is a simple reading of the words themselves, not of the doctor's voice. */

export type DoctorTone = "question" | "reassuring" | "concerned" | "neutral";

const REASSURING = /\b(don'?t worry|no need to worry|nothing serious|not serious|that'?s (good|fine|normal)|it'?s (okay|ok|fine)|should (ease|settle|pass|get better|improve)|sounds like a tension|take care|feel better|well done)\b/i;
/** "nothing serious", "no need to go to hospital", "I'm not worried": a worrying word that is being ruled out. */
const RULED_OUT = /\b(nothing|not|no need|don'?t need|doesn'?t need|isn'?t|aren'?t)\b[^.?!]{0,25}\b(serious|worr|urgent|hospital|emergency|concern)/i;
/** "not good news", "afraid": never label these as reassuring. */
const BAD_NEWS = /\b(afraid|unfortunately|not good news|bad news)\b/i;
const CONCERNED = /\b(i'?m sorry|sorry to hear|worried|concern(ed|ing)?|serious|urgent(ly)?|emergency|hospital|straight away|immediately|right away|call 999)\b/i;

/** How the doctor's line should come across. A question wins: the patient most needs to know
 *  that an answer is expected. */
export function toneOfDoctorLine(text: string): DoctorTone {
  const t = text.trim();
  if (!t) return "neutral";
  if (/\?\s*$/.test(t)) return "question";
  if (BAD_NEWS.test(t)) return "concerned";
  if (RULED_OUT.test(t)) return "reassuring";
  if (CONCERNED.test(t)) return "concerned";
  if (REASSURING.test(t)) return "reassuring";
  return "neutral";
}

export const DOCTOR_TONE_LABEL: Record<DoctorTone, string | null> = {
  question: "The doctor is asking you a question",
  reassuring: "Said in a reassuring way",
  concerned: "Said with concern",
  neutral: null,
};

const DOCTOR_CUE: Record<DoctorTone, string | null> = {
  question: "[curious]",
  reassuring: "[supportive]",
  concerned: "[concerned]",
  neutral: null,
};

export function withDoctorCue(text: string, tone: DoctorTone | null | undefined): string {
  const cue = tone ? DOCTOR_CUE[tone] : null;
  return cue ? `${cue} ${text}` : text;
}
