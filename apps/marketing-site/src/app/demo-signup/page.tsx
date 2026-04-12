import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Demo Signup | BTA Courtside",
  description:
    "Request a live BTA Courtside product demo and we will tailor the session to your team workflows, staffing model, and game-day setup.",
  path: "/demo-signup",
});

export default function DemoSignupPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Demo"
      title="Schedule a live product session"
      summary="Share your program structure and we will walk your staff through a complete game-day and review workflow using BTA Courtside."
      primaryCta={{ label: "Email Demo Team", href: "mailto:demo@btaintel.com" }}
      secondaryCta={{ label: "Contact Sales", href: "/contact" }}
      sections={[
        {
          title: "What We Cover",
          points: [
            "Operator workflow from tip-off through corrections and period transitions.",
            "Coach dashboard views for lineup impact, pace swings, and context panels.",
            "Film-sync and review loop for postgame teaching sessions.",
          ],
        },
        {
          title: "What To Send Ahead",
          points: [
            "Team level and season timeline (varsity, club, academy, or mixed).",
            "Current tools and pain points across stat entry, review, and reporting.",
            "Desired staff roles in your pilot group and target launch window.",
          ],
        },
      ]}
    />
  );
}
