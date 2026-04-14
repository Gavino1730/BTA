import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Copyright and DMCA Policy | BTA Courtside",
  description:
    "Read BTA Courtside copyright reporting, DMCA notice requirements, counter notice process, and repeat infringer policy.",
  path: "/copyright-policy",
});

export default function CopyrightPolicyPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Policy Pack"
      title="Copyright and DMCA Policy"
      summary="BTA Courtside Intelligence respects intellectual property rights and expects users to upload and share only content they are authorized to use."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "overview",
          title: "Policy Overview",
          paragraphs: [
            "This policy describes how BTA Courtside handles notices alleging copyright infringement and how users may respond if content is removed by mistake. It is intended to align platform operation with applicable intellectual property law.",
            "Submitting knowingly false notices or counter notices may create legal liability. Parties should provide complete and accurate information.",
          ],
          bullets: [
            "Copyright contact email: support@btaintel.com.",
            "Company: BTA Courtside Intelligence, doing business as Beyond the Arc.",
            "Website: btaintel.com.",
          ],
        },
        {
          id: "notice-requirements",
          title: "Infringement Notice Requirements",
          paragraphs: [
            "If you believe content on the service infringes your copyright, submit a written notice with enough detail for us to identify the work and locate the allegedly infringing material.",
            "Notices that are incomplete or insufficiently specific may delay review or require follow-up before action can be taken.",
          ],
          bullets: [
            "Your name and contact information.",
            "Identification of the copyrighted work you claim is infringed.",
            "Identification of the allegedly infringing material and where it appears on the service.",
            "A good-faith statement that the use is not authorized.",
            "A statement that notice information is accurate and you are authorized to act.",
            "Physical or electronic signature.",
          ],
        },
        {
          id: "counter-notice",
          title: "Counter Notice Process",
          paragraphs: [
            "If you believe content was removed or disabled due to mistake or misidentification, you may submit a counter notice with legally required details. Counter notices are reviewed according to applicable law and platform procedures.",
            "Where required, BTA Courtside may forward counter notice details to the original claimant and restore content if legal conditions are met.",
          ],
          bullets: [
            "Include contact information and material identification.",
            "Include a statement under penalty of perjury where applicable.",
            "State basis for believing removal was erroneous.",
          ],
        },
        {
          id: "repeat-infringers",
          title: "Repeat Infringer Policy",
          paragraphs: [
            "BTA Courtside may suspend or terminate accounts of repeat infringers in appropriate circumstances. Enforcement decisions consider severity, frequency, and evidence quality.",
            "Users may not re-upload content removed for infringement without sufficient rights or authorization.",
          ],
          bullets: [
            "Repeated valid complaints may trigger access restrictions.",
            "Attempts to evade enforcement controls may result in permanent termination.",
            "Appeals may be directed to support@btaintel.com.",
          ],
        },
        {
          id: "school-content",
          title: "School, Team, and Youth Media Context",
          paragraphs: [
            "Because BTA Courtside is used by schools, clubs, and teams, users must ensure they have rights and permissions for film, clips, logos, music, and images uploaded to the platform.",
            "Organizations are responsible for obtaining required permissions from rights holders and for setting appropriate sharing controls before publishing media.",
          ],
          bullets: [
            "Do not upload copyrighted broadcast footage without authorization.",
            "Do not include unlicensed music in uploaded clips where rights are required.",
            "Use caution with youth athlete media and public sharing controls.",
          ],
        },
      ]}
    />
  );
}
