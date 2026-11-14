import { AvatarStage } from "./AvatarStage";
import { CameraPanel } from "./CameraPanel";
import { Icon } from "./Icon";
import { LiveTranslation } from "./LiveTranslation";
import { ListenView } from "./ListenView";
import { PrimaryAction } from "./PrimaryAction";
import { SignChips } from "./SignChips";
import { SignVideoPlayer } from "./SignVideoPlayer";
import { useDialog } from "./useDialog";
import { useStore } from "../state/store";

/** Presentation only: device lies flat between them; the doctor's half is rotated 180°. */
export function TabletopView() {
  const on = useStore((s) => s.tabletop);
  const toggle = useStore((s) => s.toggleTabletop);
  const phase = useStore((s) => s.phase);
  const speech = useStore((s) => s.speech);
  const transcript = useStore((s) => s.transcript);
  const lastP = useStore((s) => [...s.log].reverse().find((m) => m.who === "patient"));
  const ref = useDialog<HTMLDivElement>(on, () => toggle(false));
  if (!on) return null;

  const said =
    phase === "listening" || phase === "generating" ? transcript || "…"
      : phase === "speaking" ? speech.text
        : phase === "signing" ? "Signing…"
          : lastP?.text ?? "Waiting for the patient.";

  return (
    <div ref={ref} className="tt" role="dialog" aria-modal="true" aria-label="Tabletop view">
      <button className="ibtn exit" onClick={() => toggle(false)} aria-label="Exit tabletop view"><Icon name="x" /></button>
      <div className="tablet">
        <section className="half doc" aria-label="Doctor's side">
          <AvatarStage withCaption={false} />
          <div className="said">
            <small>{phase === "listening" ? <><Icon name="mic" />You are saying</> : <><Icon name="hand" />Patient says</>}</small>
            <p aria-live="polite">{said}</p>
            <PrimaryAction side="doctor" />
          </div>
        </section>
        <div className="hinge">The doctor's half faces them across the desk</div>
        <section className="half pat" aria-label="Patient's side">
          <div>{phase === "watching" ? <SignVideoPlayerCompact /> : <><CameraPanel compact /><SignChips /></>}</div>
          <div>
            {phase === "listening" || phase === "generating" ? <ListenView /> : phase === "watching" ? null : <LiveTranslation />}
            <PrimaryAction side="patient" />
          </div>
        </section>
      </div>
    </div>
  );
}

function SignVideoPlayerCompact() {
  return <div style={{ display: "grid", gap: 12 }}><SignVideoPlayer /></div>;
}
