import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Security | BTA Courtside",
  description:
    "Learn how BTA Courtside approaches platform security, access controls, and incident response.",
  path: "/security",
});

export default function SecurityPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Security"
      title="Security principles for game-day reliability"
      summary="BTA Courtside applies layered safeguards across authentication, transport, storage, and operational monitoring."
      primaryCta={{ label: "Report Security Issue", href: "mailto:security@btaintel.com" }}
      secondaryCta={{ label: "Support", href: "/support" }}
      sections={[
        {
          title: "Platform Controls",
          points: [
            "Role-based access patterns for staff and organization workflows.",
            "Encrypted transport and managed runtime protections for hosted services.",
            "Audit-oriented telemetry for operational and security diagnostics.",
          ],
        },
        {
          title: "Responsible Disclosure",
          points: [
            "Send vulnerability reports to security@btaintel.com.",
            "Include reproduction steps, affected route, and impact assessment.",
            "We coordinate remediation and provide follow-up communication.",
          ],
        },
      ]}
    />
  );
}
