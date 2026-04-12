import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Support | BTA Courtside",
  description:
    "Get BTA Courtside support resources for account access, onboarding, operator workflows, and troubleshooting.",
  path: "/support",
});

export default function SupportPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Support"
      title="Support resources for coaches and operators"
      summary="Find implementation help, troubleshooting guidance, and escalation channels for live game workflows."
      primaryCta={{ label: "Open Support Email", href: "mailto:support@btaintel.com" }}
      secondaryCta={{ label: "Contact Team", href: "/contact" }}
      sections={[
        {
          title: "Operational Help",
          points: [
            "Game connection setup and device readiness checks.",
            "Correction and replay best practices for clean downstream analytics.",
            "Role-based permissions and staff handoff procedures.",
          ],
        },
        {
          title: "Account and Access",
          points: [
            "Login, password reset, and session-expiry guidance.",
            "Organization-level account management and invitation flows.",
            "Environment and domain setup support for production rollouts.",
          ],
        },
      ]}
    />
  );
}
