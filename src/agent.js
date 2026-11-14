// The link between the page and the voice agent.
//
// Three versions with the same shape, so the page doesn't care which one it has:
//   - practice: a stand-in that runs in the browser, for building without keys
//   - voice:    the ElevenLabs agent speaks
//   - face:     the same ElevenLabs agent, speaking through an Anam avatar
//
// The server picks the mode from what is filled in in .env.
//
// All three call the same tools on the page:
//   tools.propose(sentence)  -> resolves "approved" or "rejected"
//   tools.caption(text)
//   tools.interpreter()      -> resolves "requested"

import { TOOLS } from "./signs.js";

export async function createAgent({ tools, onStatus, onError, avatarVideoId }) {
  const res = await fetch("/api/agent-session");
  const session = await res.json();
  if (!res.ok) throw new Error(session.error || "The server could not start a session.");

  if (session.mode === "face") return createFaceAgent(session, { tools, onStatus, onError, avatarVideoId });
  if (session.mode === "voice") return createVoiceAgent(session, { tools, onStatus, onError });
  return createPracticeAgent({ tools, onStatus });
}

// ---------- Voice: ElevenLabs ----------

async function createVoiceAgent(session, { tools, onStatus, onError }) {
  const { Conversation } = await import("@elevenlabs/client");

  // Ask for the microphone first, so the browser's permission box appears before we connect.
  await navigator.mediaDevices.getUserMedia({ audio: true });

  const conversation = await Conversation.startSession({
    ...(session.signedUrl ? { signedUrl: session.signedUrl } : { agentId: session.agentId }),
    connectionType: "websocket",
    clientTools: {
      [TOOLS.PROPOSE]: async ({ sentence }) => tools.propose(String(sentence ?? "")),
      [TOOLS.CAPTION]: async ({ text }) => {
        tools.caption(String(text ?? ""));
        return "shown";
      },
      [TOOLS.INTERPRETER]: async () => tools.interpreter(),
    },
    onModeChange: ({ mode }) => onStatus(mode === "speaking" ? "speaking" : "listening"),
    onDisconnect: () => onStatus("off"),
    onError: (message) => onError(typeof message === "string" ? message : "The voice agent reported an error."),
  });

  onStatus("listening");

  return {
    mode: "voice",
    sendSigns(line) {
      onStatus("thinking");
      conversation.sendUserMessage(line);
    },
    setMicMuted(muted) {
      conversation.setMicMuted(muted);
    },
    async stop() {
      await conversation.endSession();
    },
  };
}

// ---------- Face: ElevenLabs agent rendered by an Anam avatar ----------
//
// UNTESTED until we have Anam keys. The open question from Anam's docs is whether
// sendUserMessage reaches the ElevenLabs agent in this mode. If signs don't arrive,
// clear the two ANAM lines in .env to go back to voice mode.

async function createFaceAgent(session, { tools, onStatus, onError, avatarVideoId }) {
  const { createClient, AnamEvent } = await import("@anam-ai/js-sdk");
  const client = createClient(session.sessionToken);

  // With Anam in the loop, the ElevenLabs tools are answered through Anam's handlers.
  // Whatever onStart returns is sent back to the agent as the tool's result.
  client.registerToolCallHandler(TOOLS.PROPOSE, {
    onStart: async (call) => tools.propose(String(call.arguments?.sentence ?? "")),
  });
  client.registerToolCallHandler(TOOLS.CAPTION, {
    onStart: async (call) => {
      tools.caption(String(call.arguments?.text ?? ""));
      return "shown";
    },
  });
  client.registerToolCallHandler(TOOLS.INTERPRETER, {
    onStart: async () => tools.interpreter(),
  });

  client.addListener(AnamEvent.CONNECTION_CLOSED, () => onStatus("off"));
  client.addListener(AnamEvent.MIC_PERMISSION_DENIED, () =>
    onError("The microphone is blocked. Allow it in the browser's address bar, then press Start again."),
  );
  client.addListener(AnamEvent.MESSAGE_DELIVERY_FAILED, () =>
    onError("The signs didn't reach the agent through the avatar. Clear the ANAM lines in .env to use voice mode."),
  );
  client.addListener(AnamEvent.SERVER_WARNING, (warning) => console.warn("Anam warning:", warning));

  // Connecting usually takes 4 to 5 seconds. This also starts the microphone.
  await client.streamToVideoElement(avatarVideoId);
  onStatus("listening");

  return {
    mode: "face",
    sendSigns(line) {
      onStatus("thinking");
      client.sendUserMessage(line);
    },
    setMicMuted(muted) {
      muted ? client.muteInputAudio() : client.unmuteInputAudio();
    },
    async stop() {
      await client.stopStreaming();
    },
  };
}

// ---------- Practice: no keys needed ----------

const PHRASES = {
  HELLO: "Hello.",
  PAIN: "I'm in pain.",
  HEAD: "It's my head.",
  YES: "Yes.",
  NO: "No.",
  THREE: "Three.",
  DAYS: "Days.",
  DONT_UNDERSTAND: "Sorry, I don't understand. Could you say that again?",
  THANK_YOU: "Thank you.",
  HELP: "I need help.",
};

// Sign combinations from the demo conversation. The real agent works these out itself.
const WHOLE_PHRASES = {
  "PAIN HEAD": "I have a headache.",
  "HEAD PAIN": "I have a headache.",
  "THREE DAYS": "For three days.",
};

function practiceSentence(line) {
  const [signPart = "", ...rest] = line.replace(/^SIGNS:\s*/, "").split("|");
  const settings = Object.fromEntries(rest.map((s) => s.trim().split("=")));
  const signs = signPart.trim().split(/\s+/).filter(Boolean);
  const whole = WHOLE_PHRASES[signs.join(" ")];
  let sentence = whole ?? signs.map((s) => PHRASES[s] ?? s.toLowerCase().replace(/_/g, " ") + ".").join(" ");
  if (settings.question === "true") sentence = sentence.replace(/\.$/, "?");
  return { sentence, signs, urgent: settings.tone === "urgent" };
}

function createPracticeAgent({ tools, onStatus }) {
  onStatus("listening");
  let lastDoctorText = "";

  function speak(text, urgent) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = urgent ? 1.25 : 0.95;
      utterance.pitch = urgent ? 1.15 : 1;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  return {
    mode: "practice",
    async sendSigns(line) {
      onStatus("thinking");
      const { sentence, signs, urgent } = practiceSentence(line);

      // HELP signed twice calls for an interpreter, as the real agent does.
      if (signs.filter((s) => s === "HELP").length >= 2) await tools.interpreter();

      const answer = await tools.propose(sentence);
      if (answer === "approved") {
        onStatus("speaking");
        await speak(sentence, urgent);
        // The real agent rewrites the doctor's last reply in simpler words. Practice mode only marks it.
        if (signs.includes("DONT_UNDERSTAND") && lastDoctorText) {
          tools.caption(`Again, more simply: ${lastDoctorText}`);
        }
      }
      onStatus("listening");
    },
    // In practice mode there is no microphone, so the doctor's reply is typed.
    doctorSays(text) {
      const words = text.trim().split(/\s+/).slice(0, 12).join(" ");
      if (!words) return;
      lastDoctorText = words;
      tools.caption(words);
    },
    setMicMuted() {},
    async stop() {
      window.speechSynthesis?.cancel();
      onStatus("off");
    },
  };
}
