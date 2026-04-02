import React from 'react';

const TIPS = [
  {
    icon: '📱',
    title: 'Add to Home Screen',
    steps: [
      'Open this app in Safari on your iPad.',
      'Tap the Share button (box with arrow) in the toolbar.',
      'Scroll down and tap "Add to Home Screen".',
      'Choose any label you want and tap Add.',
    ],
    note: 'Launching from the home screen icon hides the browser chrome for a full-screen experience.',
  },
  {
    icon: '🔒',
    title: 'Prevent Auto-Lock',
    steps: [
      'Open the iPad Settings app.',
      'Tap Display & Brightness → Auto-Lock.',
      'Set to Never (or the longest option available).',
    ],
    note: 'This keeps the screen on during a game so you don\'t miss a play.',
  },
  {
    icon: '↩️',
    title: 'Disable Shake to Undo',
    steps: [
      'Open the iPad Settings app.',
      'Tap Accessibility → Touch.',
      'Turn off "Shake to Undo".',
    ],
    note: 'Prevents accidental stat deletions if the iPad gets nudged during play.',
  },
  {
    icon: '🔕',
    title: 'Enable Do Not Disturb',
    steps: [
      'Swipe down from the top-right corner to open Control Center.',
      'Tap the moon/crescent icon to enable Focus → Do Not Disturb.',
    ],
    note: 'Blocks notifications and calls that could cover the app or cause misclicks.',
  },
  {
    icon: '🔄',
    title: 'Lock Screen Rotation',
    steps: [
      'Swipe down from the top-right corner to open Control Center.',
      'Tap the rotation lock icon (padlock with circular arrow) to lock to landscape.',
    ],
    note: 'Keeps the layout stable when you hand the iPad between operators.',
  },
  {
    icon: '📶',
    title: 'Wi-Fi + Bluetooth On',
    steps: [
      'Open the iPad Settings app.',
      'Tap Wi-Fi and connect to the same network as the stats computer.',
      'Tap Bluetooth and make sure it is on.',
    ],
    note: 'Both Wi-Fi and Bluetooth must be active for the fastest, most reliable sync.',
  },
  {
    icon: '🔋',
    title: 'Battery & Charging',
    steps: [
      'Keep the iPad plugged in if possible during long events.',
      'Enable Low Power Mode under Settings → Battery if unplugged.',
    ],
    note: 'A full battery means you won\'t lose connection at a critical moment.',
  },
  {
    icon: '💡',
    title: 'Brightness',
    steps: [
      'Swipe down from the top-right to open Control Center.',
      'Drag the brightness slider all the way up.',
    ],
    note: 'Gyms can be bright; max brightness ensures the display is readable from any angle.',
  },
];

interface Props {
  onBack: () => void;
}

export default function IpadTipsPage({ onBack }: Props) {
  return (
    <div style={{ padding: '16px', maxWidth: '680px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1.5px solid #374151',
            color: '#9ca3af',
            borderRadius: '8px',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ← Back
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: '18px', color: '#e2e8f0' }}>iPad Setup Tips</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Recommended settings for game-day use</div>
        </div>
      </div>

      {/* Tips grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {TIPS.map((tip) => (
          <div
            key={tip.title}
            style={{
              background: '#1a1a2e',
              border: '1px solid #2d3748',
              borderRadius: '10px',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '22px' }}>{tip.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#e2e8f0' }}>{tip.title}</span>
            </div>
            <ol style={{ margin: '0 0 8px 16px', padding: 0, fontSize: '13px', color: '#a0aec0', lineHeight: 1.6 }}>
              {tip.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {tip.note && (
              <div
                style={{
                  fontSize: '12px',
                  color: '#4f8cff',
                  background: 'rgba(79,140,255,0.08)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                }}
              >
                💡 {tip.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
