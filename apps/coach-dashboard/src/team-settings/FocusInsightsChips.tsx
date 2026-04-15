import { FOCUS_INSIGHT_OPTIONS } from "./constants.js";
import { toggleFocusInsightValue } from "./helpers.js";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function FocusInsightsChips({ value, onChange }: Props) {
  const active = new Set(
    value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
  );

  return (
    <div className="focus-chips-wrap">
      {FOCUS_INSIGHT_OPTIONS.map(({ key, label }) => {
        const enabled = active.has(key);
        return (
          <button
            key={key}
            type="button"
            className={`focus-chip${enabled ? " focus-chip-on" : ""}`}
            onClick={() => onChange(toggleFocusInsightValue(value, key))}
          >
            {enabled ? <span className="focus-chip-check" aria-hidden="true">OK </span> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
