import { createAgent } from "./agent.js";
import { startRecognizer, USING_KEYBOARD_STAND_IN } from "./recognizer.js";
import { SIGNS, UNKNOWN, APPROVE_SIGN, buildSignsLine } from "./signs.js";

const MIN_CONFIDENCE = 0.7; // below this, the sign counts as not recognised
const PAUSE_BEFORE_SEND_MS = 2000; // how long the patient pauses before the signs are sent
const APPROVAL_TIMEOUT_MS = 45000; // if nobody answers, treat it as "no"

const $ = (id) => document.getElementById(id);
const el = {
  start: $("start"),
  status: $("status"),
  modeBadge: $("mode-badge"),
  notice: $("notice"),
  video: $("video"),
  overlay: $("overlay"),
  cameraMessage: $("camera-message"),
  tone: $("tone"),
  row: $("sign-row"),
  rowHint: $("row-hint"),
  undo: $("undo"),
  send: $("send"),
  approval: $("approval"),
  approvalSentence: $("approval-sentence"),
  approve: $("approve"),
  reject: $("reject"),
  caption: $("caption"),
  avatar: $("avatar"),
  practiceDoctor: $("practice-doctor"),
  doctorText: $("doctor-text"),
  interpreter: $("interpreter"),
  log: $("log"),
  keys: $("keys"),
  keyList: $("key-list"),
};

let agent = null;
let row = []; // signs waiting to be sent, e.g. [{ sign: "PAIN", tone: "urgent", question: false }]
let pauseTimer = null;
let pendingApproval = null; // { resolve, timer } while the approval card is open

// ---------- Small helpers ----------

const MODE_LABELS = {
  practice: "Practice mode (no agent connected)",
  voice: "Live voice agent (ElevenLabs)",
  face: "Live voice and face (ElevenLabs + Anam)",
};

const STATUS_TEXT = {
  off: "Not started",
  listening: "Listening",
  thinking: "Working out the sentence",
  speaking: "Speaking",
};

function setStatus(status) {
  el.status.textContent = STATUS_TEXT[status] ?? status;
  el.status.className = `status status-${status}`;
  if (status === "off" && agent) stopConversation({ alreadyEnded: true });
}

let noticeTimer = null;
function showNotice(message, { sticky = false } = {}) {
  el.notice.textContent = message;
  el.notice.hidden = false;
  clearTimeout(noticeTimer);
  if (!sticky) noticeTimer = setTimeout(() => (el.notice.hidden = true), 4000);
}

function addToLog(who, text) {
  const li = document.createElement("li");
  if (who === "Patient") li.className = "from-patient";
  const name = document.createElement("span");
  name.className = "who";
  name.textContent = `${who}:`;
  li.append(name, document.createTextNode(text));
  el.log.prepend(li);
}

// The microphone is for the doctor. Keep it off while the patient is mid-sentence,
// so the agent doesn't mistake room noise for the doctor's reply.
function updateMic() {
  agent?.setMicMuted(row.length > 0 || pendingApproval !== null);
}

// ---------- The row of signs ----------

function rowTone() {
  return row.some((s) => s.tone === "urgent") ? "urgent" : "calm";
}

function renderRow() {
  el.row.replaceChildren(
    ...row.map((s) => {
      const li = document.createElement("li");
      li.className = s.tone === "urgent" ? "chip chip-urgent" : "chip";
      li.textContent = s.sign.replace(/_/g, " ");
      return li;
    }),
  );
  el.undo.disabled = el.send.disabled = row.length === 0;
  updateMic();
}

function schedulePauseSend() {
  clearTimeout(pauseTimer);
  if (row.length > 0) pauseTimer = setTimeout(sendRow, PAUSE_BEFORE_SEND_MS);
}

function removeLastSign() {
  row.pop();
  renderRow();
  schedulePauseSend();
}

function clearRow() {
  row = [];
  clearTimeout(pauseTimer);
  renderRow();
}

function sendRow() {
  clearTimeout(pauseTimer);
  if (row.length === 0 || !agent) return;
  const line = buildSignsLine(
    row.map((s) => s.sign),
    rowTone(),
    row.some((s) => s.question),
  );
  row = [];
  renderRow();
  agent.sendSigns(line);
}

// Called by the recogniser (Shruti's file, or the keyboard stand-in) for every sign.
function onSign({ sign, confidence, tone, question }) {
  if (!agent) return showNotice("Press “Start conversation” first.");

  if (sign === UNKNOWN || confidence < MIN_CONFIDENCE || ![...SIGNS].includes(sign)) {
    return showNotice("Didn't catch that sign. Please try again.");
  }

  if (sign === APPROVE_SIGN) {
    if (pendingApproval) return answerApproval("approved");
    return showNotice("Nothing to approve yet.");
  }

  if (pendingApproval) return showNotice("Approve or reject the sentence first.");

  row.push({ sign, tone, question });
  renderRow();
  schedulePauseSend();
}

// ---------- The three tools the agent can call ----------

function proposeSentence(sentence) {
  // If a card is somehow still open, close it as "no" before showing the new one.
  if (pendingApproval) answerApproval("rejected");

  return new Promise((resolve) => {
    el.approvalSentence.textContent = sentence;
    el.approval.hidden = false;
    el.approve.focus();
    const timer = setTimeout(() => answerApproval("rejected"), APPROVAL_TIMEOUT_MS);
    pendingApproval = { resolve, timer, sentence };
    updateMic();
  });
}

function answerApproval(answer) {
  if (!pendingApproval) return;
  const { resolve, timer, sentence } = pendingApproval;
  clearTimeout(timer);
  pendingApproval = null;
  el.approval.hidden = true;
  if (answer === "approved") addToLog("Patient", sentence);
  updateMic();
  resolve(answer);
}

function showCaption(text) {
  el.caption.textContent = text;
  el.caption.classList.remove("is-waiting");
  addToLog("Doctor", text);
}

function requestInterpreter() {
  el.interpreter.hidden = false;
  return Promise.resolve("requested");
}

// ---------- Starting and stopping ----------

async function startConversation() {
  el.start.disabled = true;
  el.start.textContent = "Starting…";
  try {
    // The avatar's video element must be visible before Anam streams into it.
    el.avatar.hidden = false;
    agent = await createAgent({
      tools: { propose: proposeSentence, caption: showCaption, interpreter: requestInterpreter },
      onStatus: setStatus,
      onError: (message) => showNotice(message, { sticky: true }),
      avatarVideoId: "avatar-video",
    });
    el.modeBadge.textContent = MODE_LABELS[agent.mode];
    el.modeBadge.hidden = false;
    el.avatar.hidden = agent.mode !== "face";
    el.practiceDoctor.hidden = agent.mode !== "practice";
    el.start.textContent = "Stop";
  } catch (err) {
    agent = null;
    el.avatar.hidden = true;
    el.start.textContent = "Start conversation";
    const message =
      err?.name === "NotAllowedError"
        ? "The microphone is blocked. Allow it in the browser's address bar, then press Start again."
        : `Couldn't start: ${err?.message ?? err}`;
    showNotice(message, { sticky: true });
  } finally {
    el.start.disabled = false;
  }
}

async function stopConversation({ alreadyEnded = false } = {}) {
  const current = agent;
  agent = null;
  if (pendingApproval) answerApproval("rejected");
  clearRow();
  el.start.textContent = "Start conversation";
  el.modeBadge.hidden = true;
  el.avatar.hidden = true;
  el.practiceDoctor.hidden = true;
  if (!alreadyEnded) await current?.stop();
  el.status.textContent = STATUS_TEXT.off;
  el.status.className = "status status-off";
}

// ---------- Camera ----------

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720 }, audio: false });
    el.video.srcObject = stream;
    await el.video.play();
    el.overlay.width = el.video.videoWidth;
    el.overlay.height = el.video.videoHeight;
  } catch {
    el.cameraMessage.textContent =
      "No camera yet. Allow the camera in the browser's address bar and reload. The test keys still work.";
    el.cameraMessage.hidden = false;
  }
}

// ---------- Wiring ----------

el.start.addEventListener("click", () => (agent ? stopConversation() : startConversation()));
el.undo.addEventListener("click", removeLastSign);
el.send.addEventListener("click", sendRow);
el.approve.addEventListener("click", () => answerApproval("approved"));
el.reject.addEventListener("click", () => answerApproval("rejected"));

el.practiceDoctor.addEventListener("submit", (e) => {
  e.preventDefault();
  agent?.doctorSays?.(el.doctorText.value);
  el.doctorText.value = "";
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "Enter" && !pendingApproval && row.length > 0) {
    e.preventDefault(); // stop Enter from also clicking a focused button
    sendRow();
  } else if (e.key === "Backspace" && !pendingApproval) {
    removeLastSign();
  } else if (e.key === "Escape") {
    pendingApproval ? answerApproval("rejected") : clearRow();
  }
});

if (USING_KEYBOARD_STAND_IN) {
  el.keys.hidden = false;
  el.keyList.replaceChildren(
    ...SIGNS.map((sign, i) => {
      const span = document.createElement("span");
      const kbd = document.createElement("kbd");
      kbd.textContent = String((i + 1) % 10); // the tenth sign is on the 0 key
      span.append(kbd, ` ${sign.replace(/_/g, " ")}`);
      return span;
    }),
  );
}

el.caption.classList.add("is-waiting");
renderRow();
startCamera();
startRecognizer(el.video, onSign, ({ tone }) => {
  el.tone.textContent = tone;
  el.tone.className = tone === "urgent" ? "chip chip-urgent" : "chip chip-quiet";
});
