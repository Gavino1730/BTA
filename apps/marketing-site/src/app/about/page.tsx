import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "About BTA Courtside | Basketball Operations Intelligence",
  description:
    "Learn how BTA Courtside helps basketball programs run game-day operations, synced film review, and coaching analytics in one system.",
  path: "/about",
});

export default function AboutPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Company"
      title="Built by basketball operators for real game pressure"
      summary="BTA Courtside was designed to replace fragmented game-day stacks with one reliable operating layer for stats, film, and coaching decisions."
      primaryCta={{ label: "Request a Demo", href: "/demo-signup" }}
      secondaryCta={{ label: "Contact Team", href: "/contact" }}
      sections={[
        {
          title: "Our Mission",
          points: [
            "Give coaches and operators one source of truth from tip-off through postgame review.",
            "Reduce manual handoff errors and increase confidence in possession-level data.",
            "Turn live context into practical coaching actions, not generic dashboards.",
          ],
        },
        {
          title: "Who We Serve",
          points: [
            "High school varsity and JV programs coordinating staff across fast game environments.",
            "AAU and club organizations needing consistent operations across teams.",
            "Player development groups connecting film outcomes to measurable progress.",
          ],
        },
      ]}
    />
  );
}
