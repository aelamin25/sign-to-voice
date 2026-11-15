import { useEffect, useState } from "react";
import { isMock } from "./config";
import { services } from "../services";
import { AVATAR_VIDEO_ID } from "../state/media";
import { useStore } from "../state/store";

const REAL = !isMock("avatar");
/** How long the avatar stays connected with nothing happening: in the middle of a visit, and after it. */
const IDLE_MS = 45000;
const AFTER_VISIT_MS = 3000;

/** Looks after the live avatar's session for whichever view is on screen (web or phone), and says
 *  whether she is live.
 *
 *  Her minutes are limited (Anam's free plan: 30 a month, and it ends every session after 3), and a
 *  connected avatar uses them even when nobody is talking. So she is connected only during a visit:
 *  she joins at the visit's first turn (the store connects her), and leaves when the visit is over or
 *  when nothing has happened for a while. An open page that nobody is using costs nothing. If her
 *  session ends in the middle of a visit, the next turn brings her back. */
export function useAvatarSession(): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!REAL) return;
    const avatar = services(false).avatar;
    let lastPhase = useStore.getState().phase, changedAt = Date.now();
    const check = () => {
      const now = avatar.isLive();
      setLive(now);
      const s = useStore.getState();
      if (s.phase !== lastPhase) { lastPhase = s.phase; changedAt = Date.now(); }
      if (!now || (s.phase === "speaking" && s.speech.status === "talking")) return;
      const quietFor = Date.now() - changedAt;
      const over = s.phase === "start" || s.phase === "ended";
      if (quietFor > (over ? AFTER_VISIT_MS : IDLE_MS)) void avatar.disconnect();
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
