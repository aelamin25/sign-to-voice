import { isNumber, type Gloss } from "./signs";

// Local, deterministic gloss → English composer (ported from the mockup).
// Used for the live "English builds as you sign" preview in every mode, and as the
// mock translate adapter. In real mode Claude produces the final sentence.

const LOC: Record<string, string> = {
  HEAD: "I have a headache",
  STOMACH: "I have a stomach ache",
  CHEST: "I have chest pain",
  THROAT: "I have a sore throat",
};

const PHRASE: Record<string, string> = {
  HELLO: "Hello.", DOCTOR: "Doctor.", HURT: "It hurts.", HEAD: "My head.", STOMACH: "My stomach.",
  CHEST: "My chest.", THROAT: "My throat.", FEVER: "I have a fever.", SICK: "I feel sick.",
  DIZZY: "I feel dizzy.", MEDICINE: "About my medicine.", ALLERGY: "I have an allergy.", DAY: "Day.",
  YES: "Yes.", NO: "No.", PLEASE: "Please.", "THANK-YOU": "Thank you.",
  AGAIN: "Could you say that again?", HELP: "I need help.", "HOW-LONG": "How long?",
};

export function compose(input: readonly Gloss[]): string {
  const ch = input.filter((g) => g !== "?");
  const out: string[] = [];
  let i = 0;
  while (i < ch.length) {
    const a = ch[i], b = ch[i + 1], c = ch[i + 2];
    const days = (n: string) => `${n} ${n === "1" ? "day" : "days"}`;
    if (a === "HELLO" && b === "DOCTOR") { out.push("Hello doctor."); i += 2; continue; }
    if (a === "HURT" && b && LOC[b]) {
      if (c && isNumber(c)) { out.push(`${LOC[b]} — about ${c} out of 10.`); i += 3; } else { out.push(LOC[b] + "."); i += 2; }
      continue;
    }
    if (LOC[a] && b === "HURT") {
      if (c && isNumber(c)) { out.push(`${LOC[a]} — about ${c} out of 10.`); i += 3; } else { out.push(LOC[a] + "."); i += 2; }
      continue;
    }
    if (a === "HURT" && b && isNumber(b)) { out.push(`It hurts — about ${b} out of 10.`); i += 2; continue; }
    if (a === "HOW-LONG" && b && isNumber(b) && c === "DAY") { out.push(`About ${days(b)}.`); i += 3; continue; }
    if (isNumber(a) && b === "DAY") { out.push(`For ${days(a)}.`); i += 2; continue; }
    if (a === "FEVER" && b === "NO") { out.push("No fever."); i += 2; continue; }
    if (a === "FEVER" && b === "YES") { out.push("Yes, I have a fever."); i += 2; continue; }
    if (a === "MEDICINE" && b === "ALLERGY") { out.push("I am allergic to a medicine."); i += 2; continue; }
    if (a === "THANK-YOU" && b === "DOCTOR") { out.push("Thank you, doctor."); i += 2; continue; }
    if (a === "PLEASE" && b === "HELP") { out.push("Please help me."); i += 2; continue; }
    out.push(PHRASE[a] ?? (isNumber(a) ? `${a}.` : ""));
    i++;
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Pain level + body area, for the small pain meter shown to the doctor. */
export function painFromGlosses(g: readonly Gloss[]): { area: string | null; level: number | null } {
  const area = g.find((x) => LOC[x]) ?? null;
  const hurt = g.indexOf("HURT");
  const n = hurt >= 0 ? g.slice(hurt).find(isNumber) : undefined;
  return { area: area ? area[0] + area.slice(1).toLowerCase() : null, level: n ? Number(n) : null };
}
