import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact | BTA Courtside",
  description:
    "Contact the BTA Courtside team for sales, partnerships, implementation questions, and platform evaluations.",
  path: "/contact",
});

export default function ContactPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Contact"
      title="Talk with the BTA Courtside team"
      summary="Reach us for product walkthroughs, implementation planning, and program-level rollout questions."
      primaryCta={{ label: "Email Support", href: "mailto:support@btaintel.com" }}
      secondaryCta={{ label: "Request Demo", href: "/demo-signup" }}
      sections={[
        {
          title: "Sales and Pilots",
          points: [
            "Email: sales@btaintel.com",
            "Use this channel for pilots, pricing, procurement, and onboarding timelines.",
            "Include your program size and season window for a faster response.",
          ],
        },
        {
          title: "General Support",
          points: [
            "Email: support@btaintel.com",
            "Use this channel for account access, workflow questions, and troubleshooting.",
            "For urgent game-day issues, include event date and organization name.",
          ],
        },
      ]}
    />
  );
}
