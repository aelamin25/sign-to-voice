import { useEffect, useState } from "react";

// Phones (≤ 767px) and portrait tablets (coarse pointer, ≤ 1024px) get the mobile view.
// Override for testing and demos: ?view=mobile or ?view=web
const PHONE = "(max-width: 767px)";
const TABLET = "(pointer: coarse) and (max-width: 1024px)";

function override(): boolean | null {
  try {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "mobile") return true;
    if (v === "web") return false;
  } catch { /* noop */ }
  return null;
}

function detect(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  const o = override();
  if (o !== null) return o;
  return window.matchMedia(PHONE).matches || window.matchMedia(TABLET).matches;
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(detect);
  useEffect(() => {
    if (!window.matchMedia) return;
    const qs = [window.matchMedia(PHONE), window.matchMedia(TABLET)];
    // Only switch views when the change persists. Momentary viewport changes (full-page
    // capture, devtools, rotation mid-animation) must not remount the whole app.
    let timer = 0;
    const on = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setMobile(detect()), 200);
    };
    qs.forEach((q) => q.addEventListener("change", on));
    return () => {
      clearTimeout(timer);
      qs.forEach((q) => q.removeEventListener("change", on));
    };
  }, []);
  return mobile;
}
