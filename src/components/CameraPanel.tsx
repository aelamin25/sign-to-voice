import { useEffect, useRef, useState } from "react";
import { CAMERA_STREAM, isMock, PY_BACKEND, RECOGNITION_SOURCE } from "../app/config";
import { Icon } from "./Icon";
import { LiveStream, STREAM_DOWN_MESSAGE } from "./LiveStream";
import { Silhouette } from "./Illustrations";
import { media } from "../state/media";
import { useStore } from "../state/store";
import { KEY_MAP } from "../services/recognition";

const REAL = !isMock("recognition");
/** Signs come from model/vision/live.py, which owns the camera and streams its view to us. */
const BRIDGE = !!PY_BACKEND && RECOGNITION_SOURCE === "python";

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
  const useReal = REAL && !demo && !BRIDGE;
  const bridge = BRIDGE && !demo;
  const useStream = bridge && !!CAMERA_STREAM && !compact;
  const [streamDown, setStreamDown] = useState(false);
  // Python mode: a non-blocking note when live.py sends nothing, or its camera view is missing.
  const bridgeNote = !bridge || compact || !signing || camera.state !== "live" ? null
    : camera.message?.startsWith("No signs") ? camera.message
      : useStream && streamDown ? STREAM_DOWN_MESSAGE : null;

  useEffect(() => {
    if (!useReal || compact) return;
    media.video = videoRef.current;
    media.canvas = canvasRef.current;
    return () => {
      if (media.video === videoRef.current) { media.video = null; media.canvas = null; }
    };
  }, [useReal, compact]);

  const label =
    signing ? (camera.state === "starting" && !bridge ? "Starting camera…" : "Reading your signs")
      : bridge ? (talking ? "Your words are being spoken"
        : phase === "listening" || phase === "generating" ? "The doctor is speaking" : "Sign recogniser ready")
      : phase === "speaking" ? "Camera off while Maya speaks"
        : phase === "listening" || phase === "generating" ? "Camera off while the doctor speaks"
          : phase === "uncertain" ? "Paused" : "Live on this device, not recorded";
  // What the patient should do now, when live.py has the camera (it watches all the time).
  const bridgeHint = signing ? "Reading your signs…"
    : phase === "start" ? "The doctor speaks first. Then sign your reply."
      : phase === "uncertain" ? "Sign to the camera. Finish with a thumbs up."
      : talking ? "Your words are being spoken to the doctor."
        : "Wait for the doctor, then sign your reply.";
  const showStream = useStream && !streamDown;

  return (
    <div
      className={`view${signing ? " sign" : ""}`}
      role="img"
      aria-label={bridge ? "Your camera, with hand tracking" : signing ? "Your camera, reading your signs" : "Your camera is off"}
    >
      {bridge ? (
        <>
          {/* kept mounted so the stream doesn't reconnect between turns; shown the whole time,
              because live.py watches the whole time (a turn can start without a button press) */}
          {useStream && <LiveStream className="cam" visible onDown={setStreamDown} />}
          {!showStream && <div className="off"><div><Icon name="hand" />{bridgeHint}</div></div>}
        </>
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
      {signing && !bridge && <span className="hands" aria-hidden="true">{hands ? <><b>Hands</b> in view</> : "Lower hands to finish"}</span>}
      {bridge && showStream && <span className="hands" aria-hidden="true">{bridgeHint}</span>}
      {bridgeNote && <p className="bridgenote" role="status">{bridgeNote}</p>}
      {signing && bridge && camera.state === "unavailable" && (
        <div className="camerr" role="status">
          <div><Icon name="camoff" /><br />{camera.message ?? "Sign recogniser not connected."}</div>
        </div>
      )}
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
