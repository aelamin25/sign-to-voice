import { isMock, type ServiceName } from "../app/config";
import { Icon } from "../components/Icon";
import { useDialog } from "../components/useDialog";
import { SIGNS, SIGN_ICON, glossLabel } from "../lib/signs";
import { useStore, type MenuView } from "../state/store";
import { ConversationList } from "./shared";

const TITLE: Record<MenuView, string> = { main: "Menu", log: "Conversation", signs: "Signs I understand", how: "How it works" };

/** Bottom sheets. Uses the shared store's `menu` state, so it stays in sync with the web view. */
export function Sheets() {
  const view = useStore((s) => s.menu);
  const setMenu = useStore((s) => s.setMenu);
  const ref = useDialog<HTMLDivElement>(!!view, () => setMenu(null), view);
  if (!view) return null;
  return (
    <div className="m-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenu(null); }}>
      <div ref={ref} className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-sheet-t">
        <div className="m-grab" aria-hidden="true" />
        <div className="m-sh">
          <h2 id="m-sheet-t">{TITLE[view]}</h2>
          <button className="m-ibtn" onClick={() => setMenu(null)} aria-label="Close"><Icon name="x" /></button>
        </div>
        {view === "main" && <MenuBody />}
        {view === "log" && <LogBody />}
        {view === "signs" && <SignsBody />}
        {view === "how" && <HowBody />}
      </div>
    </div>
  );
}

function LogBody() {
  const n = useStore((s) => s.log.length);
  const phase = useStore((s) => s.phase);
  const endVisit = useStore((s) => s.endVisit);
  return (
    <>
      <ConversationList />
      {n > 0 && phase !== "ended" && (
        <div className="m-btnrow"><button className="m-btn" onClick={() => void endVisit()}><Icon name="door" />End visit</button></div>
      )}
    </>
  );
}

function MenuBody() {
  const s = useStore();
  const canUnclear = !s.demo && (s.phase === "start" || s.phase === "uncertain" || (s.phase === "speaking" && s.speech.status === "done") || (s.phase === "watching" && !!s.reply?.done));
  const sizes = [[0.9, "Small"], [1, "Medium"], [1.15, "Large"]] as const;
  return (
    <>
      <button className="m-mi pri" onClick={() => (s.demo ? s.stopDemo() : void s.playDemo())}>
        <Icon name={s.demo ? "stop" : "play"} />{s.demo ? "Stop the demo" : "Play the full visit"}
      </button>
      <button className="m-mi" onClick={() => s.toggleTabletop(true)}>
        <Icon name="tabletop" /><span>Tabletop view<small>For presenting. Lay the phone flat between you.</small></span>
      </button>
      <button className="m-mi" onClick={s.tryUnclear} disabled={!canUnclear}>
        <Icon name="again" /><span>Try an unclear sign<small>See how SignBridge holds back</small></span>
      </button>
      <button className="m-mi" onClick={() => s.setMenu("signs")}><Icon name="hand" />Signs I understand</button>
      <button className="m-mi" onClick={() => s.setMenu("log")}><Icon name="list" />Conversation and end visit</button>
      <button className="m-mi" role="switch" aria-checked={s.voice} onClick={s.toggleVoice}>
        <Icon name="speaker" />Demo voice<span className="sw" aria-hidden="true" />
      </button>
      <div className="m-mi" style={{ cursor: "default" }}>
        <Icon name="lines" /><span id="m-tsl">Text size</span>
        <span className="m-seg" role="radiogroup" aria-labelledby="m-tsl">
          {sizes.map(([v, l]) => (
            <button key={v} role="radio" aria-checked={s.textSize === v} onClick={() => s.setTextSize(v)} style={{ fontSize: `${v}rem` }}>
              A<span className="sr">{l}</span>
            </button>
          ))}
        </span>
      </div>
      <button className="m-mi" onClick={() => s.setMenu("how")}><Icon name="info" />How it works</button>
      <button className="m-mi" onClick={() => { if (s.demo) s.stopDemo(); s.newVisit(); s.setMenu(null); }}>
        <Icon name="trash" />Clear and start again
      </button>
      <p className="m-note"><Icon name="shield" />Signing video stays on the phone and is never stored. Not a replacement for a certified medical interpreter.</p>
    </>
  );
}

function SignsBody() {
  return (
    <>
      <p style={{ color: "var(--muted)", margin: "0 0 12px" }}>A 20-sign medical ASL prototype, plus numbers 1 to 10.</p>
      <ul className="m-sgrid">
        {SIGNS.map((g) => <li key={g} className="m-sg"><Icon name={SIGN_ICON[g]} />{glossLabel(g)}</li>)}
        <li className="m-sg"><span className="num">1–10</span>Numbers</li>
      </ul>
    </>
  );
}

const HOW: [string, React.ReactNode][] = [
  ["Recognition", "MediaPipe landmarks on this phone and a classifier trained on medical ASL signs."],
  ["Claude", "Turns signs into a sentence, holds back unclear signs, rewrites the doctor in plain words."],
  ["ElevenLabs", "Gives the patient a voice, and Scribe transcribes the doctor live."],
  ["Anam", <>Maya, the avatar who speaks for the patient. Tools: <code>speak_patient_message</code> <code>request_clarification</code> <code>generate_sign_video</code></>],
  ["Sign video", "The doctor's reply becomes a sign video for the patient."],
];

function HowBody() {
  const svcs: ServiceName[] = ["recognition", "translate", "tts", "stt", "avatar", "signVideo"];
  const anyReal = svcs.some((n) => !isMock(n));
  return (
    <>
      {HOW.map(([a, b]) => <div key={a} className="m-how"><b>{a}</b>{b}</div>)}
      <p className="m-note">{anyReal ? `Live: ${svcs.filter((n) => !isMock(n)).join(", ")}.` : "Running on demo data."}</p>
    </>
  );
}
