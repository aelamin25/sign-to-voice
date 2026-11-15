import { Icon, Wave } from "./Icon";
import { Words } from "./Words";
import { useStore } from "../state/store";

/** "ASL → English voice" card: builds live while signing, then shows what was spoken. */
export function LiveTranslation() {
  const s = useStore();
  const { phase, speech } = s;

  let tone = "";
  let status: React.ReactNode = <span>Live translation</span>;
  let body: React.ReactNode = <p className="sent ph">Sign your reply. Your words are spoken for you.</p>;
  let warn: React.ReactNode = null;
  let pipe = 0;

  if (phase === "signing") {
    tone = "teal";
    pipe = 1;
    status = s.checking ? <span className="lv"><i />Checking with Claude</span> : <span className="lv"><i />Translating live</span>;
    body = s.liveSentence
      ? <p className="sent">{s.liveSentence}<span className="caret" /></p>
      : <p className="sent ph">Watching your hands…</p>;
  } else if (phase === "uncertain") {
    tone = "amber";
    status = <span className="lv amber">{Math.round(s.uncertainConfidence * 100)}% sure</span>;
    body = <p className="sent ph">I'm not sure what you signed.</p>;
    warn = <p className="warn" role="alert"><Icon name="again" />Not sure — please sign again. Nothing was spoken.</p>;
  } else if (phase === "speaking" && speech.status === "talking") {
    pipe = 2;
    status = <span className="lv"><Wave n={5} />Speaking aloud, {Math.round(speech.confidence * 100)}% sure</span>;
    body = <p className="sent"><Words text={speech.text} index={speech.index} /></p>;
  } else if (speech.text || s.log.some((m) => m.who === "patient")) {
    const lastSaid = speech.text || [...s.log].reverse().find((m) => m.who === "patient")?.text || "";
    status = <span className="ok"><Icon name="check" />Spoken</span>;
    body = <p className="sent">{lastSaid}</p>;
  }

  return (
    <section className={`card ${tone}`} aria-label="Your words in English">
      <div className="mtop">
        <span className="pair"><b>ASL</b><Icon name="arrow" /><b>English voice</b></span>
        <span aria-live="polite">{status}</span>
      </div>
      <div aria-live="polite">{body}</div>
      {warn}
      <div className="pipe" aria-hidden="true">
        <span className={pipe === 1 ? "on" : ""}><Icon name="hand" />Signs</span><Icon name="arrow" />
        <span className={pipe === 1 ? "on" : ""}><Icon name="spark" />Claude</span><Icon name="arrow" />
        <span className={pipe === 2 ? "on" : ""}><Icon name="speaker" />ElevenLabs voice</span><Icon name="arrow" />
        <span className={pipe === 2 ? "on" : ""}><Icon name="steth" />Anam avatar</span>
      </div>
      <p className="note"><Icon name="shield" />Unclear signs are never spoken.</p>
    </section>
  );
}
