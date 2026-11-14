// STAND-IN for Shruti's recogniser.
//
// Shruti: replace this file with yours. Keep the same function:
//
//     startRecognizer(video, onSign)
//
// and call onSign({ sign, confidence, tone, question }) every time you see a sign.
// The rest of the app does not need to change.
//
// Until then, this version uses the keyboard so the page can be built and tested:
//   1 to 9, 0  send a sign, in the order listed in signs.js (0 is the tenth)
//   U          switch between calm and urgent
//   Q          switch question on and off
//   X          send UNKNOWN (to test what happens when a sign isn't recognised)

import { SIGNS, UNKNOWN } from "./signs.js";

export const USING_KEYBOARD_STAND_IN = true;

export function startRecognizer(_video, onSign, onStateChange = () => {}) {
  let tone = "calm";
  let question = false;
  onStateChange({ tone, question });

  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const key = e.key.toLowerCase();
    if (key === "u") {
      tone = tone === "calm" ? "urgent" : "calm";
      onStateChange({ tone, question });
    } else if (key === "q") {
      question = !question;
      onStateChange({ tone, question });
    } else if (key === "x") {
      onSign({ sign: UNKNOWN, confidence: 0.4, tone, question });
    } else if (/^[0-9]$/.test(key)) {
      // Keys 1 to 9 are the first nine signs; 0 is the tenth.
      const sign = SIGNS[key === "0" ? 9 : Number(key) - 1];
      if (sign) onSign({ sign, confidence: 0.95, tone, question });
    }
  });
}
