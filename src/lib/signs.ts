// The 20-sign medical ASL prototype vocabulary, plus numbers 1–10.
// This is the ONLY vocabulary SignBridge claims to understand. Never imply general ASL.

export const SIGNS = [
  "HELLO", "DOCTOR", "HURT", "HEAD", "STOMACH", "CHEST", "THROAT", "FEVER", "SICK", "DIZZY",
  "MEDICINE", "ALLERGY", "HOW-LONG", "DAY", "YES", "NO", "PLEASE", "THANK-YOU", "AGAIN", "HELP",
] as const;
export const NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

export type Sign = (typeof SIGNS)[number];
export type NumberSign = (typeof NUMBERS)[number];
/** A recognised gloss. "?" means the classifier saw a sign it could not place. */
export type Gloss = Sign | NumberSign | "?";

export const isNumber = (g: string): g is NumberSign => /^\d+$/.test(g);
export const isKnownGloss = (g: string): g is Gloss =>
  g === "?" || (SIGNS as readonly string[]).includes(g) || (NUMBERS as readonly string[]).includes(g);

/** Display label for a gloss chip. */
export const glossLabel = (g: Gloss): string =>
  g === "?" ? "Unclear" : g === "HURT" ? "HURT / PAIN" : g;

/** Icon name (see components/Icon.tsx) for each sign. */
export const SIGN_ICON: Record<Sign, string> = {
  HELLO: "hand", DOCTOR: "steth", HURT: "hurt", HEAD: "head", STOMACH: "stomach", CHEST: "chest",
  THROAT: "throat", FEVER: "fever", SICK: "sick", DIZZY: "dizzy", MEDICINE: "med", ALLERGY: "allergy",
  "HOW-LONG": "clock", DAY: "sun", YES: "yes", NO: "no", PLEASE: "please", "THANK-YOU": "heart",
  AGAIN: "again", HELP: "help",
};

/** Patient-side confidence threshold. Below this, nothing is ever spoken. */
export const SPEAK_THRESHOLD = 0.6;
