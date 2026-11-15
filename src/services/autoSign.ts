import { AUTO_SIGN, PY_BACKEND, RECOGNITION_SOURCE } from "../app/config";
import { useStore } from "../state/store";
import { openBridgeEvents } from "./bridgeEvents";
import { injectBridgeEvent, shownSigns } from "./recognition";

// Hands-free turns. The trained recogniser (model/vision/live.py) owns the camera and sends a
// finished turn to the Python backend. Normally the web app only listens after someone presses
// "Start signing" / "Reply in sign". With VITE_AUTO_SIGN=true this listens all the time: a turn
// that arrives while the app is waiting for the patient starts the patient's turn by itself.
// It never interrupts Maya while she is speaking, the doctor's turn, or the scripted demo.

type PhraseEvent = { type?: string; tokens?: string[]; confs?: number[] };

const canStart = (): boolean => {
  const s = useStore.getState();
  if (s.demo) return false;
  const p = s.phase;
  // The same moments the on-screen buttons allow. A patient who has read the doctor's reply can
  // answer straight away, without waiting for the caption to finish.
  // Not at the very start: the doctor opens the visit, so hands moving before the greeting start nothing.
  // Nor after the doctor's reply: the screen is being turned back to the patient then, and the camera
  // sees the laptop moving. The patient presses "Start signing" when they are ready.
  // So a turn never starts by itself: every turn starts with a button ("Start signing", "Sign again").
  void p;
  return false;
};

async function onPhrase(ev: PhraseEvent) {
  if (!ev.tokens || shownSigns(ev.tokens).length === 0) return; // a lone thumbs up, a fidget: nothing to say
  // Already signing: hand it to the running session in case its own connection isn't open yet.
  // A turn it has already received is ignored there, so nothing is shown or spoken twice.
  if (useStore.getState().phase === "signing") { injectBridgeEvent(ev); return; }
  if (!canStart()) return;
  await useStore.getState().startSigning();
  if (useStore.getState().phase === "signing") injectBridgeEvent(ev);
}

export function startAutoSign() {
  if (!AUTO_SIGN || !PY_BACKEND || RECOGNITION_SOURCE !== "python") return;
  const w = window as unknown as { __signbridgeAutoSign?: boolean };
  if (w.__signbridgeAutoSign) return; // one listener, even across hot reloads
  w.__signbridgeAutoSign = true;
  // one listener for the page's whole life; it reconnects by itself
  openBridgeEvents(PY_BACKEND, {
    onEvent: (e) => {
      const ev = e as PhraseEvent;
      if (ev?.type === "phrase") void onPhrase(ev);
    },
  });
}
