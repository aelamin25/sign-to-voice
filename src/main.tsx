import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as WebApp } from "./app/App";
import { Stage } from "./app/Stage";
import { useIsMobile } from "./app/useIsMobile";
import { MobileApp } from "./mobile/MobileApp";
import { startAutoSign } from "./services/autoSign";
import "./styles/app.css";
import "./mobile/mobile.css";

// One URL for both: phones get the one-step mobile view, laptops the two-column web view.
function Root() {
  return useIsMobile() ? <MobileApp /> : <WebApp />;
}

// ...?view=phone: the phone view as a phone in the middle of a web page, for presenting (see Stage).
// The visit then runs inside that phone only, so this outer page must not listen for signs itself.
const stage = (() => {
  try { return new URLSearchParams(window.location.search).get("view") === "phone"; } catch { return false; }
})();

if (!stage) startAutoSign();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {stage ? <Stage /> : <Root />}
  </StrictMode>,
);
