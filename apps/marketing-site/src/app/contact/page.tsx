import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact | Talk with the BTA Courtside Team",
  description:
    "Contact BTA Courtside for sales inquiries, program rollout planning, implementation questions, or game-day support. We route every request to the right specialist.",
  path: "/contact",
});

export default function ContactPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Contact"
      title="Talk with the BTA Courtside team"
      summary="Whether you are evaluating rollout options, planning a multi-team launch, or troubleshooting game-day workflow reliability, we route your inquiry to the right specialist quickly."
      primaryCta={{ label: "Email Support", href: "mailto:support@btaintel.com" }}
      secondaryCta={{ label: "Request Demo", href: "/demo-signup" }}
      variant="pulse"
      sectionLayout="split"
      keyMetrics={[
        { label: "Response Goal", value: "1 Business Day", detail: "For standard inbound requests" },
        { label: "Channels", value: "4", detail: "Sales, support, legal, and security" },
        { label: "Coverage", value: "Game Day", detail: "Escalation guidance for live event issues" },
      ]}
      sections={[
        {
          title: "Sales and Rollout",
          intro: "For program evaluations, procurement, and rollout planning.",
          points: [
            "Email: support@btaintel.com",
            "Share program size, number of teams, and timing goals so we can scope the right package.",
            "Include current tool stack and key pain points to accelerate discovery.",
          ],
          note: "Best path for product evaluations and commercial discussions.",
        },
        {
          title: "General Support",
          intro: "For account access, troubleshooting, and workflow questions.",
          points: [
            "Email: support@btaintel.com",
            "Include organization name, affected page/flow, and screenshots where possible.",
            "For urgent game-day issues, include event date, competition level, and callback contact.",
          ],
          note: "Support requests are triaged by severity and operational impact.",
        },
        {
          title: "Legal and Security",
          intro: "For contracts, policy requests, and responsible disclosure communications.",
          points: [
            "Legal: support@btaintel.com",
            "Privacy: support@btaintel.com",
            "Security: support@btaintel.com",
          ],
          note: "Do not send sensitive credentials in email; use redaction whenever possible.",
        },
      ]}
    />
  );
}
