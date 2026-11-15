// The single conversation state machine.
// start → signing → speaking → listening → generating → watching → (reply) signing …
// The doctor can also open the visit: start → listening → generating → watching → signing …
// plus: signing → uncertain (confidence < 0.6, nothing spoken), and any → ended.

export type Phase = "start" | "signing" | "uncertain" | "speaking" | "listening" | "generating" | "watching" | "ended";

export type MachineEvent =
  | "START_SIGNING" | "DONE_SIGNING" | "LOW_CONFIDENCE" | "CONFIDENT"
  | "DOCTOR_SPEAK" | "TRANSCRIPT_FINAL" | "VIDEO_READY" | "REPLY_IN_SIGN"
  | "SIGN_AGAIN" | "END_VISIT" | "NEW_VISIT";

const T: Record<Phase, Partial<Record<MachineEvent, Phase>>> = {
  start: { START_SIGNING: "signing", DOCTOR_SPEAK: "listening", END_VISIT: "ended" },
  signing: { DONE_SIGNING: "signing", LOW_CONFIDENCE: "uncertain", CONFIDENT: "speaking", END_VISIT: "ended" },
  uncertain: { SIGN_AGAIN: "signing", END_VISIT: "ended" },
  speaking: { DOCTOR_SPEAK: "listening", START_SIGNING: "signing", END_VISIT: "ended" },
  listening: { TRANSCRIPT_FINAL: "generating", END_VISIT: "ended" },
  generating: { VIDEO_READY: "watching", END_VISIT: "ended" },
  watching: { REPLY_IN_SIGN: "signing", DOCTOR_SPEAK: "listening", END_VISIT: "ended" },
  ended: { NEW_VISIT: "start" },
};

export function next(phase: Phase, ev: MachineEvent): Phase | null {
  return T[phase][ev] ?? null;
}

/** Step bar: 4 segments. Teal = patient steps, coral = doctor steps. */
export const STEPS = [
  { n: 1, label: "You sign", tone: "teal" },
  { n: 2, label: "Doctor hears you", tone: "coral" },
  { n: 3, label: "Doctor speaks", tone: "coral" },
  { n: 4, label: "You watch", tone: "teal" },
] as const;

export function stepOf(phase: Phase): number {
  switch (phase) {
    case "start": return 0;
    case "signing": case "uncertain": return 1;
    case "speaking": return 2;
    case "listening": case "generating": return 3;
    case "watching": return 4;
    case "ended": return 5;
  }
}

/** Which column is in focus. Only that column shows a primary button. */
export function activeSide(phase: Phase): "patient" | "doctor" {
  return phase === "speaking" || phase === "listening" || phase === "generating" ? "doctor" : "patient";
}
