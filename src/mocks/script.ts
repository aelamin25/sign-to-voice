import type { Gloss } from "../lib/signs";

// The scripted visit from the mockups, ordered so it alternates cleanly
// patient → doctor → patient … in the one-step-at-a-time flow.
// Used by every mock adapter and by "Play the full visit".

export interface PatientTurn {
  glosses: Gloss[];
  /** per-sign classifier confidence, 0–1 */
  confidence: number;
}

export interface DoctorTurn {
  text: string;
  plain: string;
  terms: { term: string; meaning: string }[];
  /** used by the visit summary */
  medicine?: { name: string; dose?: string; when?: string };
  next?: string;
}

// The agreed demo consultation (a headache visit). The doctor greets the patient out loud first;
// the app's flow starts with the patient's answer.
export const PATIENT_SCRIPT: PatientTurn[] = [
  { glosses: ["PAIN", "HEAD"], confidence: 0.96 },
  { glosses: ["THREE", "DAY"], confidence: 0.94 },
  { glosses: ["DONT-UNDERSTAND"], confidence: 0.96 },
  { glosses: ["NO"], confidence: 0.97 },
  { glosses: ["THANK-YOU"], confidence: 0.96 },
];

/** "Try an unclear sign" — the classifier only half-recognises the second sign. */
export const UNCLEAR_TURN: PatientTurn = { glosses: ["HURT", "?"], confidence: 0.44 };

export const DOCTOR_SCRIPT: DoctorTurn[] = [
  {
    text: "I'm sorry to hear that. How long has it been going on?",
    plain: "Sorry you are in pain. How long has it hurt?",
    terms: [],
  },
  {
    text: "Have you taken any analgesia for it?",
    plain: "Have you taken any painkillers for it?",
    terms: [{ term: "analgesia", meaning: "painkillers, medicine for pain" }],
  },
  {
    text: "Have you taken any painkillers, like paracetamol?",
    plain: "Have you taken any pain medicine, like paracetamol?",
    terms: [{ term: "paracetamol", meaning: "a common pain medicine" }],
  },
  {
    text: "This sounds like a tension headache. Take paracetamol, and come back if it isn't better in a week.",
    plain: "It may be a tension headache. Take paracetamol. Not better in 1 week? Come back.",
    terms: [{ term: "tension headache", meaning: "a common headache, often from stress or tiredness" }],
    medicine: { name: "Paracetamol" },
    next: "In 1 week, if not better",
  },
  {
    text: "Take care, and feel better soon.",
    plain: "Take care. Feel better soon.",
    terms: [],
  },
];

export const pickPatient = (i: number) => PATIENT_SCRIPT[Math.min(i, PATIENT_SCRIPT.length - 1)];
export const pickDoctor = (i: number) => DOCTOR_SCRIPT[Math.min(i, DOCTOR_SCRIPT.length - 1)];
/** Find the scripted doctor line for a transcript (mock simplify). */
export const findDoctorTurn = (text: string) =>
  DOCTOR_SCRIPT.find((d) => d.text.trim().toLowerCase() === text.trim().toLowerCase());
