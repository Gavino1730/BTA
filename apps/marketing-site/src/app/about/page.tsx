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
      summary="BTA Courtside was born from the same sideline chaos our customers face: split tools, delayed clip review, and too many decisions riding on incomplete context. We built one operating system that keeps staff aligned from first whistle through the final postgame debrief."
      primaryCta={{ label: "Request a Demo", href: "/demo-signup" }}
      secondaryCta={{ label: "Contact Team", href: "/contact" }}
      variant="horizon"
      sectionLayout="split"
      keyMetrics={[
        { label: "Pilot Seasons", value: "12", detail: "Across varsity, academy, and club programs" },
        { label: "Staff Roles Supported", value: "9", detail: "Coaches, operators, analysts, and coordinators" },
        { label: "Workflow Goal", value: "1 System", detail: "No fragmented tools on game day" },
      ]}
      sections={[
        {
          title: "Why We Built It",
          intro: "Most basketball staffs do not lose games because of effort. They lose signal quality under pressure.",
          points: [
            "Stat entry happens in one app while tactical review happens somewhere else, forcing staff to mentally reconcile timelines.",
            "Film clips often arrive late or detached from possession context, reducing teaching quality after the game.",
            "High-pressure corrections can create downstream trust issues unless state transitions are deterministic and audit-friendly.",
          ],
          note: "BTA Courtside closes these gaps by treating operator actions, game state, and review context as one continuous stream.",
        },
        {
          title: "Operating Principles",
          intro: "Reliability matters more than flashy dashboards when every possession is consequential.",
          points: [
            "Deterministic game-state updates ensure correction workflows remain replay-safe and traceable.",
            "Shared event contracts keep operators, coaches, and insight surfaces aligned without shape drift.",
            "Practical intelligence first: prompts and recommendations must be explainable and tied to evidence.",
          ],
          note: "We prioritize auditability, speed, and confidence under real-world gym conditions.",
        },
        {
          title: "Who We Partner With",
          intro: "Our strongest results come from programs that treat operations as a competitive edge.",
          points: [
            "Varsity and JV staff building repeatable pregame, live, and postgame workflows across seasons.",
            "Club organizations standardizing event quality and reporting expectations between teams.",
            "Player development groups connecting session clips and lineup context to measured growth plans.",
          ],
          note: "If your staff currently asks 'which tool has the real answer,' this is the exact problem set we solve.",
        },
      ]}
    />
  );
}
