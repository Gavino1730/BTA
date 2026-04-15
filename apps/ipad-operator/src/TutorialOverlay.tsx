import { useState } from "react";

const STEPS = [
  {
    title: "Welcome",
    body: "This app is your live stat-entry hub during games. You log every play in real time, and the coach dashboard updates instantly.",
    icon: "Live",
  },
  {
    title: "Pair With Coach Dashboard",
    body: "Before tip-off, open Settings and paste the 6-digit coach connection code. Team, lineup, and matchup setup are coach-controlled and sync down to the iPad.",
    icon: "Pair",
  },
  {
    title: "Logging Stats",
    body: "Tap players to log shots, assists, rebounds, fouls, and other events in a few taps. Every event feeds the live coach timeline.",
    icon: "Log",
  },
  {
    title: "Substitutions",
    body: "Tap the sub button next to a player's name to swap them in or out. The lineup syncs to the coach dashboard instantly via Wi-Fi.",
    icon: "Subs",
  },
  {
    title: "Post-Game",
    body: "After the final buzzer, tap End Game to close the period and lock the score. Your stats stay available in the coach dashboard for post-game analysis.",
    icon: "Close",
  },
  {
    title: "Offline Mode",
    body: "No Wi-Fi? Events queue locally first, then sync automatically after reconnect. Keep entering stats and let the app catch up.",
    icon: "Offline",
  },
];

const LS_KEY = "ipo:tutorial-complete";

interface Props {
  onDismiss: () => void;
}

export default function TutorialOverlay({ onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const currentStep = STEPS[step];

  function handleDismiss() {
    localStorage.setItem(LS_KEY, "1");
    onDismiss();
  }

  return (
    <div
      className="tutorial-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleDismiss();
        }
      }}
    >
      <div className="tutorial-card">
        <div className="tutorial-dots" aria-hidden="true">
          {STEPS.map((_, index) => (
            <div
              key={index}
              className={`tutorial-dot${index === step ? " is-active" : ""}${index < step ? " is-complete" : ""}`}
            />
          ))}
        </div>

        <div className="tutorial-icon">{currentStep.icon}</div>
        <div className="tutorial-title">{currentStep.title}</div>
        <div className="tutorial-body">{currentStep.body}</div>
        <div className="tutorial-counter">
          {step + 1} / {STEPS.length}
        </div>

        <div className="tutorial-actions">
          <button type="button" className="tutorial-skip-button" onClick={handleDismiss}>
            Skip
          </button>
          <div className="tutorial-primary-actions">
            {step > 0 ? (
              <button type="button" className="tutorial-back-button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="tutorial-next-button"
              onClick={isLast ? handleDismiss : () => setStep(step + 1)}
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
