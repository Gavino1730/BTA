import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { initSupabaseSessionRefresh } from "./supabase/client.js";
import "../../shared-ui/courtside-theme.css";
import "../../shared-ui/components.css";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[bta] Service worker registration failed:", err);
    });
  });
}

void initSupabaseSessionRefresh();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
