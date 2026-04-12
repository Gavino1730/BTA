import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Community Standards | BTA Courtside",
  description:
    "Review BTA Courtside community conduct expectations for coaches, operators, athletes, families, and school staff.",
  path: "/community-standards",
});

export default function CommunityStandardsPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Policy Pack"
      title="Community Standards"
      summary="BTA Courtside is built for sports communities. These standards apply to interactions, uploads, and communications across platform features and support channels."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "respect",
          title: "Respect and Safety Baseline",
          paragraphs: [
            "Users must treat athletes, students, coaches, officials, parents, administrators, and fans with respect. Content or behavior that creates an unsafe, abusive, or exploitative environment is not permitted.",
            "Special care is required when minors are involved, including in clips, comments, reports, and profile contexts.",
          ],
          bullets: [
            "No bullying, humiliation, or targeted abuse.",
            "No threats, intimidation, or encouragement of self-harm.",
            "No exploitative or sexualized content involving minors.",
          ],
        },
        {
          id: "prohibited-content",
          title: "Prohibited Content and Conduct",
          paragraphs: [
            "Users may not post hateful slurs, discriminatory harassment, sexually explicit content unrelated to legitimate sports use, or doxxing-style publication of private personal details.",
            "Platform tools may not be used to coordinate harassment campaigns or reputational harm.",
          ],
          bullets: [
            "No hate speech or discriminatory abuse.",
            "No non-consensual exposure of personal information.",
            "No weaponized use of stats, clips, or comments to harass individuals.",
          ],
        },
        {
          id: "integrity",
          title: "Sports Integrity and Fair Representation",
          paragraphs: [
            "Users should avoid intentionally false or misleading game records, athlete attributions, or performance claims that could cause reputational or operational harm.",
            "Disagreements over subjective coaching interpretation are expected, but intentionally deceptive publication is prohibited.",
          ],
          bullets: [
            "Do not falsify scores, rosters, or player identities.",
            "Correct known inaccuracies promptly.",
            "Respect school, team, and league communication policies.",
          ],
        },
        {
          id: "enforcement",
          title: "Moderation and Enforcement",
          paragraphs: [
            "BTA Courtside may remove content, restrict features, suspend accounts, or terminate access for conduct that violates these standards or presents safety, legal, or integrity risk.",
            "Enforcement decisions consider severity, repetition, context, and potential harm, especially where youth participants are impacted.",
          ],
          bullets: [
            "Immediate action may be taken for severe or urgent risk.",
            "Repeat violations may lead to permanent restrictions.",
            "Reports can be sent to support@btaintel.com.",
          ],
        },
      ]}
    />
  );
}
