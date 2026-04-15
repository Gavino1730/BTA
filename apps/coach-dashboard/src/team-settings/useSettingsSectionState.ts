import { useEffect, useState } from "react";
import { getStoredSettingsSection, persistSettingsSection, readRequestedSettingsSection, resolveInitialSettingsSection } from "./helpers.js";
import type { SettingsSection } from "./types.js";

export function useSettingsSectionState() {
  const [activeSection, setActiveSectionState] = useState<SettingsSection>(() => {
    if (typeof window === "undefined") {
      return "pairing";
    }

    return resolveInitialSettingsSection(window.location.search, getStoredSettingsSection(), "pairing");
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function syncFromLocation() {
      const requestedSection = readRequestedSettingsSection(window.location.search, activeSection);
      if (!requestedSection || requestedSection === activeSection) {
        return;
      }

      setActiveSectionState(requestedSection);
      persistSettingsSection(requestedSection);
    }

    window.addEventListener("popstate", syncFromLocation);
    syncFromLocation();

    return () => {
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [activeSection]);

  function setActiveSection(nextSection: SettingsSection) {
    setActiveSectionState(nextSection);
    persistSettingsSection(nextSection);
  }

  return {
    activeSection,
    setActiveSection,
  };
}
