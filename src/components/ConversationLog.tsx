import { Icon } from "./Icon";
import { Highlighted } from "./Words";
import { useStore } from "../state/store";

export function ConversationLog() {
  const log = useStore((s) => s.log);
  const endVisit = useStore((s) => s.endVisit);
  const phase = useStore((s) => s.phase);
  return (
    <>
      <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
        Everything said in this visit. Nothing is stored unless you choose to save the summary.
      </p>
      <ol className="tl" aria-label="Conversation">
        {log.length === 0 && <li className="empty">The conversation appears here.</li>}
        {log.map((m) =>
          m.who === "patient" ? (
            <li key={m.id} className="m p">
              <div className="mh"><span className="who"><Icon name="hand" /></span><b>You</b><span className="ok"><Icon name="check" />Spoken</span><span>{Math.round(m.confidence * 100)}% sure</span></div>
              <p className="mt">{m.text}</p>
            </li>
          ) : (
            <li key={m.id} className="m d">
              <div className="mh"><span className="who"><Icon name="mic" /></span><b>Doctor</b></div>
              <p className="mt"><Highlighted text={m.text} terms={m.terms} /></p>
              <div className="pl"><small>In plain words</small><p>{m.plain}</p></div>
            </li>
          ),
        )}
      </ol>
      <div className="dacts">
        <button className="btn pri dark" onClick={endVisit} disabled={phase === "ended"}>
          <span className="bd"><Icon name="door" /></span>End visit
        </button>
      </div>
    </>
  );
}
