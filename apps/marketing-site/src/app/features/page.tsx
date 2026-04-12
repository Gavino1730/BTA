import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Platform Features | BTA Courtside",
  description:
    "Review BTA Courtside platform capabilities for live event capture, coaching dashboards, synchronized film, and insight workflows.",
  path: "/features",
});

export default function FeaturesPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Platform"
      title="Everything connected from event entry to decision"
      summary="BTA Courtside combines operator controls, coaching context, and clip-linked review into one continuous workflow across your staff."
      primaryCta={{ label: "Start Demo Signup", href: "/demo-signup" }}
      secondaryCta={{ label: "View Pricing", href: "/pricing" }}
      sections={[
        {
          title: "Live Operations",
          points: [
            "Low-latency event ingestion built for fast possessions and correction workflows.",
            "Deterministic game-state tracking for replay-safe updates and reliable stat outputs.",
            "Operator-first controls for substitutions, fouls, periods, and lineup state.",
          ],
        },
        {
          title: "Staff Workflow",
          points: [
            "Shared dashboard views for coaches, coordinators, and development staff.",
            "Possession timelines that connect actions, score context, and film references.",
            "Rules-based insights designed to be testable and easy to trust during games.",
          ],
        },
      ]}
    />
  );
}
