import { useEffect, useState } from "react";
import { Brand } from "../components/Icon";

const W = 390, H = 844, BEZEL = 12;

/** The phone view, shown as a phone in the middle of a web page (address ending in ?view=phone).
 *
 *  For presenting on a laptop or a big screen: it looks and works like the phone app, but runs on the
 *  laptop, so the laptop's camera reads the signs and the laptop's microphone hears the doctor.
 *  The phone is a frame around the real phone view (the same page with ?view=mobile), so everything in
 *  it behaves exactly as on a phone. This outer page does nothing else: no second copy of the visit. */
export function Stage() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.max(0.45, Math.min(1.6,
      (window.innerHeight - 48) / (H + 2 * BEZEL),
      (window.innerWidth - 32) / (W + 2 * BEZEL))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const params = new URLSearchParams(window.location.search);
  params.set("view", "mobile");
  return (
    <div className="stage">
      <div className="stage-side left">
        <div className="stage-brand"><Brand />SignBridge</div>
        <p className="stage-line">A Deaf patient signs.<br />The doctor hears a voice.</p>
        <p className="stage-sub">The doctor's reply comes back in plain words. For when an interpreter isn't available.</p>
      </div>
      <div className="stage-phone" style={{ width: (W + 2 * BEZEL) * scale, height: (H + 2 * BEZEL) * scale }}>
        <div className="stage-bezel" style={{ transform: `scale(${scale})` }}>
          <iframe
            title="SignBridge on a phone"
            src={`${window.location.pathname}?${params.toString()}`}
            width={W}
            height={H}
            allow="camera; microphone; autoplay; fullscreen"
          />
        </div>
      </div>
      <ol className="stage-side right stage-steps">
        <li><b>1</b><span>The doctor speaks</span></li>
        <li><b>2</b><span>The patient reads it in plain words</span></li>
        <li><b>3</b><span>The patient signs to the camera</span></li>
        <li><b>4</b><span>The avatar speaks it to the doctor</span></li>
      </ol>
    </div>
  );
}
