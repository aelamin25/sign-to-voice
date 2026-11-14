import { useEffect } from "react";
import { AvatarStage } from "../components/AvatarStage";
import { CameraPanel } from "../components/CameraPanel";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { ListenView, DoctorLast } from "../components/ListenView";
import { LiveTranslation } from "../components/LiveTranslation";
import { Menu } from "../components/Menu";
import { PrimaryAction } from "../components/PrimaryAction";
import { SignChips } from "../components/SignChips";
import { SignVideoPlayer } from "../components/SignVideoPlayer";
import { StepBar } from "../components/StepBar";
import { TabletopView } from "../components/TabletopView";
import { Toast } from "../components/Toast";
import { VisitSummary } from "../components/VisitSummary";
import { activeSide } from "../state/machine";
import { useStore } from "../state/store";

export function App() {
  const phase = useStore((s) => s.phase);
  const textSize = useStore((s) => s.textSize);
  const rm = useStore((s) => s.reducedMotion);
  const tabletop = useStore((s) => s.tabletop);
  const demo = useStore((s) => s.demo);
  const stopDemo = useStore((s) => s.stopDemo);
  const side = activeSide(phase);
  // re-run the focus/scroll effect when a step's button appears (e.g. after Maya finishes speaking)
  const primaryKey = useStore((s) => `${s.speech.status}|${s.reply?.done ?? ""}|${s.sttError ?? ""}|${s.summaryOpen}`);
  const blocked = tabletop;

  useEffect(() => {
    document.documentElement.style.setProperty("--ts", String(textSize));
    document.documentElement.classList.toggle("rm", rm);
  }, [textSize, rm]);

  // Move focus to the step's primary button when the step changes (keyboard + screen reader users).
  useEffect(() => {
    if (tabletop) return;
    const t = setTimeout(() => {
      const b = document.querySelector<HTMLButtonElement>("main [data-primary]:not(:disabled)");
      if (!b || document.activeElement?.closest(".drawer, .dlg") != null) return;
      b.focus({ preventScroll: true });
      const r = b.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 16 || r.top < 0) {
        const reduce = rm || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        b.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [phase, tabletop, rm, primaryKey]);

  return (
    <>
      <a className="skip" href="#main">Skip to the conversation</a>
      <div inert={blocked || undefined}>
        <Header />
        <StepBar />
        <main id="main">
          <h1 className="sr">SignBridge: sign language to speech at the doctor's, and the doctor's words back to sign</h1>
          <div className="cols">
            <PatientColumn active={side === "patient"} hidePlayer={tabletop} />
            <DoctorColumn active={side === "doctor"} />
          </div>
        </main>
        <footer>
          <p>Unclear signs are never spoken. Not a replacement for a certified medical interpreter.</p>
          <p>20-sign medical ASL prototype</p>
        </footer>
      </div>
      {demo && (
        <div className="demoband" role="status">
          <span className="dot" aria-hidden="true" />Playing the full visit
          <button onClick={stopDemo}>Stop</button>
        </div>
      )}
      <TabletopView />
      <Menu />
      <VisitSummary />
      <Toast />
    </>
  );
}

function ColumnLabel({ who, active }: { who: "patient" | "doctor"; active: boolean }) {
  const phase = useStore((s) => s.phase);
  const turn =
    who === "patient"
      ? phase === "uncertain" ? "Sign again" : phase === "watching" ? "Watch" : phase === "ended" ? "Visit ended" : "Your turn"
      : phase === "speaking" ? "Listen" : "Doctor's turn";
  return (
    <div className="lab">
      <h2 id={`${who}T`}>
        <span className="k" style={{ background: who === "patient" ? "var(--teal)" : "var(--coral)" }} />
        {who === "patient" ? "Patient" : "Doctor"}
      </h2>
      {active ? <span className="yourturn"><i aria-hidden="true" />{turn}</span> : <small>{who === "patient" ? "Signs in ASL" : "Hears the patient's voice"}</small>}
    </div>
  );
}

function PatientColumn({ active, hidePlayer }: { active: boolean; hidePlayer: boolean }) {
  const phase = useStore((s) => s.phase);
  return (
    <section
      className={`col patient ${active ? "active" : "quiet"}${phase === "uncertain" ? " amberish" : ""}`}
      aria-labelledby="patientT"
      aria-current={active ? "true" : undefined}
    >
      <ColumnLabel who="patient" active={active} />
      <div className="colbody">
        {phase === "watching" ? (
          hidePlayer ? null : <SignVideoPlayer />
        ) : phase === "ended" ? (
          <EndedCard />
        ) : (
          <>
            <CameraPanel />
            <SignChips />
            <LiveTranslation />
          </>
        )}
        <PrimaryAction side="patient" />
      </div>
    </section>
  );
}

function DoctorColumn({ active }: { active: boolean }) {
  return (
    <section className={`col doctor ${active ? "active" : "quiet"}`} aria-labelledby="doctorT" aria-current={active ? "true" : undefined}>
      <ColumnLabel who="doctor" active={active} />
      <div className="colbody">
        <AvatarStage />
        <ListenView />
        <DoctorLast />
        <PrimaryAction side="doctor" />
      </div>
    </section>
  );
}

function EndedCard() {
  const reopen = () => useStore.setState({ summaryOpen: true });
  const n = useStore((s) => s.log.length);
  return (
    <section className="card" aria-label="Visit ended">
      <div className="mtop"><span className="ok"><Icon name="check" />Visit ended</span><span>{n} message{n === 1 ? "" : "s"}</span></div>
      <p className="sent" style={{ minHeight: 0 }}>Thank you. Your summary is ready.</p>
      <div className="acts"><button className="link" onClick={reopen}><Icon name="log" />Open the visit summary</button></div>
    </section>
  );
}
