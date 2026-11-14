import { Fragment } from "react";
import { splitWords } from "../lib/timing";

/** Word-by-word caption: words before `index` are lit. */
export function Words({ text, index, current = false }: { text: string; index: number; current?: boolean }) {
  const ws = splitWords(text);
  return (
    <>
      {ws.map((w, i) => (
        <Fragment key={i}>
          <span className={`w${i < index ? " on" : ""}${current && i === index - 1 ? " cur" : ""}`}>{w}</span>
          {i < ws.length - 1 ? " " : ""}
        </Fragment>
      ))}
    </>
  );
}

/** Doctor's exact words with medical terms underlined (dotted coral). */
export function Highlighted({ text, terms }: { text: string; terms: { term: string }[] }) {
  if (!terms.length) return <>{text}</>;
  const esc = terms.map((t) => t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const parts = text.split(new RegExp(`\\b(${esc})\\b`, "gi"));
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <span key={i} className="term">{p}</span> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}
