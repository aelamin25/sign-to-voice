import type { Gloss } from "../lib/signs";
import { compose } from "../lib/compose";
import { findDoctorTurn } from "../mocks/script";
import { api } from "./http";
import type { LogItem, SimplifyResult, TranslateResult, TranslateService, VisitSummaryData } from "./types";

/** Confidence from the glosses alone: the weakest sign decides; an unknown sign caps it hard. */
export function glossConfidence(events: { gloss: Gloss; confidence: number }[]): number {
  if (!events.length) return 0;
  const min = Math.min(...events.map((e) => e.confidence));
  return events.some((e) => e.gloss === "?") ? Math.min(min, 0.45) : min;
}

function localSummary(log: LogItem[]): VisitSummaryData {
  const doctor = log.filter((m) => m.who === "doctor");
  const meds = doctor.flatMap((m) => (m.medicine ? [m.medicine] : []));
  const next = [...doctor].reverse().find((m) => m.next)?.next ?? null;
  return {
    said: log.filter((m) => m.who === "patient").map((m) => m.text),
    doctor: doctor.map((m) => m.plain),
    medicines: meds,
    next,
  };
}

/* ── Real: Claude via our server ─────────────────────────────────────── */
export function createRealTranslate(): TranslateService {
  return {
    kind: "real",
    async translate(glosses) {
      try {
        return await api<TranslateResult>("/api/translate", { glosses });
      } catch (e) {
        // Fall back to the deterministic composer; never block the patient.
        console.warn("[translate] falling back to local composer:", e);
        return { sentence: compose(glosses), confidence: glosses.includes("?") ? 0.4 : 0.8 };
      }
    },
    async simplify(text) {
      try {
        return await api<SimplifyResult & { medicine?: { name: string; dose?: string; when?: string } }>("/api/simplify", { text });
      } catch (e) {
        console.warn("[simplify] falling back to exact words:", e);
        return { plain: text, terms: [] };
      }
    },
    async summarize(log) {
      try {
        return await api<VisitSummaryData>("/api/summary", { log: log.map(({ who, text, ...r }) => ({ who, text, plain: "plain" in r ? r.plain : undefined })) });
      } catch (e) {
        console.warn("[summary] falling back to local summary:", e);
        return localSummary(log);
      }
    },
  };
}

/* ── Mock: local composer + scripted plain-words ─────────────────────── */
export function createMockTranslate(): TranslateService {
  return {
    kind: "mock",
    async translate(glosses) {
      await new Promise((r) => setTimeout(r, 260));
      return { sentence: compose(glosses), confidence: glosses.includes("?") ? 0.42 : 0.96 };
    },
    async simplify(text) {
      await new Promise((r) => setTimeout(r, 380));
      const d = findDoctorTurn(text);
      if (d) return { plain: d.plain, terms: d.terms, medicine: d.medicine, next: d.next };
      return { plain: text, terms: [] };
    },
    async summarize(log) {
      await new Promise((r) => setTimeout(r, 300));
      return localSummary(log);
    },
  };
}
