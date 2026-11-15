import { Icon } from "../components/Icon";
import { Portrait } from "../components/Illustrations";
import type { Phase } from "../state/machine";
import { useStore } from "../state/store";

/** Each phase of the shared state machine maps to one full-screen mobile step. */
export type Screen = "start" | "sign" | "speak" | "listen" | "watch" | "end";

export function screenOf(phase: Phase): Screen {
  switch (phase) {
    case "start": return "start";
    case "signing": case "uncertain": return "sign";
    case "speaking": return "speak";
    case "listening": case "generating": return "listen";
    case "watching": return "watch";
    case "ended": return "end";
  }
}

/** Step bar: [index, tone, label]. Teal = patient steps, coral = doctor steps (as in flow.html). */
export const STEP: Partial<Record<Screen, [number, "p" | "d", string]>> = {
  listen: [0, "d", "The doctor speaks"],
  watch: [1, "d", "You watch the reply"],
  sign: [2, "p", "You sign"],
  speak: [3, "p", "The doctor hears you"],
};

export function MWave({ n = 6 }: { n?: number }) {
  return (
    <span className="m-wave" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <i key={i} style={{ animationDelay: `${((i * 83) % 600) / 1000}s` }} />)}
    </span>
  );
}

export function MiniAvatar() {
  return <span className="m-mav" aria-hidden="true"><Portrait /></span>;
}

/** The full conversation, used by the Conversation sheet and the end screen. */
export function ConversationList() {
  const log = useStore((s) => s.log);
  if (!log.length) return <p className="m-empty">Nothing yet. Start signing to begin.</p>;
  return (
    <ol className="m-log" aria-label="Conversation">
      {log.map((m) =>
        m.who === "patient" ? (
          <li key={m.id} className="m-msg p"><small><Icon name="hand" />You signed</small>{m.text}</li>
        ) : (
          <li key={m.id} className="m-msg d">
            <small><Icon name="mic" />Doctor</small>{m.text}
            <span className="m-pl">In plain words: {m.plain}</span>
          </li>
        ),
      )}
    </ol>
  );
}
