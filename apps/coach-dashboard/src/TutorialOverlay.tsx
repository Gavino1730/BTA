import { useState } from "react";

const STEPS = [
  {
    title: "Welcome to Bench IQ Coach",
    body: "Your real-time coaching dashboard. Follow the live game feed, manage lineups, and get AI-powered insights — all in one place.",
    icon: "📊",
  },
  {
    title: "Live Score & Feed",
    body: "The Live tab shows the real-time scoreboard, period, and play-by-play feed as the operator logs events. Everything updates instantly over Wi-Fi.",
    icon: "📡",
  },
  {
    title: "Lineups & Fouls",
    body: "See who's currently on the court, each player's foul count, and substitution history. The lineup panel highlights players with 3+ fouls automatically.",
    icon: "🔄",
  },
  {
    title: "AI Insights",
    body: "The AI tab delivers GPT-powered mid-game analysis: scoring trends, lineup effectiveness, and opponent tendencies based on the current game flow.",
    icon: "🤖",
  },
  {
    title: "Settings",
    body: "Configure your Stats Dashboard URL, Realtime API key, and AI preferences. You can also re-run this tutorial any time from the ? button.",
    icon: "⚙️",
  },
];

const LS_KEY = "coach:tutorial-complete";

interface Props {
  onDismiss: () => void;
}

export function TutorialOverlay({ onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  function handleDismiss() {
    localStorage.setItem(LS_KEY, "1");
    onDismiss();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}
    >
      <div
        style={{
          background: "#1a1a2e",
          border: "1.5px solid #4f8cff",
          borderRadius: "14px",
          padding: "28px 24px 20px",
          width: "100%",
          maxWidth: "440px",
          color: "#e2e8f0",
          fontFamily: "inherit",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
        }}
      >
        {/* Step dots */}
        <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "20px" }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? "20px" : "8px",
                height: "8px",
                borderRadius: "4px",
                background: i === step ? "#4f8cff" : i < step ? "#4f8cff66" : "#2d3748",
                transition: "width .2s, background .2s",
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div style={{ textAlign: "center", fontSize: "40px", marginBottom: "12px" }}>
          {s.icon}
        </div>

        {/* Title */}
        <div style={{ fontWeight: 700, fontSize: "18px", marginBottom: "10px", textAlign: "center" }}>
          {s.title}
        </div>

        {/* Body */}
        <div style={{ fontSize: "14px", lineHeight: 1.6, color: "#a0aec0", textAlign: "center", marginBottom: "24px" }}>
          {s.body}
        </div>

        {/* Step counter */}
        <div style={{ textAlign: "center", fontSize: "11px", color: "#4f8cff", marginBottom: "16px", letterSpacing: "0.5px" }}>
          {step + 1} / {STEPS.length}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
          <button
            onClick={handleDismiss}
            style={{
              background: "transparent",
              border: "1px solid #4a5568",
              color: "#a0aec0",
              padding: "8px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Skip
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{
                  background: "transparent",
                  border: "1.5px solid #4f8cff",
                  color: "#4f8cff",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={isLast ? handleDismiss : () => setStep(step + 1)}
              style={{
                background: "#4f8cff",
                border: "none",
                color: "#fff",
                padding: "8px 18px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {isLast ? "Get Started" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
