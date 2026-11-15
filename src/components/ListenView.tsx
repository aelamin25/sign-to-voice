import { Icon } from "./Icon";
import { useStore } from "../state/store";

/** Doctor speaks: pulsing mic + live transcript, then "Making your sign video…" with progress. */
export function ListenView() {
  const phase = useStore((s) => s.phase);
  const transcript = useStore((s) => s.transcript);
  const err = useStore((s) => s.sttError);
  const gen = useStore((s) => s.gen);
  const listening = phase === "listening";

  if (phase !== "listening" && phase !== "generating") return null;
  const pct = Math.round(gen.progress * 100);
  const steps = ["Words written down", "Plain words, jargon explained", "Sign video"];

  return (
    <section className="card coral" aria-label="The doctor is speaking">
      <div className="listenhead">
        {listening ? <span className="micring" aria-hidden="true"><Icon name="mic" /></span> : <span className="micring" aria-hidden="true" style={{ background: "var(--ink)" }}><Icon name="spark" /></span>}
        <div>
          <h3>{listening ? (err ? "Mic problem" : "Listening…") : "Making your sign video…"}</h3>
          <p>{listening ? "Speak normally. It ends when you pause." : "For the patient, in plain words."}</p>
        </div>
      </div>
      {err ? (
        <p className="warn" role="alert"><Icon name="info" />{err}</p>
      ) : (
        <p className={`transcript${transcript ? "" : " ph"}`} aria-live="polite">
          {transcript || "Doctor, please speak now."}
          {listening && <span className="caret coral" />}
        </p>
      )}
      {phase === "generating" && (
        <>
          <div className="gen" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Making the sign video">
            <span className="bar"><i style={{ width: `${Math.max(4, pct)}%` }} /></span>
            <span className="pc">{pct}%</span>
          </div>
          <ul className="substeps">
            {steps.map((t, i) => (
              <li key={t} className={gen.stage > i ? "done" : ""}>
                <Icon name={gen.stage > i ? "check" : "clock"} />{t}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Quiet summary of the doctor's last words, shown in the doctor column when it isn't active. */
export function DoctorLast() {
  const last = useStore((s) => [...s.log].reverse().find((m) => m.who === "doctor"));
  const phase = useStore((s) => s.phase);
  if (phase === "listening" || phase === "generating" || phase === "speaking" || phase === "watching") return null;
  return (
    <section className="card" aria-label="Doctor">
      <div className="mtop"><span className="pair"><b>Voice</b><Icon name="arrow" /><b>Sign video</b></span><span>{last ? "Last said" : phase === "start" ? "Doctor starts" : "Waiting"}</span></div>
      <p className={`transcript${last ? "" : " ph"}`}>{last ? last.text : phase === "start" ? "The doctor starts. Tap the button and greet the patient." : "When the patient has spoken, the doctor taps to reply."}</p>
    </section>
  );
}
