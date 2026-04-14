import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { initSupabaseSessionRefresh } from "./supabase/client.js";
import "@bta/ui-tokens/tokens.css";
import "../../shared-ui/components.css";
// App-specific styles — split from the former monolithic styles.css
import "./styles/base.css";     // layer declaration, reset, iPad globals
import "./styles/game.css";     // Game layout, left/center/right panels, modal, scoreboard
import "./styles/setup.css";    // Settings page, Pre-game screen, team/roster setup
import "./styles/endgame.css";  // End-game actions, Post-game screen, Possession chain

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
