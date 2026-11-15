import type { VisitSummaryData } from "../services/types";

/** Patient-held visit records. Nothing is sent anywhere: a saved visit stays in this browser
 *  (only with the patient's permission) and "Download my copy" gives the patient their own file. */
const PREFIX = "signbridge.visit.";

export interface SavedVisit { date: string; summary: VisitSummaryData }

export function savedVisits(): SavedVisit[] {
  const out: SavedVisit[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const summary = JSON.parse(localStorage.getItem(key) ?? "null") as VisitSummaryData | null;
      if (summary && Array.isArray(summary.said)) out.push({ date: key.slice(PREFIX.length), summary });
    }
  } catch { /* storage unavailable: nothing saved */ }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function forgetVisit(date: string) {
  try { localStorage.removeItem(PREFIX + date); } catch { /* noop */ }
}

export const visitDateLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export function summaryAsText(s: VisitSummaryData, dateLabel: string): string {
  const list = (xs: string[], none: string) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : `- ${none}`);
  const meds = s.medicines.length
    ? s.medicines.map((m) => `- ${m.name}${m.dose ? `, ${m.dose}` : ""}${m.when ? `, ${m.when}` : ""}`).join("\n")
    : "- None given";
  return [
    `My visit, ${dateLabel}`,
    "",
    "What I said",
    list(s.said, "Nothing"),
    "",
    "What the doctor said",
    list(s.doctor, "Nothing"),
    "",
    "Medicine",
    meds,
    "",
    "Next appointment",
    `- ${s.next ?? "Not set"}`,
    "",
    "Written by SignBridge in plain words. Show this to your doctor at your next visit.",
    "",
  ].join("\n");
}

/** Saves the summary as a text file the patient keeps (phone, laptop, print). */
export function downloadSummary(s: VisitSummaryData, isoDate = new Date().toISOString().slice(0, 10)) {
  const blob = new Blob([summaryAsText(s, visitDateLabel(isoDate))], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-visit-${isoDate}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
