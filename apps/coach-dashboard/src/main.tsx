import React from "react";
import ReactDOM from "react-dom/client";
import { UnifiedCoachApp } from "./UnifiedCoachApp.js";
import { initSupabaseSessionRefresh } from "./supabase/client.js";
import "@bta/ui-tokens/tokens.css";
import "../../shared-ui/components.css";
// App-specific styles — split from the former monolithic styles.css
import "./styles/base.css";       // tokens, reset, globals, header, shared components
import "./styles/stats.css";      // StatsOverview, Games, Trends, Players pages
import "./styles/live.css";       // Scoreboard, AI Insights, Forms, Roster Builder
import "./styles/shell.css";      // Coach Navbar, Loading Spinner, Sub-nav, Idle screen
import "./styles/marketing.css";  // mkt-* pages: Auth, Settings, Landing, Features

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      void registration.update();
    }).catch((err) => {
      console.warn("[bta] Service worker registration failed:", err);
    });
  });
}

void initSupabaseSessionRefresh();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UnifiedCoachApp />
  </React.StrictMode>
);
