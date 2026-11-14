import { useEffect, useRef } from "react";
import { isMock } from "../app/config";
import { Icon } from "./Icon";
import { Silhouette } from "./Illustrations";
import { media } from "../state/media";
import { useStore } from "../state/store";
import { KEY_MAP } from "../services/recognition";

const REAL = !isMock("recognition");

/** Webcam with landmark overlay (real), or the animated signer (mock / demo). */
export function CameraPanel({ compact = false }: { compact?: boolean }) {
  const phase = useStore((s) => s.phase);
  const camera = useStore((s) => s.camera);
  const hands = useStore((s) => s.handsVisible);
  const demo = useStore((s) => s.demo);
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
    signing ? (camera.state === "starting" ? "Starting camera…" : "Reading your signs")
      : phase === "speaking" ? "Camera off while Maya speaks"
        : phase === "listening" || phase === "generating" ? "Camera off while the doctor speaks"
          : phase === "uncertain" ? "Paused" : "Live on this device, not recorded";

  return (
    <div
      className={`view${signing ? " sign" : ""}`}
      role="img"
      aria-label={signing ? "Your camera, reading your signs" : "Your camera is off"}
    >
      {useReal && !compact ? (
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
      {signing && <span className="hands" aria-hidden="true">{hands ? <><b>Hands</b> in view</> : "Lower hands to finish"}</span>}
      {signing && useReal && camera.state === "unavailable" && (
        <div className="camerr" role="status">
          <div>
            <Icon name="camoff" /><br />
            Hand tracking is off: {camera.message ?? "permission denied"}.<br />
            You can still test signs with the keys below.
          </div>
        </div>
      )}
      {signing && useReal && (
        <p className="keyhint" aria-hidden="true">
          Test keys: {Object.entries(KEY_MAP).map(([k, g]) => <span key={k}><kbd>{k}</kbd> {g === "?" ? "unclear" : g} </span>)} · <kbd>Shift</kbd>+digit = number
        </p>
      )}
    </div>
  );
}
