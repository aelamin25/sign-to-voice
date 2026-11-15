import { EXPRESSION_LABEL } from "../lib/expression";
import { glossLabel, isNumber, type Gloss } from "../lib/signs";
import { useStore } from "../state/store";

function ChipLabel({ g }: { g: Gloss }) {
  return isNumber(g) ? <span className="num">{g}</span> : <>{glossLabel(g)}</>;
}

/** Recognised signs, one chip each, popping in as they arrive. */
export function SignChips() {
  const phase = useStore((s) => s.phase);
  const chips = useStore((s) => s.chips);
  const last = useStore((s) => s.lastChips);
  const expression = useStore((s) => s.expression);
  const face = chips.length && expression ? EXPRESSION_LABEL[expression] : null;
  const showLast = !chips.length && last.length && phase !== "signing";
  return (
    <div className="chips" aria-live="polite" aria-label="Signs recognised">
      {chips.length ? (
        <>
          {chips.map((c) => (
            <span key={c.id} className={`chip new${c.gloss === "?" ? " q" : ""}`}>
              <ChipLabel g={c.gloss} />
              <span className="sr">{c.gloss === "?" ? "" : `, ${Math.round(c.confidence * 100)} percent sure`}</span>
            </span>
          ))}
          {face && <span className="chip new face">{face}</span>}
        </>
      ) : showLast ? (
        last.map((g, i) => <span key={i} className="chip faded"><ChipLabel g={g} /></span>)
      ) : (
        <span className="hint">{phase === "signing" ? "Watching your hands…" : "Your signs appear here."}</span>
      )}
    </div>
  );
}
