import { useEffect, useRef, useState } from "react";
import { CAMERA_STREAM, isMock, PYTHON_RECOGNITION } from "../app/config";
import { Icon } from "../components/Icon";
import { Silhouette } from "../components/Illustrations";
import { LiveStream, STREAM_DOWN_MESSAGE } from "../components/LiveStream";
import { media } from "../state/media";
import { useStore } from "../state/store";

const REAL = !isMock("recognition");

/** The patient's camera on the phone:
    - browser mode: webcam + MediaPipe overlay (this phone's camera)
    - Python mode (VITE_RECOGNITION=python): live.py owns the camera; we show its stream
    - mock / demo: the animated signer.
    `tile` is the small square used in tabletop view (never owns a camera or stream). */
export function MobileCamera({ tile = false }: { tile?: boolean }) {
  const phase = useStore((s) => s.phase);
  const camera = useStore((s) => s.camera);
  const demo = useStore((s) => s.demo);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamDown, setStreamDown] = useState(false);
  const signing = phase === "signing";
  const uncertain = phase === "uncertain";
  const python = PYTHON_RECOGNITION && !demo && !tile;
  const browserCam = REAL && !PYTHON_RECOGNITION && !demo && !tile;

  // Register the elements the browser recogniser draws into. It stops every camera track
  // when the step ends (Done signing, auto-end, or leaving the screen).
  useEffect(() => {
    if (!browserCam) return;
    media.video = videoRef.current;
    media.canvas = canvasRef.current;
    return () => {
      if (media.video === videoRef.current) { media.video = null; media.canvas = null; }
    };
  }, [browserCam]);

  const tag = uncertain ? "Not sure"
    : !signing ? "Done"
      : camera.state === "starting" ? (python ? "Connecting to the recogniser" : "Starting camera")
        : python ? "Sign recognition app" : "Reading your signs";
  const blocked = useCameraBlocked() && !tile;
  // Python mode, connected: non-blocking note if live.py sends nothing or its view is missing.
  const note = python && signing && camera.state === "live"
    ? (camera.message?.startsWith("No signs") ? camera.message : CAMERA_STREAM && streamDown ? STREAM_DOWN_MESSAGE : null)
    : null;

  return (
    <div
      className={`m-cam${signing ? " sign" : ""}${uncertain ? " amb" : ""}`}
      role="img"
      aria-label={signing ? "Your camera, reading your signs" : "Your camera"}
    >
      {browserCam ? (
        <>
          <video ref={videoRef} className="m-video" muted playsInline autoPlay style={{ opacity: signing && camera.state !== "starting" ? 1 : 0 }} />
          <canvas ref={canvasRef} className="m-lmk" style={{ opacity: signing ? 1 : 0 }} />
        </>
      ) : python && CAMERA_STREAM ? (
        <LiveStream className="m-video" visible={signing} onDown={setStreamDown} />
      ) : (
        <Silhouette signing={signing} />
      )}
      <div className="m-ring" />
      {!tile && <span className="m-vtag"><i />{tag}</span>}
      {note && !blocked && <p className="m-note-cam" role="status">{note}</p>}
      {blocked && (
        <div className="m-perm" role="alert">
          <Icon name="camoff" />
          {PYTHON_RECOGNITION ? (
            <>
              <h3>Sign recogniser not connected</h3>
              <p>{camera.message ?? "Start model/backend and live.py on the laptop."}</p>
            </>
          ) : (
            <>
              <h3>Allow camera to sign</h3>
              <p>{/denied|not ?allowed|permission/i.test(camera.message ?? "")
                ? "SignBridge needs your camera to read your signs. Allow it in your browser, then try again. Video stays on this phone."
                : `The camera could not start: ${camera.message ?? "unknown error"}.`}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** True when signing can't start: the phone camera is blocked (browser mode), or the
    Python recogniser can't be reached (Python mode). */
export function useCameraBlocked(): boolean {
  const phase = useStore((s) => s.phase);
  const camera = useStore((s) => s.camera);
  const demo = useStore((s) => s.demo);
  return (REAL || PYTHON_RECOGNITION) && !demo && phase === "signing" && camera.state === "unavailable";
}
