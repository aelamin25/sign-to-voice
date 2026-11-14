import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as WebApp } from "./app/App";
import { useIsMobile } from "./app/useIsMobile";
import { MobileApp } from "./mobile/MobileApp";
import { startAutoSign } from "./services/autoSign";
import "./styles/app.css";
import "./mobile/mobile.css";

// One URL for both: phones get the one-step mobile view, laptops the two-column web view.
function Root() {
  return useIsMobile() ? <MobileApp /> : <WebApp />;
}

startAutoSign();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
