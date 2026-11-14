// The agreed names. Everything plugs together through these, so don't rename them.

// The ten signs, taken from the demo clinic conversation.
// The first five are the core set to get working first; the next five are added once those are solid.
// To add a sign: put its name here and record clips for it. Nothing else changes.
// DONT_UNDERSTAND lets the patient push back: the agent says so to the doctor and re-captions
// the doctor's last reply in simpler words.
export const SIGNS = ["PAIN", "HEAD", "YES", "NO", "THUMBS_UP", "THREE", "DAYS", "DONT_UNDERSTAND", "THANK_YOU", "HELP"];
export const UNKNOWN = "UNKNOWN";

// THUMBS_UP is how the patient approves a sentence, so it never goes into the sentence itself.
export const APPROVE_SIGN = "THUMBS_UP";

// What the recogniser hands the page for every sign:
//   { sign: "PAIN", confidence: 0.86, tone: "calm" | "urgent", question: false }

// The line the page sends to the agent.
export function buildSignsLine(signs, tone, question) {
  return `SIGNS: ${signs.join(" ")} | tone=${tone} | question=${question}`;
}

// The agent's three tools, spelled exactly as on the ElevenLabs website.
export const TOOLS = {
  PROPOSE: "propose_sentence", // takes { sentence }, waits for "approved" or "rejected"
  CAPTION: "show_caption", // takes { text }, does not wait
  INTERPRETER: "request_interpreter", // takes nothing, waits, gets back "requested"
};
