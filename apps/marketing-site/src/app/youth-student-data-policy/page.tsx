import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Youth, Student, and School Data Addendum | BTA Courtside",
  description:
    "Read BTA Courtside youth and student data rules for schools, teams, minors, and authorized adult operators.",
  path: "/youth-student-data-policy",
});

export default function YouthStudentDataPolicyPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Policy Pack"
      title="Youth, Student, and School Data Addendum"
      summary="This addendum applies where BTA Courtside is used with youth athletes, student information, school programs, or other minors. It should be read with the Privacy Policy and Terms of Service."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "intended-use",
          title: "Intended Use Context",
          paragraphs: [
            "BTA Courtside is designed primarily for use by schools, teams, clubs, coaches, administrators, and other authorized adults managing sports operations. It is not intended as an open child-directed consumer platform.",
            "Where minors are involved, organizations and responsible adults must ensure lawful authority, permissions, and instructions for data use and publication settings.",
          ],
          bullets: [
            "Primary operators should be authorized staff or organization administrators.",
            "Minor participation data must be handled under organization governance.",
            "Public posting controls should be deliberate and role-restricted.",
          ],
        },
        {
          id: "data-types",
          title: "Youth-Related Data Types",
          paragraphs: [
            "Depending on feature usage, the platform may process youth-related data such as player names, jersey numbers, positions, team affiliation, game participation records, statistics, clips, and coaching notes.",
            "Sensitive information should not be uploaded unless necessary, authorized, and protected with appropriate safeguards.",
          ],
          bullets: [
            "Typical data: roster identity, game events, clips, and schedule data.",
            "Avoid uploading unnecessary sensitive categories.",
            "Limit access by role and operational necessity.",
          ],
        },
        {
          id: "organization-responsibilities",
          title: "School and Organization Responsibilities",
          paragraphs: [
            "Schools, clubs, and teams using BTA Courtside are responsible for deciding what data is uploaded, which users receive access, and whether content is private, internal, or public.",
            "Organizations are also responsible for providing any required notices, obtaining permissions, and satisfying their own legal and policy obligations.",
          ],
          bullets: [
            "Manage permissions and role assignments actively.",
            "Establish publication rules for clips and athlete profile visibility.",
            "Ensure staff understand community and privacy obligations.",
          ],
        },
        {
          id: "guardian-requests",
          title: "Parent and Guardian Requests",
          paragraphs: [
            "Parents and guardians may contact privacy@btaintel.com regarding access, correction, or deletion requests related to minor data where BTA Courtside is the appropriate responding party.",
            "In many cases, requests must be directed first to the school, team, or organization that controls the relevant workspace and account.",
          ],
          bullets: [
            "Privacy contact: privacy@btaintel.com.",
            "Requests may require identity and authority verification.",
            "Controller organizations may manage request outcomes for their workspaces.",
          ],
        },
        {
          id: "public-sharing",
          title: "Public Sharing Caution",
          paragraphs: [
            "Users should apply special care before publishing youth athlete stats, clips, schedules, or identifying details publicly. Public availability can increase visibility and misuse risk.",
            "Only authorized users should manage external sharing settings and publication workflows.",
          ],
          bullets: [
            "Use minimum necessary public detail for youth profiles.",
            "Review publication defaults before season launch.",
            "Remove or restrict content promptly when concerns are raised.",
          ],
        },
      ]}
    />
  );
}
