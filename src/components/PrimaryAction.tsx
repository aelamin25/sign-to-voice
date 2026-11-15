import { Icon, Wave } from "./Icon";
import { useStore, type State } from "../state/store";

type Tone = "teal" | "coral" | "dark";
interface Action { side: "patient" | "doctor"; label: string; icon: string | "wave"; tone: Tone; run: () => void; disabled?: boolean; on?: boolean }
interface Secondary { side: "patient" | "doctor"; label: string; icon: string; run: () => void }

/** The one primary action for the current step. Every layout asks this, so there is only ever one. */
export function usePrimary(): { primary: Action | null; secondary: Secondary | null; also?: Action } {
  const s = useStore();
  return derive(s);
}

function derive(s: ReturnType<typeof useStore.getState>): { primary: Action | null; secondary: Secondary | null; also?: Action } {
  const p = s.phase;
  // Either person can open the visit: the patient by signing, or the doctor with a greeting.
  if (p === "start") return {
    primary: { side: "patient", label: "Start signing", icon: "hand", tone: "teal", run: s.startSigning },
    secondary: null,
    also: { side: "doctor", label: "Doctor, tap to speak", icon: "mic", tone: "coral", run: s.doctorSpeak },
  };
  if (p === "signing") return { primary: { side: "patient", label: s.checking ? "Checking your signs…" : "Done signing", icon: "stop", tone: "teal", run: s.doneSigning, disabled: s.checking }, secondary: null };
  if (p === "uncertain") return { primary: { side: "patient", label: "Sign again", icon: "again", tone: "dark", run: s.startSigning }, secondary: null };
  if (p === "speaking") {
    if (s.speech.status !== "done") return { primary: null, secondary: null };
    return {
      primary: { side: "doctor", label: "Doctor, tap to speak", icon: "mic", tone: "coral", run: s.doctorSpeak },
      secondary: { side: "doctor", label: "Say it again", icon: "speaker", run: s.sayAgain },
    };
  }
  if (p === "listening") {
    return s.sttError
      ? { primary: { side: "doctor", label: "Try again", icon: "mic", tone: "coral", run: s.doneSpeaking }, secondary: null }
      : { primary: { side: "doctor", label: "Done speaking", icon: "wave", tone: "coral", run: s.doneSpeaking, on: true }, secondary: null };
  }
  if (p === "watching") {
    if (!s.reply?.done) return { primary: null, secondary: null };
    return {
      primary: { side: "patient", label: "Reply in sign", icon: "hand", tone: "teal", run: s.startSigning },
      secondary: { side: "patient", label: "Watch again", icon: "play", run: s.watchAgain },
    };
  }
  if (p === "ended" && !s.summaryOpen) return { primary: { side: "patient", label: "Start a new visit", icon: "arrow", tone: "dark", run: s.newVisit }, secondary: null };
  return { primary: null, secondary: null };
}

export function PrimaryAction({ side, extra }: { side: "patient" | "doctor"; extra?: React.ReactNode }) {
  const { primary, secondary, also } = usePrimary();
  const demo = useStore((s: State) => s.demo);
  const showP = primary?.side === side;
  const showS = secondary?.side === side;
  const showA = also?.side === side;
  if (!showP && !showS && !showA && !extra) return null;
  return (
    <div className="acts">
      {showP && primary && (
        <button
          className={`btn pri ${primary.tone}${primary.on ? " on" : ""}`}
          onClick={primary.run}
          disabled={primary.disabled || demo}
          data-primary
        >
          <span className="bd">{primary.icon === "wave" ? <Wave n={4} /> : <Icon name={primary.icon} />}</span>
          {primary.label}
        </button>
      )}
      {showA && also && (
        <button className={`btn pri ${also.tone}`} onClick={also.run} disabled={demo}>
          <span className="bd"><Icon name={also.icon} /></span>
          {also.label}
        </button>
      )}
      {showS && secondary && (
        <button className="link" onClick={secondary.run} disabled={demo}>
          <Icon name={secondary.icon} />{secondary.label}
        </button>
      )}
      {extra}
    </div>
  );
}
