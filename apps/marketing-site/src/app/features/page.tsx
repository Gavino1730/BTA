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
      summary="BTA Courtside connects live events, coaching decisions, and postgame review in one flow. Instead of stitching context manually, staff can move from possession signal to action with confidence."
      primaryCta={{ label: "Start Demo Signup", href: "/demo-signup" }}
      secondaryCta={{ label: "View Pricing", href: "/pricing" }}
      variant="atlas"
      sectionLayout="timeline"
      keyMetrics={[
        { label: "Event Pipeline", value: "Realtime", detail: "Low-latency ingest and fanout" },
        { label: "State Model", value: "Deterministic", detail: "Replay-safe correction behavior" },
        { label: "Insight Style", value: "Rules Based", detail: "Transparent reasoning tied to game context" },
      ]}
      sections={[
        {
          title: "Live Operations",
          intro: "Operator reliability drives trustworthy analytics and coaching decisions.",
          points: [
            "Low-latency event ingestion built for fast possessions, substitutions, corrections, and pressure moments.",
            "Deterministic state transitions preserve accuracy, even after downstream corrections.",
            "Operator-first controls are built for touch speed, guardrails, and low cognitive load.",
          ],
          note: "Outcome: cleaner event streams under real game conditions.",
        },
        {
          title: "Shared Staff Context",
          intro: "Coaches, coordinators, and staff need the same truth at the same time.",
          points: [
            "Coach dashboard surfaces lineup, pace, possession trend, and correction-aware context in one view.",
            "Possession timelines unify score state, tactical sequence, and clip references for faster review loops.",
            "Role-specific visibility keeps assistants, analysts, and operators aligned without information overload.",
          ],
          note: "Outcome: faster decisions with fewer handoff errors.",
        },
        {
          title: "Insight and Review Loop",
          intro: "The platform is built for actionable coaching feedback, not passive reports.",
          points: [
            "Rules-based insight generation ties recommendations to explicit possession and lineup evidence.",
            "Postgame workflows preserve live context so staff can validate insights against synchronized clips.",
            "Operational history supports repeatable teaching, adjustment planning, and staff debriefs.",
          ],
          note: "Outcome: insights become decisions, not just text on a dashboard.",
        },
      ]}
    />
  );
}
