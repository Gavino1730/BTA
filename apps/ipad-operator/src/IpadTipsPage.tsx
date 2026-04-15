const TIPS = [
  {
    icon: "Home",
    title: "Add to Home Screen",
    steps: [
      "Open this app in Safari on your iPad.",
      "Tap the Share button (box with arrow) in the toolbar.",
      'Scroll down and tap "Add to Home Screen".',
      "Choose any label you want and tap Add.",
    ],
    note: "Launching from the home screen icon hides the browser chrome for a full-screen experience.",
  },
  {
    icon: "Focus",
    title: "Prevent Auto-Lock",
    steps: [
      "Open the iPad Settings app.",
      "Tap Display & Brightness > Auto-Lock.",
      "Set to Never (or the longest option available).",
    ],
    note: "This keeps the screen on during a game so you do not miss a play.",
  },
  {
    icon: "Safety",
    title: "Disable Shake to Undo",
    steps: [
      "Open the iPad Settings app.",
      "Tap Accessibility > Touch.",
      'Turn off "Shake to Undo".',
    ],
    note: "Prevents accidental stat deletions if the iPad gets nudged during play.",
  },
  {
    icon: "Alerts",
    title: "Enable Do Not Disturb",
    steps: [
      "Swipe down from the top-right corner to open Control Center.",
      "Tap the moon icon to enable Focus > Do Not Disturb.",
    ],
    note: "Blocks notifications and calls that could cover the app or cause misclicks.",
  },
  {
    icon: "Rotate",
    title: "Lock Screen Rotation",
    steps: [
      "Swipe down from the top-right corner to open Control Center.",
      "Tap the rotation lock icon to keep the iPad in landscape.",
    ],
    note: "Keeps the layout stable when you hand the iPad between operators.",
  },
  {
    icon: "Sync",
    title: "Wi-Fi + Bluetooth On",
    steps: [
      "Open the iPad Settings app.",
      "Tap Wi-Fi and connect to the same network as the stats computer.",
      "Tap Bluetooth and make sure it is on.",
    ],
    note: "Both Wi-Fi and Bluetooth must be active for the fastest, most reliable sync.",
  },
  {
    icon: "Power",
    title: "Battery and Charging",
    steps: [
      "Keep the iPad plugged in if possible during long events.",
      "Enable Low Power Mode under Settings > Battery if unplugged.",
    ],
    note: "A full battery means you will not lose connection at a critical moment.",
  },
  {
    icon: "Bright",
    title: "Brightness",
    steps: [
      "Swipe down from the top-right to open Control Center.",
      "Drag the brightness slider all the way up.",
    ],
    note: "Gyms can be bright, so max brightness keeps the display readable from any angle.",
  },
];

interface Props {
  onBack: () => void;
}

export default function IpadTipsPage({ onBack }: Props) {
  return (
    <div className="tips-page">
      <div className="tips-page-header">
        <button type="button" className="tips-back-button" onClick={onBack}>
          Back
        </button>
        <div className="tips-page-header-copy">
          <div className="tips-page-title">iPad Setup Tips</div>
          <div className="tips-page-subtitle">Recommended settings for game-day use</div>
        </div>
      </div>

      <div className="tips-list">
        {TIPS.map((tip) => (
          <article key={tip.title} className="tips-card">
            <div className="tips-card-header">
              <span className="tips-card-icon">{tip.icon}</span>
              <span className="tips-card-title">{tip.title}</span>
            </div>
            <ol className="tips-card-steps">
              {tip.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="tips-card-note">{tip.note}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
