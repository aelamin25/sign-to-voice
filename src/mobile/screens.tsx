import { useEffect, useRef, useState } from "react";
import { CAMERA_STREAM, isMock, PYTHON_RECOGNITION } from "../app/config";
import { LiveStream } from "../components/LiveStream";
import { Icon } from "../components/Icon";
import { Portrait, Silhouette } from "../components/Illustrations";
import { useSignVideoPlayback } from "../components/SignVideoPlayer";
import { Highlighted, Words } from "../components/Words";
import { glossLabel } from "../lib/signs";
import { services } from "../services";
import { AVATAR_VIDEO_ID } from "../state/media";
import { useStore } from "../state/store";
import { MobileCamera, useCameraBlocked } from "./MobileCamera";
import { ConversationList, MiniAvatar, MWave } from "./shared";

/* 1. Start */
export function StartScreen() {
  const start = useStore((s) => s.startSigning);
  const doctorFirst = useStore((s) => s.doctorSpeak);
  const demo = useStore((s) => s.demo);
  return (
    <>
      <div className="m-hero">
        <div className="m-orb" aria-hidden="true"><i /><i /><i /><span><Icon name="hand" /></span></div>
        <h2>Ready when<br />you are.</h2>
        <p>The doctor speaks first. Then sign to the camera, and SignBridge speaks for you.</p>
      </div>
      <div className="m-foot">
        <button className="m-cta coral" onClick={() => void doctorFirst()} disabled={demo} data-primary><Icon name="mic" />Doctor, tap to speak</button>
        <button className="m-link" onClick={() => void start()} disabled={demo}>Sign first instead</button>
      </div>
    </>
  );
}

/* 2. You sign (+ uncertain) */
export function SignScreen() {
  const s = useStore();
  const blocked = useCameraBlocked();
  const uncertain = s.phase === "uncertain";
  const signing = s.phase === "signing";
  const text = s.liveSentence;
  const live = uncertain
    ? "Not sure what you signed. Please sign again. Nothing was spoken."
    : blocked ? "" : text || "Watching your hands…";
  const cls = `m-live${uncertain ? " amb" : !text ? " ph" : ""}`;

  let foot: React.ReactNode;
  if (blocked) foot = <button className="m-cta dark" onClick={() => void s.restartSigning()} data-primary><Icon name="again" />Try again</button>;
  else if (uncertain) foot = <button className="m-cta dark" onClick={() => void s.startSigning()} disabled={s.demo} data-primary><Icon name="again" />Sign again</button>;
  else if (signing && !s.checking) foot = <button className="m-cta dark" onClick={() => void s.doneSigning()} disabled={s.demo} data-primary><Icon name="stop" />Done signing</button>;
  else foot = <span className="m-status"><Icon name="check" />Sending to the doctor…</span>;

  return (
    <>
      <div className="m-grow">
        <MobileCamera />
        <div className="m-chips" aria-label="Signs recognised">
          {s.chips.map((c) => <span key={c.id} className={`m-chip${c.gloss === "?" ? " q" : ""}`}>{glossLabel(c.gloss)}</span>)}
        </div>
        <p className={cls} aria-live="polite" role={uncertain ? "alert" : undefined}>
          {live}{signing && text && !s.checking ? <span className="m-caret" /> : null}
        </p>
      </div>
      <div className="m-foot">{foot}</div>
    </>
  );
}

/* 3. The doctor hears you */
export function SpeakScreen() {
  const speech = useStore((s) => s.speech);
  const demo = useStore((s) => s.demo);
  const doctorSpeak = useStore((s) => s.doctorSpeak);
  const sayAgain = useStore((s) => s.sayAgain);
  const done = speech.status === "done";
  const mirror = useRef<HTMLVideoElement>(null);
  const live = !isMock("avatar") && !demo && services(false).avatar.isLive();

  // Show the live Anam stream: mirror the persistent (audio-carrying) element's stream, muted.
  useEffect(() => {
    if (!live || !mirror.current) return;
    const src = document.getElementById(AVATAR_VIDEO_ID) as HTMLVideoElement | null;
    if (src?.srcObject) { mirror.current.srcObject = src.srcObject; void mirror.current.play().catch(() => undefined); }
  }, [live]);

  return (
    <>
      <div className="m-grow">
        <div className={`m-av${done ? "" : " spk"}`} role="img" aria-label="Maya, speaking for you">
          <div className="m-halo" />
          {live ? <video ref={mirror} className="m-anam" muted playsInline autoPlay /> : <div className="m-portrait"><Portrait /></div>}
          <span className="m-avtag"><i><Icon name="steth" /></i><b>Maya</b>speaking for you</span>
        </div>
        <p className="m-words" aria-live="polite"><Words text={speech.text} index={speech.index} /></p>
        <p className="m-via">Voice by ElevenLabs, avatar by Anam</p>
      </div>
      <div className="m-foot">
        {done ? (
          <>
            <button className="m-cta coral" onClick={() => void doctorSpeak()} disabled={demo} data-primary><Icon name="mic" />Doctor, tap to speak</button>
            <button className="m-link" onClick={() => void sayAgain()} disabled={demo}>Say it again</button>
          </>
        ) : (
          <span className="m-status" style={{ color: "var(--teal)" }}><MWave n={6} />Speaking to the doctor</span>
        )}
      </div>
    </>
  );
}

/* 4. The doctor speaks (listening, then making the sign video) */
export function ListenScreen() {
  const phase = useStore((s) => s.phase);
  const transcript = useStore((s) => s.transcript);
  const err = useStore((s) => s.sttError);
  const gen = useStore((s) => s.gen);
  const demo = useStore((s) => s.demo);
  const doneSpeaking = useStore((s) => s.doneSpeaking);
  const generating = phase === "generating";

  let foot: React.ReactNode;
  if (generating) {
    foot = (
      <>
        <span className="m-status"><Icon name="spark" />Making your sign video…</span>
        <div className="m-bar" role="progressbar" aria-label="Making the sign video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(gen.progress * 100)}>
          <i style={{ width: `${Math.max(5, gen.progress * 100)}%` }} />
        </div>
      </>
    );
  } else if (err) {
    foot = <button className="m-cta coral" onClick={doneSpeaking} disabled={demo} data-primary><Icon name="mic" />Try again</button>;
  } else {
    foot = (
      <>
        <span className="m-status" style={{ color: "var(--coral)" }}><MWave n={8} /><span style={{ color: "var(--muted)" }}>Live transcript by ElevenLabs Scribe</span></span>
        <button className="m-link" onClick={doneSpeaking} disabled={demo}>Done speaking</button>
      </>
    );
  }

  return (
    <>
      <div className="m-lis">
        <span className="m-who">
          <MiniAvatar />
          <span>{generating ? <><b>Got it.</b> Turning it into sign</> : <><b>Listening</b> to the doctor</>}</span>
        </span>
        <div className={`m-micorb${generating ? " m-gen" : ""}`} aria-hidden="true"><i /><i /><i /><span><Icon name="mic" /></span></div>
        {err ? (
          <p className="m-tr err" role="alert">{err}</p>
        ) : (
          <p className="m-tr" aria-live="polite">{transcript}{generating ? null : <span className="m-caret" />}</p>
        )}
      </div>
      <div className="m-foot">{foot}</div>
    </>
  );
}

/* 5. You watch the reply */
export function WatchScreen() {
  const watchAgain = useStore((s) => s.watchAgain);
  const reply_ = useStore((s) => s.startSigning);
  const demo = useStore((s) => s.demo);
  const { reply, videoRef, onEnded } = useSignVideoPlayback();
  const [streamDown, setStreamDown] = useState(false);
  if (!reply) return null;
  const done = reply.done;
  // As on the web view: the sign reader watches the whole time, so the patient can answer as soon as
  // they have read the reply. Their own camera stays on screen with the doctor's words written over
  // it, instead of a drawn signer "playing a sign video".
  const camera = PYTHON_RECOGNITION && !!CAMERA_STREAM && !demo && !reply.clips.length;
  const showCamera = camera && !streamDown;

  return (
    <>
      <div className="m-grow">
        <div className={`m-cam${done ? "" : " sign"}`} role="region" aria-label="Sign video of the doctor's reply">
          {reply.clips.length ? (
            <video ref={videoRef} className="m-clip" playsInline muted onEnded={onEnded} onError={onEnded} />
          ) : (
            <>
              {camera && <LiveStream className="m-video" visible onDown={setStreamDown} />}
              {!showCamera && <Silhouette signing={!done} />}
            </>
          )}
          <span className="m-vtag"><i />{showCamera ? (done ? "Camera on. Sign your answer" : "The doctor's reply") : done ? "Sign video" : "Playing sign video"}</span>
          {done && !showCamera && <button className="m-playv" onClick={watchAgain} aria-label="Watch again"><Icon name="play" /></button>}
          <div className="m-cc">{done ? reply.plain : <Words text={reply.plain} index={reply.index} />}</div>
        </div>
        {done && (
          <p className="m-orig" aria-live="polite">
            The doctor said: <Highlighted text={reply.text} terms={reply.terms} />
            {reply.terms.length > 0 && (
              <>
                <br />
                {reply.terms.map((t, i) => <span key={t.term}><b>{t.term}</b> means {t.meaning}{i < reply.terms.length - 1 ? ". " : "."}</span>)}
              </>
            )}
          </p>
        )}
      </div>
      <div className="m-foot">
        {done ? (
          <>
            {showCamera && <span className="m-status" style={{ color: "var(--teal)" }}><Icon name="hand" />Sign your answer. Finish with a thumbs up.</span>}
            <button className="m-cta teal" onClick={() => void reply_()} disabled={demo} data-primary><Icon name="hand" />Reply in sign</button>
            {!showCamera && <button className="m-link" onClick={watchAgain} disabled={demo}>Watch again</button>}
          </>
        ) : (
          <span className="m-status"><Icon name={showCamera ? "hand" : "play"} />{showCamera ? "Read the doctor's reply. You can sign your answer now." : "Watch the doctor's reply"}</span>
        )}
      </div>
    </>
  );
}

/* End: the visit summary */
export function EndScreen() {
  const summary = useStore((s) => s.summary);
  const saved = useStore((s) => s.saved);
  const setSaved = useStore((s) => s.setSaved);
  const newVisit = useStore((s) => s.newVisit);
  const med = summary?.medicines[0];
  return (
    <div className="m-grow m-end">
      <h2>Your visit</h2>
      <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>In plain words. Saved only if you say so.</p>
      {!summary ? (
        <p className="m-lab2" aria-live="polite">Writing your summary…</p>
      ) : (
        <>
          {(med || summary.next) && (
            <div className="m-sumrow">
              {summary.medicines.map((m) => <span key={m.name}><Icon name="med" />{m.name}</span>)}
              {med?.dose && <span><Icon name="sun" />{med.dose}</span>}
              {med?.when && <span><Icon name="food" />{med.when}</span>}
              {summary.next && <span><Icon name="cal" />{summary.next}</span>}
            </div>
          )}
          <p className="m-lab2">Full conversation</p>
          <ConversationList />
          {saved === null ? (
            <div className="m-btnrow">
              <button className="m-btn" onClick={() => setSaved(false)}>Don't save</button>
              <button className="m-btn teal" onClick={() => setSaved(true)}><Icon name="save" />Save</button>
            </div>
          ) : (
            <p className={`m-saved${saved ? "" : " no"}`} role="status"><Icon name="check" />{saved ? "Saved on this phone only." : "Not saved. Nothing was stored."}</p>
          )}
        </>
      )}
      <div className="m-btnrow">
        <button className="m-btn" onClick={newVisit}><Icon name="again" />Start a new visit</button>
      </div>
    </div>
  );
}
