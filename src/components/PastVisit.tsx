import { useState } from "react";
import { Icon } from "./Icon";
import { downloadSummary, forgetVisit, savedVisits, visitDateLabel } from "../lib/visits";

/** The patient's last saved visit, to show the doctor at a follow-up. Read from this device only. */
export function PastVisit() {
  const [visits, setVisits] = useState(savedVisits);
  const last = visits[0];
  if (!last) {
    return <p style={{ color: "var(--muted)" }}>Nothing saved yet. At the end of a visit, choose "Save with my permission" or "Download my copy".</p>;
  }
  const s = last.summary;
  return (
    <div className="pastvisit">
      <p style={{ color: "var(--muted)", margin: "0 0 12px" }}>{visitDateLabel(last.date)}. Show this to your doctor.</p>
      <h3>What I said</h3>
      <ul>{s.said.length ? s.said.map((t, i) => <li key={i}>{t}</li>) : <li>Nothing</li>}</ul>
      <h3>What the doctor said</h3>
      <ul>{s.doctor.length ? s.doctor.map((t, i) => <li key={i}>{t}</li>) : <li>Nothing</li>}</ul>
      <h3>Medicine</h3>
      <ul>{s.medicines.length ? s.medicines.map((m) => <li key={m.name}>{[m.name, m.dose, m.when].filter(Boolean).join(", ")}</li>) : <li>None given</li>}</ul>
      <h3>Next appointment</h3>
      <ul><li>{s.next ?? "Not set"}</li></ul>
      <div className="dacts" style={{ marginTop: 14 }}>
        <button className="btn" onClick={() => { forgetVisit(last.date); setVisits(savedVisits()); }}>Forget this visit</button>
        <button className="btn pri teal" onClick={() => downloadSummary(s, last.date)}><Icon name="save" />Download my copy</button>
      </div>
    </div>
  );
}
