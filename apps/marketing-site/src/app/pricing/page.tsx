import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing | BTA Courtside",
  description:
    "Explore BTA Courtside pricing tiers for teams, programs, and multi-team organizations. Includes onboarding, support, and platform access options.",
  path: "/pricing",
});

export default function PricingPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Pricing"
      title="Plans built for one team or an entire program"
      summary="Choose a plan based on number of teams, review depth, and support requirements. Every tier includes live operations, dashboard access, and secure cloud sync."
      primaryCta={{ label: "Book Pricing Walkthrough", href: "/demo-signup" }}
      secondaryCta={{ label: "Contact Sales", href: "/contact" }}
      sections={[
        {
          title: "Team Plan",
          points: [
            "Single team license with live game operations and coach dashboard access.",
            "Core film-sync workflow and postgame timeline review.",
            "Email support with guided onboarding resources.",
          ],
        },
        {
          title: "Program Plan",
          points: [
            "Multi-team management with shared templates and operational standards.",
            "Cross-team reporting and role-based staff access controls.",
            "Priority onboarding and dedicated implementation check-ins.",
          ],
        },
      ]}
    />
  );
}
