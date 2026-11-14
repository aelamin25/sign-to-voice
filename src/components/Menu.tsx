import { ALL_MOCK, isMock, type ServiceName } from "../app/config";
import { ConversationLog } from "./ConversationLog";
import { Icon } from "./Icon";
import { useDialog } from "./useDialog";
import { NUMBERS, SIGNS, SIGN_ICON, glossLabel } from "../lib/signs";
import { useStore, type MenuView } from "../state/store";

const TITLES: Record<MenuView, string> = { main: "Menu", log: "Conversation", signs: "Signs I understand", how: "How it works" };

/** Everything secondary lives here, never on the main screen. */
export function Menu() {
  const view = useStore((s) => s.menu);
  const setMenu = useStore((s) => s.setMenu);
  const ref = useDialog<HTMLElement>(!!view, () => (view && view !== "main" ? setMenu("main") : setMenu(null)), view);
  if (!view) return null;
  return (
    <div className="scrim right" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenu(null); }}>
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby="menuT">
        <div className="dh">
          {view === "main" ? <h2 id="menuT">{TITLES[view]}</h2> : (
            <h2 id="menuT" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="ibtn" onClick={() => setMenu("main")} aria-label="Back to menu"><Icon name="back" /></button>
              {TITLES[view]}
            </h2>
          )}
          <button className="ibtn" onClick={() => setMenu(null)} aria-label="Close menu"><Icon name="x" /></button>
        </div>
        {view === "main" && <MainMenu />}
        {view === "log" && <ConversationLog />}
        {view === "signs" && <SignsGrid />}
        {view === "how" && <HowItWorks />}
      </aside>
    </div>
  );
}

function MainMenu() {
  const s = useStore();
  const n = s.log.length;
  const item = (icon: string, title: string, sub: string | null, onClick: () => void, opts: { disabled?: boolean; chev?: boolean } = {}) => (
    <li>
      <button className="mitem" onClick={onClick} disabled={opts.disabled}>
        <span className="mi"><Icon name={icon} /></span>
        <span className="mt">{title}{sub && <small>{sub}</small>}</span>
        {opts.chev && <Icon name="chev" className="chev" />}
      </button>
    </li>
  );
  return (
    <>
      <ul className="mlist">
        {item("log", "Conversation", n ? `${n} message${n > 1 ? "s" : ""} · End visit from here` : "Nothing yet", () => s.setMenu("log"), { chev: true })}
        {item(s.demo ? "stop" : "play", s.demo ? "Stop the demo" : "Play the full visit", "Scripted demo, start to finish", () => (s.demo ? s.stopDemo() : void s.playDemo()))}
        {item("table", "Tabletop view", "For presenting: the doctor's half faces them", () => s.toggleTabletop(true))}
        {item("question", "Try an unclear sign", "See the safety rule in action", s.tryUnclear, { disabled: s.demo || !["start", "uncertain", "watching", "speaking"].includes(s.phase) || (s.phase === "speaking" && s.speech.status !== "done") || (s.phase === "watching" && !s.reply?.done) })}
        {item("grid", "Signs I understand", "20 medical signs and numbers 1 to 10", () => s.setMenu("signs"), { chev: true })}
      </ul>
      <div className="sec">
        <button className="mitem" role="switch" aria-checked={s.voice} onClick={s.toggleVoice}>
          <span className="mi"><Icon name="speaker" /></span>
          <span className="mt">Demo voice<small>{ALL_MOCK ? "Browser voice in mock mode" : "Speak aloud"}</small></span>
          <span className="sw" aria-hidden="true" />
        </button>
        <div className="mrow">
          <span id="tsl" style={{ display: "flex", alignItems: "center", gap: 14 }}><span className="mi" style={{ width: 40, height: 40, borderRadius: 12, background: "var(--soft)", display: "grid", placeItems: "center" }}><Icon name="text" /></span>Text size</span>
          <span className="seg" role="radiogroup" aria-labelledby="tsl">
            {([[0.9, "Small"], [1, "Medium"], [1.15, "Large"]] as const).map(([v, l]) => (
              <button key={v} role="radio" aria-checked={s.textSize === v} onClick={() => s.setTextSize(v)} style={{ fontSize: `${v}rem` }}>
                A<span className="sr">{l}</span>
              </button>
            ))}
          </span>
        </div>
        <button className="mitem" role="switch" aria-checked={s.reducedMotion} onClick={s.toggleReducedMotion}>
          <span className="mi"><Icon name="motion" /></span>
          <span className="mt">Reduce motion<small>Also follows your system setting</small></span>
          <span className="sw" aria-hidden="true" />
        </button>
      </div>
      <ul className="mlist">
        {item("info", "How it works", null, () => s.setMenu("how"), { chev: true })}
      </ul>
      <div className="sec">
        <p><Icon name="shield" /> Signing video is processed on this device and never stored.</p>
      </div>
    </>
  );
}

function SignsGrid() {
  return (
    <>
      <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
        A 20-sign medical ASL prototype, plus numbers 1 to 10. SignBridge does not translate general ASL.
      </p>
      <ul className="sgrid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {SIGNS.map((g) => (
          <li key={g} className="sg"><Icon name={SIGN_ICON[g]} />{glossLabel(g)}</li>
        ))}
        <li className="sg"><span className="num">1–10</span>Numbers<span className="sr">{NUMBERS.join(", ")}</span></li>
      </ul>
    </>
  );
}

const HOW: [string, React.ReactNode, ServiceName | null][] = [
  ["Recognition", "MediaPipe hand and pose landmarks on this device, then a classifier trained on the 20 medical signs.", "recognition"],
  ["Claude", "Turns signs into a natural sentence, holds back anything unclear, rewrites the doctor in plain words and explains jargon, writes the visit summary.", "translate"],
  ["ElevenLabs", "Text to speech gives the patient a voice. Scribe v2 Realtime transcribes the doctor live.", "tts"],
  ["Anam", <>Maya, the avatar who speaks the patient's words with lip-sync. Tools: <code>speak_patient_message</code> <code>request_clarification</code> <code>generate_sign_video</code> <code>create_visit_summary</code>.</>, "avatar"],
  ["Sign video", "The doctor's reply, in plain words, played back as sign video with synced captions.", "signVideo"],
  ["Safety", "If recognition is less than 60% sure, nothing is spoken. The patient is asked to sign again.", null],
];

function HowItWorks() {
  const svcs: ServiceName[] = ["recognition", "translate", "tts", "stt", "avatar", "signVideo"];
  return (
    <>
      {HOW.map(([a, b]) => (
        <div key={a} className="how"><b>{a}</b><span>{b}</span></div>
      ))}
      <div className="sec">
        <h3>Running now</h3>
        <div className="modes">
          {svcs.map((n) => <span key={n} className={isMock(n) ? "" : "real"}>{n}: {isMock(n) ? "mock" : "live"}</span>)}
        </div>
      </div>
      <div className="sec">
        <p>Not a replacement for a certified medical interpreter.</p>
      </div>
    </>
  );
}
