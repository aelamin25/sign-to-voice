import { Icon } from "./Icon";
import { useDialog } from "./useDialog";
import { useStore } from "../state/store";
import { downloadSummary } from "../lib/visits";

const todayLabel = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" });

function Row({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="srow">
      <span className="si"><Icon name={icon} /></span>
      <div><h3>{title}</h3>{children}</div>
    </div>
  );
}

export function VisitSummary() {
  const open = useStore((s) => s.summaryOpen);
  const summary = useStore((s) => s.summary);
  const saved = useStore((s) => s.saved);
  const setSaved = useStore((s) => s.setSaved);
  const close = useStore((s) => s.closeSummary);
  const ref = useDialog<HTMLDivElement>(open, close, !!summary);
  if (!open) return null;

  const date = todayLabel();

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={ref} className="dlg sum" role="dialog" aria-modal="true" aria-labelledby="sumT" aria-busy={!summary}>
        <div className="dh">
          <h2 id="sumT">Your visit</h2>
          <button className="ibtn" onClick={close} aria-label="Close summary"><Icon name="x" /></button>
        </div>
        <p style={{ color: "var(--muted)", margin: "0 0 14px" }}>In plain words, {date}.</p>
        {!summary ? (
          <p className="pending" aria-live="polite">Writing your summary…</p>
        ) : (
          <>
            <Row icon="hand" title="What I said">
              <ul>{summary.said.length ? summary.said.map((t, i) => <li key={i}>{t}</li>) : <li>Nothing yet</li>}</ul>
            </Row>
            <Row icon="steth" title="What the doctor said">
              <ul>{summary.doctor.length ? summary.doctor.map((t, i) => <li key={i}>{t}</li>) : <li>Nothing yet</li>}</ul>
            </Row>
            <Row icon="med" title="Medicine">
              {summary.medicines.length ? (
                <div className="pillset">
                  {summary.medicines.map((m) => (
                    <span key={m.name}><Icon name="med" />{m.name}</span>
                  ))}
                  {summary.medicines[0].dose && <span><Icon name="sun" />{summary.medicines[0].dose}</span>}
                  {summary.medicines[0].when && <span><Icon name="food" />{summary.medicines[0].when}</span>}
                </div>
              ) : <ul><li>None given</li></ul>}
            </Row>
            <Row icon="cal" title="Next appointment">
              <ul><li>{summary.next ?? "Not set"}</li></ul>
            </Row>
            {saved === null ? (
              <div className="dacts">
                <button className="btn" onClick={() => setSaved(false)}>Don't save</button>
                <button className="btn pri teal" onClick={() => setSaved(true)}><Icon name="save" />Save with my permission</button>
              </div>
            ) : (
              <p className={`saved${saved ? "" : " no"}`} role="status">
                <Icon name="check" />{saved ? "Saved on this device only. Find it next time under Menu, My last visit." : "Not saved. Nothing was stored."}
              </p>
            )}
            <div className="dacts" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => downloadSummary(summary)}><Icon name="save" />Download my copy</button>
            </div>
            <p style={{ color: "var(--muted)", margin: "8px 0 0", fontSize: ".9rem" }}>
              Keep your copy and show it at your next visit, so you don't have to start again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
