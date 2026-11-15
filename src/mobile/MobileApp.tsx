import { useEffect, useRef } from "react";
import { isMock } from "../app/config";
import { useAvatarSession, useSoundLock } from "../app/useAvatarSession";
import { Brand, Icon } from "../components/Icon";
import { formatToolArgs, useToolToasts } from "../components/Toast";
import { unlockAudio } from "../services/tts";
import { AVATAR_VIDEO_ID } from "../state/media";
import { useStore } from "../state/store";
import { MobileTabletop } from "./MobileTabletop";
import { EndScreen, ListenScreen, SignScreen, SpeakScreen, StartScreen, WatchScreen } from "./screens";
import { screenOf, STEP, type Screen } from "./shared";
import { Sheets } from "./Sheets";

const SCREENS: Record<Screen, () => React.ReactNode> = {
  start: StartScreen, sign: SignScreen, speak: SpeakScreen, listen: ListenScreen, watch: WatchScreen, end: EndScreen,
};

/** The phone view: one step on screen at a time, one button at the bottom.
    Same store, services, mock mode and demo as the web view; only the presentation differs. */
export function MobileApp() {
  const phase = useStore((s) => s.phase);
  const textSize = useStore((s) => s.textSize);
  const rm = useStore((s) => s.reducedMotion);
  const tabletop = useStore((s) => s.tabletop);
  const menu = useStore((s) => s.menu);
  const screen = screenOf(phase);
  const Current = SCREENS[screen];
  const viewRef = useRef<HTMLElement>(null);
  // The live avatar: connected only during a visit, and silent until the page has been tapped once.
  const avatarLive = useAvatarSession();
  const soundLocked = useSoundLock(avatarLive) && phase !== "start";

  useEffect(() => {
    document.documentElement.style.setProperty("--ts", String(textSize));
    document.documentElement.classList.toggle("rm", rm);
  }, [textSize, rm]);

  // iOS Safari: audio and speech may only start after a user gesture. Unlock on the first tap.
  useEffect(() => {
    const once = () => unlockAudio();
    window.addEventListener("pointerdown", once, { once: true, capture: true });
    window.addEventListener("keydown", once, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", once, { capture: true });
      window.removeEventListener("keydown", once, { capture: true });
    };
  }, []);

  // Keyboard and screen-reader users: move focus to the new step's button when the step changes.
  const focusKey = useStore((s) => `${s.phase}|${s.speech.status}|${s.reply?.done ?? ""}|${s.sttError ?? ""}`);
  useEffect(() => {
    if (tabletop || menu) return;
    const t = setTimeout(() => {
      const b = viewRef.current?.querySelector<HTMLButtonElement>("[data-primary]:not(:disabled)");
      if (b && viewRef.current?.contains(document.activeElement) === false) b.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(t);
  }, [focusKey, tabletop, menu]);

  return (
    <div className="m-root">
      <div className="m-shell" inert={tabletop || !!menu || undefined} style={{ display: "contents" }}>
        <Header />
        <StepBar screen={screen} />
        <main ref={viewRef} className="m-view" aria-label="SignBridge">
          <h1 className="sr">SignBridge: sign to the camera and SignBridge speaks for you</h1>
          {/* keyed by screen: the enter animation runs only when the step changes */}
          <div key={screen} className={`m-scr m-scr-${screen}`}><Current /></div>
        </main>
      </div>
      <MobileToast />
      {soundLocked && <div className="m-soundlock" role="status"><Icon name="speaker" />Tap anywhere once to switch the sound on</div>}
      <DemoPill />
      <MobileTabletop />
      <Sheets />
      {/* Persistent Anam target: keeps the avatar's audio alive across screens (real mode only). */}
      {!isMock("avatar") && <video id={AVATAR_VIDEO_ID} className="m-anam-src" autoPlay playsInline aria-hidden="true" />}
    </div>
  );
}

function Header() {
  const n = useStore((s) => s.log.length);
  const setMenu = useStore((s) => s.setMenu);
  return (
    <header className="m-top">
      <div className="m-brand"><Brand />SignBridge</div>
      <button className="m-ibtn" onClick={() => setMenu("log")} aria-label={`Conversation, ${n} message${n === 1 ? "" : "s"}`}>
        <Icon name="list" />{n > 0 && <span className="m-n" aria-hidden="true">{n}</span>}
      </button>
      <button className="m-ibtn" onClick={() => setMenu("main")} aria-label="Menu"><Icon name="sliders" /></button>
    </header>
  );
}

function StepBar({ screen }: { screen: Screen }) {
  const st = STEP[screen];
  return (
    <div className="m-steps">
      {st && (
        <>
          <div className="m-bars" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <i key={i} className={`${i < st[0] ? "done" : ""} ${i === st[0] ? `on ${st[1]}` : ""}`} />)}
          </div>
          <div className="m-slab" aria-live="polite"><b>{st[2]}</b><span>Step {st[0] + 1} of 4</span></div>
        </>
      )}
    </div>
  );
}

function MobileToast() {
  const toast = useToolToasts(2400);
  return (
    <div aria-live="polite">
      {toast && (
        <div className="m-toast" key={toast.at} role="status">
          <i><Icon name="spark" /></i>Anam tool<code>{toast.name}({formatToolArgs(toast.args)})</code>
        </div>
      )}
    </div>
  );
}

function DemoPill() {
  const demo = useStore((s) => s.demo);
  const stop = useStore((s) => s.stopDemo);
  if (!demo) return null;
  return <div className="m-demo" role="status">Demo playing<button onClick={stop}>Stop</button></div>;
}
