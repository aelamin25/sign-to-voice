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

/* ── Trained language model (model/lang via model/backend) ────────────
   Sentences come from our model, which also sees the doctor's last line as context.
   Plain-words and the visit summary stay with the inner adapter. Any failure falls back to it. */
const MODEL_ALIAS: Record<string, string> = { HURT: "PAIN", "3": "THREE" };

export function createModelTranslate(base: string, inner: TranslateService): TranslateService {
  let lastDoctor: string | null = null;
  return {
    kind: "real",
    async translate(glosses) {
      const tokens = glosses.map((g) => MODEL_ALIAS[g] ?? g);
      try {
        const r = await fetch(`${base}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens, doctor_said: lastDoctor }),
          signal: AbortSignal.timeout(6000), // a slow model must not leave the patient waiting: fall back
        });
        if (!r.ok) throw new Error(`model backend ${r.status}`);
        const { text } = (await r.json()) as { text: string };
        if (!text?.trim()) throw new Error("empty sentence");
        return { sentence: text.trim(), confidence: glosses.includes("?") ? 0.45 : 0.95 };
      } catch (e) {
        console.warn("[translate] model backend failed, using fallback:", e);
        return inner.translate(glosses);
      }
    },
    async simplify(text) {
      lastDoctor = text;
      const first = await inner.simplify(text);
      // The inner adapter (Claude, or the scripted lines) changed the wording: use it, it also explains the jargon.
      if (first.plain.trim() && first.plain.trim() !== text.trim()) return first;
      // It could not (no Claude key, or a line it doesn't know): ask our own language model in the
      // Python backend, which runs on the team's Adaption-hosted model by default.
      try {
        const r = await fetch(`${base}/simplify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) throw new Error(`model backend ${r.status}`);
        const { text: plain } = (await r.json()) as { text: string };
        if (!plain?.trim()) throw new Error("empty plain-words line");
        return { ...first, plain: plain.trim() };
      } catch (e) {
        console.warn("[simplify] model backend failed, keeping the exact words:", e);
        return first;
      }
    },
    summarize: (log) => inner.summarize(log),
  };
}
