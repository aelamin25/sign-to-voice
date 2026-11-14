// Word timing helpers for caption highlighting.

export interface WordTiming {
  word: string;
  /** seconds from the start of the audio/clip */
  start: number;
  end: number;
}

export const splitWords = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** Estimate per-word timing when the provider gives none (~2.6 words/s, longer words take longer). */
export function estimateTimings(text: string, wordsPerSecond = 2.6): WordTiming[] {
  const words = splitWords(text);
  const base = 1 / wordsPerSecond;
  let t = 0.15;
  return words.map((word) => {
    const d = base * (0.6 + Math.min(word.length, 12) / 10) + (/[.,?!—]$/.test(word) ? 0.18 : 0);
    const w = { word, start: t, end: t + d };
    t += d;
    return w;
  });
}

/** Collapse ElevenLabs character alignment into word timings. */
export function wordsFromCharacters(chars: string[], starts: number[], ends: number[]): WordTiming[] {
  const out: WordTiming[] = [];
  let cur = "", s = 0, e = 0;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (cur) out.push({ word: cur, start: s, end: e });
      cur = "";
      return;
    }
    if (!cur) s = starts[i];
    cur += c;
    e = ends[i];
  });
  if (cur) out.push({ word: cur, start: s, end: e });
  return out;
}

export const totalDuration = (w: WordTiming[]) => (w.length ? w[w.length - 1].end + 0.25 : 0);

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
