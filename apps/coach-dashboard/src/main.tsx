import React from "react";
import ReactDOM from "react-dom/client";
import { UnifiedCoachApp } from "./UnifiedCoachApp.js";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[bta] Service worker registration failed:", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UnifiedCoachApp />
  </React.StrictMode>
);
