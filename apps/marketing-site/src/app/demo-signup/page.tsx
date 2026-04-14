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
      summary="Tell us how your staff currently captures, reviews, and coaches, and we will run a practical session mapped to your reality. The goal is to show exactly how BTA Courtside supports your team under real game pressure, not a generic software walkthrough."
      primaryCta={{ label: "Email Support", href: "mailto:support@btaintel.com" }}
      secondaryCta={{ label: "Contact Sales", href: "/contact" }}
      variant="sprint"
      sectionLayout="timeline"
      keyMetrics={[
        { label: "Session Length", value: "45-60 Min", detail: "Live workflow walkthrough with Q&A" },
        { label: "Attendees", value: "3-8 Staff", detail: "Coaches, operators, analysts, admins" },
        { label: "Output", value: "Pilot Plan", detail: "Operational fit and next-step rollout guidance" },
      ]}
      sections={[
        {
          title: "Discovery and Baseline",
          intro: "We start with your existing process so recommendations are grounded in your reality.",
          points: [
            "Current game-day workflow mapping: tools, roles, pain points, and timing bottlenecks.",
            "Staff responsibility map for operators, bench coaches, analysts, and program leads.",
            "Priority outcomes for pilot success, such as cleaner corrections or faster review turnaround.",
          ],
          note: "This phase ensures the demo targets your constraints, not ours.",
        },
        {
          title: "Live Workflow Session",
          intro: "Then we run through a practical end-to-end flow inside the product.",
          points: [
            "Operator controls from tip-off through substitutions, fouls, period transitions, and corrections.",
            "Coaching surfaces showing lineup context, pace trends, and possession-level signal quality.",
            "Review loop from event timeline to synchronized clips and coaching action items.",
          ],
          note: "We focus on decision quality and staff confidence, not feature checklists.",
        },
        {
          title: "Pilot Readiness",
          intro: "Every demo ends with a practical next-step plan.",
          points: [
            "Suggested pilot roster and role assignments for first live events.",
            "Implementation sequence covering setup, training, and first-game support checkpoints.",
            "Success metrics and review cadence for deciding full rollout timing.",
          ],
          note: "If there is not a clear pilot path, we will say so directly.",
        },
      ]}
    />
  );
}
