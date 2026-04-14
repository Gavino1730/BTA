import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "AI, Statistics, and Service Accuracy Disclaimer | BTA Courtside",
  description:
    "Read important limitations and disclaimers regarding live stats, AI outputs, synchronization, streaming reliability, and decision use.",
  path: "/ai-accuracy-disclaimer",
});

export default function AiAccuracyDisclaimerPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Policy Pack"
      title="AI, Statistics, and Service Accuracy Disclaimer"
      summary="Sports data and AI-assisted outputs are operational tools, not guaranteed truth sources. This disclaimer explains platform limits and required user review responsibilities."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "no-guarantee",
          title: "No Guarantee of Accuracy",
          paragraphs: [
            "Live sports data is dynamic and may contain delays, omissions, sync variance, or attribution errors. Scores, timelines, clip tags, possession logs, and related outputs may be corrected later.",
            "BTA Courtside does not guarantee that any game value, player stat, clip alignment, or generated summary is complete, final, or error-free.",
          ],
          bullets: [
            "Manual entry, imports, and integrations may each introduce variance.",
            "Historical corrections can change prior views and reports.",
            "Users should verify critical values before publication or decision use.",
          ],
        },
        {
          id: "human-review",
          title: "Human Review Is Required",
          paragraphs: [
            "Users are responsible for reviewing material outputs before relying on them for coaching, scouting, roster actions, discipline, recruiting, media publication, or public claims.",
            "Where decisions have significant impact on players or students, organizations should maintain human verification workflows.",
          ],
          bullets: [
            "Confirm key metrics against source context before external sharing.",
            "Use cross-check processes for high-stakes communications.",
            "Treat generated outputs as support, not automatic authority.",
          ],
        },
        {
          id: "ai-limitations",
          title: "AI Feature Limitations",
          paragraphs: [
            "AI-assisted summaries, recommendations, or classifications may be incomplete, outdated, biased, or contextually incorrect. They are provided for workflow support and informational use only.",
            "AI outputs are not medical advice, legal advice, officiating decisions, recruiting guarantees, or definitive performance judgments.",
          ],
          bullets: [
            "Always review AI outputs before operational use.",
            "Do not treat generated text as guaranteed factual record.",
            "Use organization-specific standards for final decision approval.",
          ],
        },
        {
          id: "streaming-uptime",
          title: "Streaming, Uptime, and Dependency Risk",
          paragraphs: [
            "Livestreaming, uploads, playback, and real-time features depend on venue connectivity, hardware, user configuration, and third-party infrastructure. Interruptions and degraded performance can occur.",
            "BTA Courtside is not responsible for losses caused by network conditions, device failure, third-party outages, operator misuse, or circumstances outside reasonable control.",
          ],
          bullets: [
            "Maintain contingency workflows for critical events.",
            "Verify local network and device readiness pregame.",
            "Report reliability incidents to support@btaintel.com for review.",
          ],
        },
      ]}
    />
  );
}
