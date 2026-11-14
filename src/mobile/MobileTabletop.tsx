import { Icon, Wave } from "../components/Icon";
import { Silhouette } from "../components/Illustrations";
import { usePrimary } from "../components/PrimaryAction";
import { useDialog } from "../components/useDialog";
import { useStore } from "../state/store";
import { MobileCamera } from "./MobileCamera";
import { MiniAvatar } from "./shared";

/** Presentation only: phone flat between them, the doctor's half rotated 180°.
    The frame is mounted once; only the text and buttons inside it change. */
export function MobileTabletop() {
  const on = useStore((s) => s.tabletop);
  const toggle = useStore((s) => s.toggleTabletop);
  const ref = useDialog<HTMLDivElement>(on, () => toggle(false));
  if (!on) return null;
  return (
    <div ref={ref} className="m-tt" role="dialog" aria-modal="true" aria-label="Tabletop view">
      <section className="m-half doc" aria-label="Doctor's side"><DoctorHalf /></section>
      <div className="m-hinge">
        Tabletop view, for presenting
        <button className="m-ibtn" style={{ width: 44, height: 44 }} onClick={() => toggle(false)} aria-label="Close tabletop view"><Icon name="x" /></button>
      </div>
      <section className="m-half pat" aria-label="Patient's side"><PatientHalf /></section>
    </div>
  );
}

function StepButton({ side, fallback, fallbackIcon, tone }: { side: "patient" | "doctor"; fallback: string; fallbackIcon: string; tone: string }) {
  const { primary } = usePrimary();
  const demo = useStore((s) => s.demo);
  if (primary?.side === side) {
    const label = primary.label === "Doctor, tap to speak" ? "Tap to speak" : primary.label;
    const t = primary.tone === "dark" ? "dark" : primary.tone;
    return (
      <button className={`m-cta ${t}`} onClick={primary.run} disabled={primary.disabled || demo}>
        {primary.icon === "wave" ? <Wave n={4} /> : <Icon name={primary.icon} />}{label}
      </button>
    );
  }
  return <button className={`m-cta ${tone}`} disabled><Icon name={fallbackIcon} />{fallback}</button>;
}

function DoctorHalf() {
  const phase = useStore((s) => s.phase);
  const speech = useStore((s) => s.speech);
  const transcript = useStore((s) => s.transcript);
  const liveSentence = useStore((s) => s.liveSentence);
  const lastP = useStore((s) => [...s.log].reverse().find((m) => m.who === "patient"));
  const listening = phase === "listening" || phase === "generating";
  const said = listening ? transcript || "…"
    : phase === "speaking" ? speech.text
      : phase === "signing" ? liveSentence || "Signing…"
        : lastP?.text ?? "Waiting for the patient to sign.";
  return (
    <>
      <span className="m-who"><MiniAvatar />{listening ? "You are saying" : "Patient says"}</span>
      <p className="m-said" aria-live="polite">{said}</p>
      <StepButton side="doctor" fallback="Tap to speak" fallbackIcon="mic" tone="coral" />
    </>
  );
}

function PatientHalf() {
  const phase = useStore((s) => s.phase);
  const reply = useStore((s) => s.reply);
  const liveSentence = useStore((s) => s.liveSentence);
  const watching = phase === "watching" && reply;
  const text = watching ? reply.plain
    : phase === "signing" ? liveSentence || "Watching…"
      : phase === "uncertain" ? "Not sure. Please sign again."
        : phase === "listening" || phase === "generating" ? "The doctor is speaking…"
          : "Your turn.";
  return (
    <>
      <div className="m-prow">
        {watching ? (
          <div className={`m-cam${reply.done ? "" : " sign"}`} aria-hidden="true"><Silhouette signing={!reply.done} /><div className="m-ring" /></div>
        ) : (
          <MobileCamera tile />
        )}
        <p aria-live="polite">{text}</p>
      </div>
      <StepButton side="patient" fallback={watching ? "Reply in sign" : "Start signing"} fallbackIcon="hand" tone="teal" />
    </>
  );
}
