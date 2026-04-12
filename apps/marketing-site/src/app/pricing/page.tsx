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
      summary="Pricing is designed around operational scope, not vanity feature gates. Every plan includes live event capture, coach dashboard access, and synchronized review workflows. You scale by teams, governance needs, and support depth."
      primaryCta={{ label: "Book Pricing Walkthrough", href: "/demo-signup" }}
      secondaryCta={{ label: "Contact Sales", href: "/contact" }}
      variant="ember"
      sectionLayout="cards"
      keyMetrics={[
        { label: "Contract Model", value: "Annual", detail: "Program billing with optional phased rollout" },
        { label: "Onboarding", value: "2-6 Weeks", detail: "Depends on team count and training cadence" },
        { label: "Support Levels", value: "3", detail: "Standard, priority, and enterprise partnership" },
      ]}
      sections={[
        {
          title: "Team Plan",
          intro: "Best for a single varsity or development team formalizing a reliable game-day process.",
          points: [
            "Single-team production workspace with event capture, lineup management, and coaching dashboard views.",
            "Integrated timeline and film linkage for postgame breakdown without exporting between tools.",
            "Structured onboarding path with training docs, implementation checklist, and support escalation path.",
          ],
          note: "Most single-team customers begin here and expand once staff standards are established.",
        },
        {
          title: "Program Plan",
          intro: "For multi-team organizations that need consistency, governance, and unified reporting.",
          points: [
            "Centralized templates for game workflows, staff roles, and review conventions across teams.",
            "Cross-team reporting controls and organization-level access policies for directors and coordinators.",
            "Priority implementation support with recurring operational reviews and workflow optimization sessions.",
          ],
          note: "Recommended for schools, academies, and clubs operating multiple squads simultaneously.",
        },
        {
          title: "Enterprise Program Partnership",
          intro: "For large organizations requiring custom rollout governance and deeper integration planning.",
          points: [
            "Multi-season implementation roadmap with phased team activation and change-management support.",
            "Priority reliability review, custom training schedules, and escalation channels for high-volume events.",
            "Commercial terms aligned to organization scale, staff structure, and reporting obligations.",
          ],
          note: "Enterprise packages are scoped collaboratively after operational discovery sessions.",
        },
      ]}
    />
  );
}
