import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Support | BTA Courtside Help Center",
  description:
    "Get BTA Courtside support for live game workflows, account access, onboarding, and escalation. Severity-based triage with direct engineering paths for critical incidents.",
  path: "/support",
});

export default function SupportPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Support"
      title="Support resources for coaches and operators"
      summary="Support at BTA Courtside is designed around operational continuity. We prioritize restoring decision quality quickly, especially when live game workflows are affected."
      primaryCta={{ label: "Open Support Email", href: "mailto:support@btaintel.com" }}
      secondaryCta={{ label: "Contact Team", href: "/contact" }}
      variant="support"
      sectionLayout="cards"
      keyMetrics={[
        { label: "Triage Model", value: "Severity Based", detail: "Live-event impact gets priority" },
        { label: "Knowledge Flow", value: "Playbook", detail: "Runbooks and issue classification" },
        { label: "Escalation", value: "Direct", detail: "Engineering path for critical incidents" },
      ]}
      sections={[
        {
          title: "Operational Help",
          intro: "Support for game setup, capture quality, and operator resilience.",
          points: [
            "Pregame connection checks, environment validation, and staff role readiness.",
            "Correction and replay workflows that preserve deterministic state behavior.",
            "Operator handoff guidance for substitutions, foul tracking, and period transitions.",
          ],
          note: "Use this track when the immediate goal is reliable execution during games.",
        },
        {
          title: "Account and Access",
          intro: "Support for identity, permissions, and organization-level administration.",
          points: [
            "Login, session expiry, password reset, and invitation acceptance troubleshooting.",
            "Role and access policy changes for coaches, operators, admins, and analysts.",
            "Domain and environment setup support for production deployment alignment.",
          ],
          note: "Include user role and organization information for faster resolution.",
        },
        {
          title: "Escalation Workflow",
          intro: "How we handle high-severity incidents and communication cadence.",
          points: [
            "Severity assessment based on live-event impact and number of affected users.",
            "Interim mitigation guidance while engineering investigates root cause.",
            "Post-incident summary with cause analysis and prevention recommendations.",
          ],
          note: "Critical incident updates are shared through the original support thread.",
        },
      ]}
    />
  );
}
