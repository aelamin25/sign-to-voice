import { useEffect, useRef, useState } from "react";
import { CAMERA_STREAM } from "../app/config";

/** Message shown when live.py's camera view can't be loaded (signing still works without it). */
export const STREAM_DOWN_MESSAGE = `Camera view not available at ${CAMERA_STREAM || "(VITE_CAMERA_STREAM not set)"}. Start live.py with --stream 8001. Signs still work.`;

const RETRY_MS = 4000;
/** MJPEG streams don't reliably fire "load", so a retry with no error for this long counts as recovered. */
const RECOVERED_MS = 2500;

/** The camera view served by model/vision/live.py (MJPEG in an <img>). Kept mounted so it
    doesn't reconnect between turns; if it fails, it retries every few seconds and reports it. */
export function LiveStream({ className, visible, onDown }: { className: string; visible: boolean; onDown?: (down: boolean) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [down, setDown] = useState(false);
  const timer = useRef(0);

  useEffect(() => { onDown?.(down); }, [down, onDown]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onError = () => {
    clearTimeout(timer.current);
    setDown(true);
    timer.current = window.setTimeout(() => {
      setAttempt((a) => a + 1);
      timer.current = window.setTimeout(() => setDown(false), RECOVERED_MS);
    }, RETRY_MS);
  };
  const onLoad = () => { clearTimeout(timer.current); setDown(false); };

  if (!CAMERA_STREAM) return null;
  const src = attempt ? `${CAMERA_STREAM}${CAMERA_STREAM.includes("?") ? "&" : "?"}r=${attempt}` : CAMERA_STREAM;
  return (
    <img
      className={className}
      src={src}
      alt=""
      onLoad={onLoad}
      onError={onError}
      style={{ opacity: visible && !down ? 1 : 0, transform: "none" }}
    />
  );
}
