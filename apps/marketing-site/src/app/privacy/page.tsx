import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy | BTA Courtside",
  description:
    "Read the BTA Courtside Privacy Policy covering data collection, processing, retention, and user rights.",
  path: "/privacy",
});

export default function PrivacyPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Privacy Policy"
      summary="This policy explains how BTA Courtside collects, uses, and protects information when you use our websites and services."
      primaryCta={{ label: "Contact Privacy Team", href: "mailto:privacy@btaintel.com" }}
      secondaryCta={{ label: "View Terms", href: "/terms" }}
      sections={[
        {
          title: "Information We Process",
          points: [
            "Account and organization details needed to provision platform access.",
            "Usage and operational telemetry required for reliability and support.",
            "Customer-provided game and roster data processed on behalf of organizations.",
          ],
        },
        {
          title: "Rights and Controls",
          points: [
            "You may request access, correction, or deletion for personal data where applicable.",
            "Organizations control access rights for team and staff members.",
            "Privacy requests can be submitted to privacy@btaintel.com.",
          ],
        },
      ]}
    />
  );
}
