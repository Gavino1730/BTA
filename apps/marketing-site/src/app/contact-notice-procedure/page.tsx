import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact Information and Notice Procedure | BTA Courtside",
  description:
    "Find policy notice contacts for support, privacy, billing, copyright, and legal requests.",
  path: "/contact-notice-procedure",
});

export default function ContactNoticeProcedurePage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Policy Pack"
      title="Contact Information and Notice Procedure"
      summary="Use the channels below for legal notices, support requests, billing questions, privacy rights requests, security disclosures, and copyright complaints."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "company-details",
          title: "Company Details",
          paragraphs: [
            "Legal Name: BTA Courtside Intelligence.",
            "Doing Business As: Beyond the Arc.",
            "Website: btaintel.com.",
            "Mailing Address: Portland, Oregon, USA 97229.",
          ],
          bullets: [
            "General Support: support@btaintel.com",
            "Privacy: privacy@btaintel.com",
            "Billing: billing@btaintel.com",
            "Copyright: copyright@btaintel.com",
            "Legal: legal@btaintel.com",
            "Security: security@btaintel.com",
          ],
        },
        {
          id: "request-requirements",
          title: "Request Requirements",
          paragraphs: [
            "To protect account integrity and user privacy, BTA Courtside may require sufficient information to verify identity, authority, account relationship, and ownership before processing requests.",
            "Incomplete requests may require follow-up and can delay response timelines.",
          ],
          bullets: [
            "Include organization name and relevant account email.",
            "Describe the specific page, feature, or data category involved.",
            "Provide supporting documentation when acting as an authorized representative.",
          ],
        },
        {
          id: "notice-handling",
          title: "Notice Handling Procedure",
          paragraphs: [
            "Notices are routed by category and triaged based on operational urgency, legal requirements, and user impact. High-severity service and security issues receive prioritized handling.",
            "Where appropriate, BTA Courtside may coordinate with organization administrators for account-scoped decisions, especially in school or team-controlled workspaces.",
          ],
          bullets: [
            "Operational incidents: support escalation workflow.",
            "Privacy rights requests: privacy review and identity verification.",
            "Legal notices: legal team intake and response process.",
          ],
        },
      ]}
    />
  );
}
