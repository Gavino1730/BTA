import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Acceptable Use Policy | BTA Courtside",
  description:
    "Review acceptable use requirements for BTA Courtside services, including prohibited activities and enforcement terms.",
  path: "/acceptable-use",
});

export default function AcceptableUsePage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Policy"
      title="Acceptable Use Policy"
      summary="This policy outlines prohibited behavior and required standards when using BTA Courtside websites and products."
      primaryCta={{ label: "Terms of Service", href: "/terms" }}
      secondaryCta={{ label: "Contact Legal", href: "mailto:legal@btaintel.com" }}
      sections={[
        {
          title: "Prohibited Actions",
          points: [
            "Attempting unauthorized access to systems, accounts, or data.",
            "Interfering with service availability, data integrity, or operational reliability.",
            "Using the platform for unlawful, abusive, or fraudulent activity.",
          ],
        },
        {
          title: "Enforcement",
          points: [
            "Violations may result in suspension, restriction, or account termination.",
            "Serious incidents may be escalated to legal or regulatory authorities.",
            "Questions can be directed to legal@btaintel.com.",
          ],
        },
      ]}
    />
  );
}
