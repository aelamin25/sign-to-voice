import { useEffect, useRef } from "react";
import { isMock } from "../app/config";
import { Icon } from "../components/Icon";
import { Silhouette } from "../components/Illustrations";
import { media } from "../state/media";
import { useStore } from "../state/store";

const REAL = !isMock("recognition");

/** The patient's camera: real webcam + MediaPipe overlay, or the animated signer in mock/demo.
    `tile` is the small square used in tabletop view (never owns the real camera). */
export function MobileCamera({ tile = false }: { tile?: boolean }) {
  const phase = useStore((s) => s.phase);
  const camera = useStore((s) => s.camera);
  const demo = useStore((s) => s.demo);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signing = phase === "signing";
  const uncertain = phase === "uncertain";
  const real = REAL && !demo && !tile;

  // Register the elements the recognition service draws into. The service stops every
  // camera track when the step ends (Done signing, auto-end, or leaving the screen).
  useEffect(() => {
    if (!real) return;
    media.video = videoRef.current;
    media.canvas = canvasRef.current;
    return () => {
      if (media.video === videoRef.current) { media.video = null; media.canvas = null; }
    };
  }, [real]);

  const tag = uncertain ? "Not sure" : signing ? (camera.state === "starting" ? "Starting camera" : "Reading your signs") : "Done";
  const denied = useCameraBlocked() && !tile;

  return (
    <div
      className={`m-cam${signing ? " sign" : ""}${uncertain ? " amb" : ""}`}
      role="img"
      aria-label={signing ? "Your camera, reading your signs" : "Your camera"}
    >
      {real ? (
        <>
          <video ref={videoRef} className="m-video" muted playsInline autoPlay style={{ opacity: signing && camera.state !== "starting" ? 1 : 0 }} />
          <canvas ref={canvasRef} className="m-lmk" style={{ opacity: signing ? 1 : 0 }} />
        </>
      ) : (
        <Silhouette signing={signing} />
      )}
      <div className="m-ring" />
      {!tile && <span className="m-vtag"><i />{tag}</span>}
      {denied && (
        <div className="m-perm" role="alert">
          <Icon name="camoff" />
          <h3>Allow camera to sign</h3>
          <p>{/denied|not ?allowed|permission/i.test(camera.message ?? "")
            ? "SignBridge needs your camera to read your signs. Allow it in your browser, then try again. Video stays on this phone."
            : `The camera could not start: ${camera.message ?? "unknown error"}.`}</p>
        </div>
      )}
    </div>
  );
}

/** True when the real camera could not start on the signing step (permission denied, no camera). */
export function useCameraBlocked(): boolean {
  const phase = useStore((s) => s.phase);
  const camera = useStore((s) => s.camera);
  const demo = useStore((s) => s.demo);
  return REAL && !demo && phase === "signing" && camera.state === "unavailable";
}
