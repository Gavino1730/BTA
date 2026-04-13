import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Acceptable Use Policy | BTA Courtside",
  description:
    "Review acceptable use requirements for BTA Courtside services, including prohibited activities and enforcement terms.",
  path: "/acceptable-use",
});

export default function AcceptableUsePage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Platform Policy"
      title="Acceptable Use Policy"
      summary="This policy defines permitted and prohibited uses of BTA Courtside services to protect platform reliability, customer trust, and legal compliance."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "purpose",
          title: "Purpose and Applicability",
          paragraphs: [
            "This policy applies to all users and organizations accessing BTA Courtside websites and product surfaces. It is intended to preserve service integrity, user safety, and operational continuity.",
            "By using the platform, users agree to follow this policy in addition to the Terms of Service and any contractual obligations.",
          ],
          bullets: [
            "Applies to customer organizations, invited users, and administrators.",
            "Covers both marketing and authenticated product environments.",
            "Violations may result in enforcement actions described below.",
          ],
        },
        {
          id: "prohibited",
          title: "Prohibited Conduct",
          paragraphs: [
            "Users may not use the platform for unlawful activity, unauthorized access attempts, abusive behavior, or any activity that degrades service reliability for others.",
            "Actions that compromise security, data integrity, or system availability are strictly prohibited.",
          ],
          bullets: [
            "Attempting to bypass authentication, authorization, or access controls.",
            "Uploading malicious code, scripts, or content designed to disrupt operations.",
            "Automated scraping or extraction beyond documented and authorized interfaces.",
            "Harassment, abusive content, or fraudulent representations through platform channels.",
          ],
        },
        {
          id: "security-testing",
          title: "Security Testing and Research",
          paragraphs: [
            "We support responsible disclosure and coordinated security research. However, testing that may impact customer operations, data integrity, or service continuity is not permitted without prior written authorization.",
            "Security findings should be reported through designated channels with sufficient technical detail for triage.",
          ],
          bullets: [
            "Submit vulnerability reports to support@btaintel.com.",
            "Do not perform denial-of-service, destructive, or intrusive tests on production systems.",
            "Use non-sensitive proof-of-concept data when possible.",
          ],
        },
        {
          id: "content",
          title: "Content and Data Responsibilities",
          paragraphs: [
            "Customer organizations are responsible for ensuring that data entered into the platform is lawfully collected and authorized for use within their operations.",
            "Users must not upload or transmit content that violates law, rights of others, or contractual restrictions.",
          ],
          bullets: [
            "Do not upload content that infringes intellectual property rights.",
            "Do not share confidential or sensitive data outside authorized workflows.",
            "Organizations should maintain role-based access governance for staff accounts.",
          ],
        },
        {
          id: "enforcement",
          title: "Enforcement and Remediation",
          paragraphs: [
            "BTA Courtside may investigate suspected violations and take action proportionate to severity, including warnings, access restrictions, suspension, or termination.",
            "Where required, we may cooperate with lawful requests from authorities and disclose information consistent with legal obligations.",
          ],
          bullets: [
            "Critical threats may trigger immediate containment actions.",
            "Organizations may be required to remediate repeated policy violations.",
            "Appeals or clarification requests may be sent to support@btaintel.com.",
          ],
        },
      ]}
    />
  );
}
