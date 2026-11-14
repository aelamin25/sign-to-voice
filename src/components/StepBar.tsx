import { STEPS, stepOf } from "../state/machine";
import { useStore } from "../state/store";

export function StepBar() {
  const phase = useStore((s) => s.phase);
  const cur = stepOf(phase);
  const current = STEPS.find((s) => s.n === cur);
  const announce =
    phase === "start" ? "Ready. Step 1 of 4: You sign."
      : phase === "ended" ? "Visit ended."
        : phase === "uncertain" ? "Step 1 of 4: Not sure. Please sign again."
          : `Step ${cur} of 4: ${current?.label}.`;
  return (
    <nav className="stepbar" aria-label="Conversation steps">
      <p className="sr" aria-live="polite">{announce}</p>
      <ol className="steps">
        {STEPS.map((s) => {
          const state = cur === 5 || s.n < cur ? "done" : s.n === cur ? "cur" : "";
          const amber = phase === "uncertain" && s.n === 1;
          return (
            <li
              key={s.n}
              className={`${state}${amber ? " amber" : ""}`}
              style={{ ["--c" as string]: s.tone === "teal" ? "var(--teal)" : "var(--coral)" }}
              aria-current={state === "cur" ? "step" : undefined}
            >
              <span className="seg" aria-hidden="true" />
              <span className="lbl"><span className="n">{s.n}</span><span className="t">{amber ? "Sign again" : s.label}</span></span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
