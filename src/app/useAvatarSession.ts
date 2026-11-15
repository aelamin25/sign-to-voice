import { useEffect, useState } from "react";
import { isMock } from "./config";
import { services } from "../services";
import { AVATAR_VIDEO_ID } from "../state/media";
import { useStore } from "../state/store";

const REAL = !isMock("avatar");
/** How long the avatar stays connected after she has finished a sentence: while the doctor is still
 *  looking at her (until the doctor taps to speak), and once the visit has moved on. */
const LINGER_FACING_MS = 20000;
const LINGER_MS = 2500;

/** Looks after the live avatar's session for whichever view is on screen (web or phone), and says
 *  whether she is live.
 *
 *  Her minutes are limited (Anam's free plan: 30 a month, and it ends every session after 3), and a
 *  connected avatar uses them even when nobody is talking. So she is connected only while she speaks:
 *  she joins when a sentence is about to be spoken (the store connects her, during the pause in which
 *  the screen is turned to the doctor), stays while the doctor is looking at her, and leaves a moment
 *  after the doctor taps to speak. A five-turn visit then uses a minute or two of her time, and an open
 *  page that nobody is using costs nothing. */
export function useAvatarSession(): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!REAL) return;
    const avatar = services(false).avatar;
    let quietSince = 0;
    const check = () => {
      const now = avatar.isLive();
      setLive(now);
      const s = useStore.getState();
      const speaking = s.phase === "speaking" && s.speech.status === "talking";
      if (!now || speaking) { quietSince = 0; return; }
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince > (s.phase === "speaking" ? LINGER_FACING_MS : LINGER_MS)) void avatar.disconnect();
    };
    check();
    const id = window.setInterval(check, 1000);
    return () => { clearInterval(id); };
  }, []);
  return live;
}

/** Browsers refuse to start a video that has sound until the page has been clicked or tapped.
 *  When that happens the avatar connected but stayed blank and silent. So she starts silently (always
 *  allowed), the page asks for one click, and that click switches her sound on. The first click of
 *  all (the doctor's opening tap) also starts her video element, which is what phones need.
 *  Returns true while her sound is still waiting for a click. */
export function useSoundLock(live: boolean): boolean {
  const [locked, setLocked] = useState(() => !(navigator.userActivation?.hasBeenActive ?? true));
  useEffect(() => {
    const v = document.getElementById(AVATAR_VIDEO_ID) as HTMLVideoElement | null;
    if (!live || !v) return;
    let gone = false;
    v.play().catch(() => {
      if (gone) return;
      v.muted = true;
      setLocked(true);
      void v.play().catch(() => undefined);
    });
    return () => { gone = true; };
  }, [live]);
  useEffect(() => {
    if (!locked) return;
    const unlock = () => {
      const v = document.getElementById(AVATAR_VIDEO_ID) as HTMLVideoElement | null;
      if (v) { v.muted = false; void v.play().catch(() => undefined); }
      setLocked(false);
    };
    const kinds = ["pointerdown", "click", "keydown"];
    kinds.forEach((k) => window.addEventListener(k, unlock));
    return () => { kinds.forEach((k) => window.removeEventListener(k, unlock)); };
  }, [locked]);
  return locked;
}
