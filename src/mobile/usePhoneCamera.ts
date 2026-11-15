import { useEffect } from "react";
import { CAMERA_POST } from "../app/config";

/** The phone's own camera reads the signs.
 *
 *  The trained sign reader (model/vision/live.py) runs on the laptop. Instead of the laptop's camera,
 *  the phone films the signer and sends its pictures to the laptop about 14 times a second; live.py
 *  reads the signs from them and sends back the picture with the dots, which the sign screen shows.
 *  When the phone stops sending (page closed), live.py goes back to the laptop's camera by itself.
 *  Add ?camera=laptop to the page address to keep using the laptop's camera. */
export function usePhoneCamera(enabled: boolean) {
  useEffect(() => {
    let wanted = enabled && !!CAMERA_POST && !!navigator.mediaDevices?.getUserMedia;
    try { if (new URLSearchParams(window.location.search).get("camera") === "laptop") wanted = false; } catch { /* noop */ }
    if (!wanted) return;

    let stopped = false, busy = false, opening = false, openedAt = 0;
    let stream: MediaStream | null = null;
    // iPhones only decode a video that is in the page, so it is there, but too small to see.
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    Object.assign(video.style, { position: "fixed", left: "0", top: "0", width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none" });
    document.body.appendChild(video);
    const canvas = document.createElement("canvas");

    const open = async () => {
      if (stopped || opening || Date.now() - openedAt < 2000) return;
      opening = true;
      openedAt = Date.now();
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        });
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream?.getTracks().forEach((t) => t.stop());
        stream = s;
        video.srcObject = s;
        await video.play().catch(() => undefined);
      } catch (e) {
        console.warn("[phone camera] not available:", e);
      } finally {
        opening = false;
      }
    };

    const tick = () => {
      if (stopped) return;
      const track = stream?.getVideoTracks()[0];
      // not open yet, or the phone took the camera away (another app, the microphone starting): open it again
      if (!track || track.readyState !== "live") { void open(); return; }
      if (busy || !video.videoWidth) return;
      if (video.paused) void video.play().catch(() => undefined);
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      busy = true;
      canvas.toBlob((blob) => {
        if (!blob || stopped) { busy = false; return; }
        fetch(CAMERA_POST, { method: "POST", body: blob, headers: { "content-type": "image/jpeg" } })
          .catch(() => undefined)
          .finally(() => { busy = false; });
      }, "image/jpeg", 0.6);
    };

    const timer = window.setInterval(tick, 70);
    // a tap is the surest moment to ask a phone for its camera
    const onTap = () => { if (!stream) { openedAt = 0; void open(); } };
    window.addEventListener("pointerdown", onTap);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pointerdown", onTap);
      stream?.getTracks().forEach((t) => t.stop());
      video.remove();
    };
  }, [enabled]);
}
