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

export const PATIENT_SCRIPT: PatientTurn[] = [
  { glosses: ["HELLO", "DOCTOR", "HURT", "HEAD", "7"], confidence: 0.94 },
  { glosses: ["HOW-LONG", "3", "DAY", "FEVER", "NO"], confidence: 0.91 },
  { glosses: ["THANK-YOU", "DOCTOR"], confidence: 0.95 },
  { glosses: ["YES"], confidence: 0.97 },
  { glosses: ["NO", "THANK-YOU"], confidence: 0.95 },
];

/** "Try an unclear sign" — the classifier only half-recognises the second sign. */
export const UNCLEAR_TURN: PatientTurn = { glosses: ["HURT", "?"], confidence: 0.44 };

export const DOCTOR_SCRIPT: DoctorTurn[] = [
  {
    text: "I'm sorry to hear that. How long have you had it? Any fever?",
    plain: "Sorry you are in pain. How long has it hurt? Do you have a fever?",
    terms: [],
  },
  {
    text: "It sounds like a migraine. I'll prescribe ibuprofen, twice a day after food.",
    plain: "It may be a migraine. Take ibuprofen 2 times a day, after food.",
    terms: [
      { term: "migraine", meaning: "a strong headache" },
      { term: "prescribe", meaning: "give you a medicine" },
      { term: "ibuprofen", meaning: "a pain medicine" },
    ],
    medicine: { name: "Ibuprofen", dose: "2 times a day", when: "After food" },
  },
  {
    text: "Rest, drink plenty of water, and come back in one week if it's not better.",
    plain: "Rest. Drink water. Not better in 1 week? Come back.",
    terms: [],
    next: "In 1 week, if not better",
  },
  {
    text: "Is there anything else you'd like to ask me?",
    plain: "Do you have another question?",
    terms: [],
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
