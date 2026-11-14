// The small server. Its only job is to keep secret keys off the web page.
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3001;
const env = (name) => (process.env[name] || "").trim();

const AGENT_ID = env("ELEVENLABS_AGENT_ID");
const ELEVEN_KEY = env("ELEVENLABS_API_KEY");
const ANAM_KEY = env("ANAM_API_KEY");
const ANAM_AVATAR_ID = env("ANAM_AVATAR_ID");

// Which mode the .env file puts us in:
//   practice  no agent ID yet: a stand-in voice in the browser
//   voice     the ElevenLabs agent speaks
//   face      the ElevenLabs agent speaks through an Anam avatar
function chooseMode() {
  if (!AGENT_ID) return "practice";
  if (ANAM_KEY && ANAM_AVATAR_ID && ELEVEN_KEY) return "face";
  return "voice";
}

async function getSignedUrl() {
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(AGENT_ID)}`;
  const r = await fetch(url, { headers: { "xi-api-key": ELEVEN_KEY } });
  if (!r.ok) {
    console.error("ElevenLabs refused the signed-url request:", r.status, await r.text());
    throw new Error(`ElevenLabs returned ${r.status}. Check the key and agent ID in .env.`);
  }
  return (await r.json()).signed_url;
}

// Anam renders the face; ElevenLabs stays the brain and voice.
// The signed URL lasts about 15 minutes, so this runs right before each conversation.
async function getAnamSessionToken(signedUrl) {
  const r = await fetch("https://api.anam.ai/v1/auth/session-token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANAM_KEY}` },
    body: JSON.stringify({
      personaConfig: { avatarId: ANAM_AVATAR_ID, avatarModel: "cara-4" },
      environment: { elevenLabsAgentSettings: { signedUrl, agentId: AGENT_ID } },
    }),
  });
  if (!r.ok) {
    console.error("Anam refused the session-token request:", r.status, await r.text());
    throw new Error(`Anam returned ${r.status}. Check the Anam key and avatar ID in .env.`);
  }
  return (await r.json()).sessionToken;
}

// The page calls this before starting a conversation.
app.get("/api/agent-session", async (_req, res) => {
  const mode = chooseMode();
  try {
    if (mode === "practice") return res.json({ mode });
    if (mode === "face") {
      const sessionToken = await getAnamSessionToken(await getSignedUrl());
      return res.json({ mode, sessionToken });
    }
    // Voice only. A private agent needs a signed address; a public one just needs its ID.
    if (ELEVEN_KEY) return res.json({ mode, signedUrl: await getSignedUrl() });
    return res.json({ mode, agentId: AGENT_ID });
  } catch (err) {
    res.status(502).json({ error: err.message || "Could not start a session." });
  }
});

// After "npm run build", this also serves the finished page.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
app.use(express.static(dist));

app.listen(PORT, () => {
  const label = { practice: "practice mode (no agent ID in .env)", voice: "voice mode (ElevenLabs)", face: "face mode (ElevenLabs + Anam)" };
  console.log(`Server ready on http://localhost:${PORT} in ${label[chooseMode()]}`);
});
