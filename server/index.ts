// SignBridge API server. Holds every key; the browser only ever talks to /api/*.
// Run: npm run server   (or `npm run dev` for web + api together)
import "dotenv/config";
import express, { type Request, type Response } from "express";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = Number(env.PORT ?? 8787);
const CLIPS_DIR = join(__dirname, "sign-clips");

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use("/sign-clips", express.static(CLIPS_DIR, { maxAge: "1h" }));

const need = (name: string) => {
  const v = env[name];
  if (!v) throw Object.assign(new Error(`${name} is not set on the server (.env)`), { status: 503 });
  return v;
};

const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[${req.method} ${req.path}]`, message);
    res.status(status).json({ error: message });
  }
};

/* ── Claude ────────────────────────────────────────────────────────── */
const VOCAB = "HELLO, DOCTOR, HURT (also PAIN), HEAD, STOMACH, CHEST, THROAT, FEVER, SICK, DIZZY, MEDICINE, ALLERGY, HOW-LONG, DAY, YES, NO, PLEASE, THANK-YOU, AGAIN, HELP, and numbers 1-10";

async function claudeJSON<T>(system: string, user: string, maxTokens = 600): Promise<T> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": need("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw Object.assign(new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: 502 });
  const data = (await r.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw Object.assign(new Error("Claude returned no JSON"), { status: 502 });
  return JSON.parse(m[0]) as T;
}

app.post("/api/translate", handle(async (req, res) => {
  const glosses: string[] = Array.isArray(req.body?.glosses) ? req.body.glosses.map(String).slice(0, 40) : [];
  if (!glosses.length) return res.json({ sentence: "", confidence: 0 });
  const out = await claudeJSON<{ sentence: string; confidence: number }>(
    `You turn ASL gloss sequences from a Deaf patient at a doctor's appointment into one short, natural first-person English message the patient wants spoken aloud to the doctor.
The recogniser only knows this 20-sign medical vocabulary: ${VOCAB}. "?" means a sign was not recognised.
Rules:
- Use only meaning present in the glosses. Never add symptoms, numbers, durations or facts. Numbers after HURT are a pain score out of 10.
- Keep it short and plain, as the patient would say it.
- confidence (0 to 1) = how sure you are that the sentence is what the patient meant. If any "?" is present, or the glosses do not form a clear meaning, confidence must be below 0.5.
Reply with JSON only: {"sentence": "...", "confidence": 0.0}`,
    `Glosses: ${glosses.join(" ")}`,
    300,
  );
  res.json({ sentence: String(out.sentence ?? "").trim(), confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)) });
}));

app.post("/api/simplify", handle(async (req, res) => {
  const text = String(req.body?.text ?? "").slice(0, 2000);
  if (!text.trim()) return res.json({ plain: "", terms: [] });
  const out = await claudeJSON<{ plain: string; terms: { term: string; meaning: string }[]; medicine?: { name: string; dose?: string; when?: string } | null; next?: string | null }>(
    `You help a Deaf patient understand their doctor. Rewrite what the doctor said in very plain English for someone whose first language is ASL:
short sentences, common words, digits for numbers, keep every instruction, dose and timing exactly, no new advice.
List each medical or technical word the doctor used (as it appears in their words) with a short plain meaning, e.g. {"term":"migraine","meaning":"a strong headache"}.
If a medicine was prescribed, give it in "medicine" (name, dose like "2 times a day", when like "After food"), else null.
If a follow-up/next appointment was mentioned, give it in "next" in plain words, else null.
Reply with JSON only: {"plain":"...","terms":[...],"medicine":null,"next":null}`,
    `Doctor said: ${text}`,
    700,
  );
  res.json({
    plain: String(out.plain ?? text),
    terms: Array.isArray(out.terms) ? out.terms.filter((t) => t?.term && t?.meaning).slice(0, 8) : [],
    medicine: out.medicine ?? undefined,
    next: out.next ?? undefined,
  });
}));

app.post("/api/summary", handle(async (req, res) => {
  const log: { who: string; text: string; plain?: string }[] = Array.isArray(req.body?.log) ? req.body.log.slice(0, 100) : [];
  const transcript = log.map((m) => `${m.who === "patient" ? "Patient" : "Doctor"}: ${m.text}`).join("\n");
  const out = await claudeJSON(
    `Write a visit summary for a Deaf patient, in plain words. Only use what is in the transcript.
JSON only: {"said":["what the patient said, one item per message"],"doctor":["what the doctor said, plain words, one item per message"],"medicines":[{"name":"","dose":"","when":""}],"next":"next appointment in plain words, or null"}`,
    transcript || "(empty visit)",
    900,
  );
  res.json(out);
}));

/* ── ElevenLabs ────────────────────────────────────────────────────── */
app.post("/api/tts", handle(async (req, res) => {
  const text = String(req.body?.text ?? "").slice(0, 1000);
  if (!text.trim()) throw Object.assign(new Error("text is required"), { status: 400 });
  const voice = need("ELEVENLABS_VOICE_ID");
  // with-timestamps returns base64 audio + character alignment, used for word-by-word captions.
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": need("ELEVENLABS_API_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2" }),
  });
  if (!r.ok) throw Object.assign(new Error(`ElevenLabs TTS ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: 502 });
  const d = (await r.json()) as { audio_base64: string; alignment?: unknown; normalized_alignment?: unknown };
  res.json({ audioBase64: d.audio_base64, mimeType: "audio/mpeg", alignment: d.alignment ?? null });
}));

app.get("/api/scribe-token", handle(async (_req, res) => {
  // Single-use token for Scribe v2 realtime (expires after 15 minutes).
  const r = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": need("ELEVENLABS_API_KEY") },
  });
  if (!r.ok) throw Object.assign(new Error(`ElevenLabs token ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: 502 });
  const d = (await r.json()) as { token: string };
  res.json({ token: d.token });
}));

/* ── Anam ──────────────────────────────────────────────────────────── */
app.post("/api/anam-session", handle(async (_req, res) => {
  const r = await fetch("https://api.anam.ai/v1/auth/session-token", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${need("ANAM_API_KEY")}` },
    body: JSON.stringify({
      personaConfig: {
        name: "Maya",
        avatarId: need("ANAM_AVATAR_ID"),
        voiceId: need("ANAM_VOICE_ID"),
        // Disable Anam's built-in LLM: Maya only says the patient's words, sent with talk().
        llmId: "CUSTOMER_CLIENT_V1",
        skipGreeting: true,
      },
    }),
  });
  if (!r.ok) throw Object.assign(new Error(`Anam ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: 502 });
  const d = (await r.json()) as { sessionToken: string };
  res.json({ sessionToken: d.sessionToken });
}));

/* ── Sign video ────────────────────────────────────────────────────── */
// Option A: forward to the team's generator (SIGN_VIDEO_API_URL) which returns {clips:[url], words:[...]}.
// Option B: build a sequence from a local clip library: server/sign-clips/<WORD>.mp4 (e.g. TAKE.mp4, MEDICINE.mp4).
// Words with no clip are skipped; if none match, clips is empty and the app shows the animated signer.
app.post("/api/sign-video", handle(async (req, res) => {
  const plain = String(req.body?.plain ?? "").slice(0, 1000);
  const words = plain.split(/\s+/).filter(Boolean);
  if (env.SIGN_VIDEO_API_URL) {
    const r = await fetch(env.SIGN_VIDEO_API_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plain }) });
    if (!r.ok) throw Object.assign(new Error(`Sign video ${r.status}`), { status: 502 });
    return res.json(await r.json());
  }
  const lib = existsSync(CLIPS_DIR)
    ? new Map(readdirSync(CLIPS_DIR).filter((f) => /\.(mp4|webm)$/i.test(f)).map((f) => [f.replace(/\.\w+$/, "").toUpperCase(), f]))
    : new Map<string, string>();
  const clips = words
    .map((w) => w.replace(/[^\w-]/g, "").toUpperCase())
    .map((w) => lib.get(w))
    .filter((f): f is string => !!f)
    .map((f) => `/sign-clips/${encodeURIComponent(f)}`);
  res.json({ clips, words });
}));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    claude: !!env.ANTHROPIC_API_KEY,
    elevenlabs: !!env.ELEVENLABS_API_KEY && !!env.ELEVENLABS_VOICE_ID,
    anam: !!env.ANAM_API_KEY && !!env.ANAM_AVATAR_ID && !!env.ANAM_VOICE_ID,
    signVideo: env.SIGN_VIDEO_API_URL ? "remote" : "local-library",
  });
});

app.listen(PORT, () => {
  console.log(`SignBridge API on http://localhost:${PORT}`);
  const missing = ["ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ANAM_API_KEY", "ANAM_AVATAR_ID", "ANAM_VOICE_ID"].filter((k) => !env[k]);
  if (missing.length) console.log(`  not set (those features fall back in the app): ${missing.join(", ")}`);
});
