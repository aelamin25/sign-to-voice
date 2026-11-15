import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Silhouette } from "./Illustrations";
import { Highlighted, Words } from "./Words";
import { DOCTOR_TONE_LABEL } from "../lib/expression";
import { totalDuration } from "../lib/timing";
import { useStore } from "../state/store";

/** Plays the doctor's reply as sign video, with plain-word captions synced.
    Real clips play in sequence; with no clips, the animated signer stands in. */
/** Drives sign-video playback and caption sync for the current reply. Shared by the web and mobile views.
    Real clips play in sequence on the given <video>; with no clips, a timer drives the captions. */
export function useSignVideoPlayback() {
  const reply = useStore((s) => s.reply);
  const replyIndex = useStore((s) => s.replyIndex);
  const replyEnded = useStore((s) => s.replyEnded);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clip, setClip] = useState(0);

  // Timer-driven captions (animated signer, or clips with no per-clip mapping)
  useEffect(() => {
    if (!reply || !reply.playing) return;
    setClip(0);
    if (reply.clips.length) return; // clip effect below drives it
    const words = reply.words;
    const dur = totalDuration(words) + 0.4;
    const t0 = performance.now();
    let raf = 0;
    let last = -1;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      let i = words.findIndex((w) => t < w.end);
      if (i === -1) i = words.length;
      if (i !== last) { last = i; replyIndex(i); }
      if (t >= dur) { replyEnded(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reply?.playKey, reply?.playing]);

  // Real clips: play one after another; captions follow the clip → word mapping
  useEffect(() => {
    if (!reply || !reply.playing || !reply.clips.length) return;
    const v = videoRef.current;
    if (!v) return;
    v.src = reply.clips[clip];
    v.play().catch(() => { /* autoplay blocked: user can press play */ });
    const map = reply.clipWordIndex;
    replyIndex(map ? (map[clip + 1] ?? reply.words.length) : Math.round(((clip + 1) / reply.clips.length) * reply.words.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, reply?.playKey, reply?.playing]);

  const onEnded = () => {
    if (!reply) return;
    if (clip + 1 < reply.clips.length) setClip(clip + 1);
    else replyEnded();
  };
  return { reply, videoRef, onEnded };
}

export function SignVideoPlayer() {
  const watchAgain = useStore((s) => s.watchAgain);
  const { reply, videoRef, onEnded } = useSignVideoPlayback();

  if (!reply) return null;
  const playing = reply.playing;

  return (
    <>
      <div className={`view${playing ? " sign" : ""}`} aria-label="Sign video of the doctor's reply" role="region">
        {reply.clips.length ? (
          <video ref={videoRef} className="clip" playsInline muted onEnded={onEnded} onError={onEnded} />
        ) : (
          <Silhouette signing={playing} />
        )}
        <span className={`vtag${playing ? " rec" : ""}`}><i />{playing ? "Playing sign video" : "Sign video"}</span>
        {DOCTOR_TONE_LABEL[reply.tone] && <span className={`tonetag ${reply.tone}`}>{DOCTOR_TONE_LABEL[reply.tone]}</span>}
        {!playing && (
          <button className="playv" onClick={watchAgain} aria-label="Play the sign video again"><Icon name="play" /></button>
        )}
        <div className="vcap" aria-live="off">
          <Words text={reply.plain} index={reply.index} current={playing} />
        </div>
      </div>

      {reply.done ? (
        <section className="card teal words" aria-label="What the doctor said" aria-live="polite">
          <div className="orig">
            <small><Icon name="mic" />The doctor's exact words</small>
            <p><Highlighted text={reply.text} terms={reply.terms} /></p>
          </div>
          {reply.terms.length > 0 && (
            <ul className="gloss" aria-label="Medical words explained">
              {reply.terms.map((t) => (
                <li key={t.term}><b>{t.term}</b><span>means {t.meaning}</span></li>
              ))}
            </ul>
          )}
          <div className="plain">
            <small>In plain words</small>
            <p>{reply.plain}</p>
          </div>
        </section>
      ) : (
        <p className="pending">The doctor's exact words appear after the video.</p>
      )}
    </>
  );
}
