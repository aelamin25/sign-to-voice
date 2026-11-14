import { isMock } from "../app/config";
import { Icon, Wave } from "./Icon";
import { Portrait } from "./Illustrations";
import { Words } from "./Words";
import { AVATAR_VIDEO_ID } from "../state/media";
import { useStore } from "../state/store";
import { services } from "../services";

const REAL = !isMock("avatar");

/** Maya, the speaking assistant, in her soft teal/peach halo. Captions light up word by word. */
export function AvatarStage({ withCaption = true }: { withCaption?: boolean }) {
  const phase = useStore((s) => s.phase);
  const speech = useStore((s) => s.speech);
  const pain = useStore((s) => s.pain);
  const voice = useStore((s) => s.voice);
  const demo = useStore((s) => s.demo);
  const talking = phase === "speaking" && speech.status === "talking";
  const listening = phase === "listening";
  const live = REAL && !demo && services(false).avatar.isLive();

  let cap: React.ReactNode;
  if (talking || (phase === "speaking" && speech.status === "done")) {
    cap = (
      <div className="cap" aria-live="off">
        <small><Icon name="speaker" />{live ? "Anam avatar, ElevenLabs voice" : "ElevenLabs voice, Anam lip-sync"}</small>
        <Words text={speech.text} index={speech.index} />
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
      <div className="portrait" style={{ opacity: live ? 0 : 1 }}><Portrait /></div>
      {REAL && <video id={AVATAR_VIDEO_ID} className={`anam${live ? " live" : ""}`} autoPlay playsInline />}
      <span className="avtag"><i><Icon name="steth" /></i><b>Maya</b>by Anam</span>
      <span className="demo">{live ? "Live avatar" : voice ? "Demo voice" : "Voice off"}</span>
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
