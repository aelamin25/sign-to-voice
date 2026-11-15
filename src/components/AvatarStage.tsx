import { useEffect, useState } from "react";
import { isMock } from "../app/config";
import { Icon, Wave } from "./Icon";
import { Portrait, type Mood } from "./Illustrations";
import { DOCTOR_TONE_LABEL } from "../lib/expression";
import { Words } from "./Words";
import { AVATAR_VIDEO_ID } from "../state/media";
import { useStore } from "../state/store";
import { services } from "../services";

const REAL = !isMock("avatar");
/** How long the avatar stays connected with nothing happening: in the middle of a visit, and after it. */
const IDLE_MS = 45000;
const AFTER_VISIT_MS = 3000;

/** Browsers refuse to start a video that has sound until the page has been clicked or a key pressed.
 *  Hands-free, nobody ever clicks: the avatar connected but her panel stayed blank, with only the words.
 *  So she starts silently (always allowed), the panel asks for one click, and that click switches her
 *  sound on. Returns true while the sound is still waiting for that click. */
function useSoundLock(live: boolean): boolean {
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

/** Maya, the speaking assistant, in her soft teal/peach halo. Captions light up word by word. */
export function AvatarStage({ withCaption = true }: { withCaption?: boolean }) {
  const phase = useStore((s) => s.phase);
  const speech = useStore((s) => s.speech);
  const pain = useStore((s) => s.pain);
  const voice = useStore((s) => s.voice);
  const expression = useStore((s) => s.expression);
  const reply = useStore((s) => s.reply);
  const demo = useStore((s) => s.demo);
  const talking = phase === "speaking" && speech.status === "talking";
  const listening = phase === "listening";
  // Maya's minutes are limited (Anam's free plan: 30 a month, and it ends every session after 3), and a
  // connected avatar uses them even when nobody is talking. So she is connected only during a visit:
  // she joins at the visit's first turn (the store connects her), and leaves when the visit is over or
  // when nothing has happened for a while. An open page that nobody is using costs nothing. If her
  // session ends in the middle of a visit, the next turn brings her back.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!REAL) return;
    const avatar = services(false).avatar;
    let was = false, lastPhase = useStore.getState().phase, changedAt = Date.now();
    const check = () => {
      const now = avatar.isLive();
      if (now !== was) { was = now; setTick((t) => t + 1); }
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
  const live = REAL && !demo && services(false).avatar.isLive();
  // Not on the first screen: the doctor's opening tap is the click that switches the sound on.
  const soundLocked = useSoundLock(live) && voice && phase !== "start";
  // The face carries what the words alone lose, in both directions:
  //   speaking for the patient  -> how the patient's face looked while signing
  //   during the doctor's reply -> how the doctor's words came across, for the patient to see
  const showingReply = phase === "watching" && !!reply;
  const mood: Mood =
    phase === "speaking" && expression === "question" ? "question"
      : phase === "speaking" && expression === "strained" ? "strained"
        : showingReply && reply.tone !== "neutral" ? reply.tone
          : "neutral";

  let cap: React.ReactNode;
  if (talking || (phase === "speaking" && speech.status === "done")) {
    cap = (
      <div className="cap" aria-live="off">
        <small><Icon name="speaker" />{live ? "Anam avatar, ElevenLabs voice" : "ElevenLabs voice, Anam lip-sync"}</small>
        <Words text={speech.text} index={speech.index} />
      </div>
    );
  } else if (showingReply && reply.tone !== "neutral") {
    cap = (
      <div className="cap">
        <small>For the patient</small>
        <span className="quietline">{DOCTOR_TONE_LABEL[reply.tone]}</span>
      </div>
    );
  } else if (listening || phase === "generating") {
    cap = (
      <div className="cap">
        <small><Wave n={10} />{listening ? "Listening to the doctor" : "Making the sign video"}</small>
        <span className="quietline">{listening ? "ElevenLabs Scribe is transcribing" : "Plain words by Claude"}</span>
      </div>
    );
  } else if (pain) {
    cap = (
      <div className="cap">
        <small>Shown to the doctor</small>
        <PainMeter area={pain.area} level={pain.level} />
      </div>
    );
  } else {
    cap = (
      <div className="cap">
        <small>Speaking assistant</small>
        <span className="quietline">Speaks the patient's words aloud, live.</span>
      </div>
    );
  }

  return (
    <div className={`av${talking ? " spk" : ""}${listening ? " lis" : ""}`} aria-label="Maya, the speaking assistant" role="img">
      <div className="halo" />
      <div className="portrait" style={{ opacity: live ? 0 : 1 }}><Portrait mood={mood} /></div>
      {REAL && <video id={AVATAR_VIDEO_ID} className={`anam${live ? " live" : ""}`} autoPlay playsInline />}
      <span className="avtag"><i><Icon name="steth" /></i><b>Maya</b>by Anam</span>
      <span className="demo">{live ? "Live avatar" : REAL ? "Avatar joins at the first turn" : voice ? "Demo voice" : "Voice off"}</span>
      {soundLocked && <span className="soundlock" role="status"><Icon name="speaker" />Click anywhere once to switch the sound on</span>}
      {withCaption && cap}
    </div>
  );
}

function PainMeter({ area, level }: { area: string | null; level: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.95rem" }}>
      <span>{area ?? "Pain"}</span>
      <span style={{ display: "flex", gap: 4, flex: 1 }} role="img" aria-label={`Pain ${level} out of 10`}>
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} style={{ height: 8, flex: 1, borderRadius: 4, background: i < level ? "var(--coral)" : "var(--soft2)" }} />
        ))}
      </span>
      <b style={{ fontWeight: 500 }}>{level}/10</b>
    </div>
  );
}
