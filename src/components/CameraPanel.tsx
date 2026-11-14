import { useEffect, useRef } from "react";
import { isMock, PY_BACKEND, RECOGNITION_SOURCE } from "../app/config";
import { Icon } from "./Icon";
import { Silhouette } from "./Illustrations";
import { media } from "../state/media";
import { useStore } from "../state/store";
import { KEY_MAP } from "../services/recognition";

const REAL = !isMock("recognition");
/** Signs come from model/vision/live.py, which has its own camera window: this panel shows no picture. */
const EXTERNAL = !!PY_BACKEND && RECOGNITION_SOURCE === "python";

/** Webcam with landmark overlay (real), or the animated signer (mock / demo). */
export function CameraPanel({ compact = false }: { compact?: boolean }) {
  const phase = useStore((s) => s.phase);
  const camera = useStore((s) => s.camera);
  const hands = useStore((s) => s.handsVisible);
  const demo = useStore((s) => s.demo);
  const talking = useStore((s) => s.phase === "speaking" && s.speech.status !== "done");
  const signing = phase === "signing";
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const useReal = REAL && !demo;

  useEffect(() => {
    if (!useReal || compact) return;
    media.video = videoRef.current;
    media.canvas = canvasRef.current;
    return () => {
      if (media.video === videoRef.current) { media.video = null; media.canvas = null; }
    };
  }, [useReal, compact]);

  const label =
    signing ? (camera.state === "starting" && !EXTERNAL ? "Starting camera…" : "Reading your signs")
      : EXTERNAL && !demo ? (talking ? "Your words are being spoken"
        : phase === "listening" || phase === "generating" ? "The doctor is speaking" : "Sign recogniser ready")
      : phase === "speaking" ? "Camera off while Maya speaks"
        : phase === "listening" || phase === "generating" ? "Camera off while the doctor speaks"
          : phase === "uncertain" ? "Paused" : "Live on this device, not recorded";
  const externalHint = phase === "start" || phase === "uncertain"
    ? "Sign to the camera. Finish with a thumbs up."
    : talking ? "Your words are being spoken to the doctor."
      : "Wait for the doctor, then sign your reply.";

  return (
    <div
      className={`view${signing ? " sign" : ""}`}
      role="img"
      aria-label={signing ? "Your camera, reading your signs" : "Your camera is off"}
    >
      {useReal && EXTERNAL ? (
        <div className="off"><div><Icon name="hand" />{signing ? "Reading your signs…" : externalHint}</div></div>
      ) : useReal && !compact ? (
        <>
          <video ref={videoRef} className="cam" muted playsInline style={{ opacity: signing && camera.state !== "starting" ? 1 : 0 }} />
          <canvas ref={canvasRef} className="lmk" style={{ opacity: signing ? 1 : 0 }} />
          {!signing && <div className="off"><div><Icon name="camoff" />{phase === "start" ? "The camera starts when you sign." : "Camera is off."}</div></div>}
        </>
      ) : signing || phase === "start" ? (
        <Silhouette signing={signing} />
      ) : (
        <div className="off"><div><Icon name="camoff" />{phase === "uncertain" ? "Paused. Ready when you are." : "Camera is off."}</div></div>
      )}
      {signing && <div className="ring-live" />}
      <span className={`vtag${signing ? " rec" : ""}`}><i />{label}</span>
      {signing && !(useReal && EXTERNAL) && <span className="hands" aria-hidden="true">{hands ? <><b>Hands</b> in view</> : "Lower hands to finish"}</span>}
      {signing && useReal && camera.state === "unavailable" && (
        <div className="camerr" role="status">
          <div>
            <Icon name="camoff" /><br />
            {EXTERNAL ? (camera.message ?? "The sign recogniser is not connected.") : <>Hand tracking is off: {camera.message ?? "permission denied"}.<br />
            You can still test signs with the keys below.</>}
          </div>
        </div>
      )}
      {signing && useReal && !EXTERNAL && (
        <p className="keyhint" aria-hidden="true">
          Test keys: {Object.entries(KEY_MAP).map(([k, g]) => <span key={k}><kbd>{k}</kbd> {g === "?" ? "unclear" : g} </span>)} · <kbd>Shift</kbd>+digit = number
        </p>
      )}
    </div>
  );
}
