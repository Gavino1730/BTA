import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Data Deletion Requests | BTA Courtside",
  description:
    "Submit or review process details for BTA Courtside data deletion and account removal requests.",
  path: "/data-deletion",
});

export default function DataDeletionPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Privacy Operations"
      title="Data Retention and Deletion Policy"
      summary="This policy explains how BTA Courtside Intelligence retains, archives, and deletes data across account, sports, support, and security contexts, including organization-controlled workspace scenarios."
      effectiveDate="April 12, 2026"
      lastUpdated="April 12, 2026"
      sections={[
        {
          id: "retention-approach",
          title: "General Retention Approach",
          paragraphs: [
            "BTA Courtside retains data for as long as reasonably necessary to provide services, maintain account functionality, preserve operational continuity, provide support, enforce agreements, protect integrity and security, and comply with legal obligations.",
            "Retention periods vary by data category, contractual terms, legal requirements, and whether the data is controlled by an organization workspace.",
          ],
          bullets: [
            "Company: BTA Courtside Intelligence (doing business as Beyond the Arc).",
            "Website: btaintel.com.",
            "Mailing Address: Portland, Oregon, USA 97229.",
          ],
        },
        {
          id: "retention-categories",
          title: "Categories of Retained Data",
          paragraphs: [
            "Retention practices may include account records, billing history, support correspondence, system logs, security telemetry, sports event records, and media metadata where reasonably necessary for service operation.",
            "De-identified or aggregated data may be retained for analytics, benchmarking, and service improvement where it does not reasonably identify an individual.",
          ],
          bullets: [
            "Account and billing records may be retained for legal and tax obligations.",
            "Support and security logs may be retained for incident and abuse prevention.",
            "Sports records may be retained to support historical continuity and reporting integrity.",
          ],
        },
        {
          id: "deletion-requests",
          title: "Deletion Request Process",
          paragraphs: [
            "Authorized users may request deletion by contacting support@btaintel.com. Requests should include sufficient detail to identify the account, organization context, and scope of data to be reviewed.",
            "Before acting, we may verify identity and authority, and where relevant coordinate with organization administrators controlling the applicable workspace.",
          ],
          bullets: [
            "Privacy requests: support@btaintel.com.",
            "Legal escalation: support@btaintel.com.",
            "Support intake: support@btaintel.com.",
          ],
        },
        {
          id: "limits-exceptions",
          title: "Deletion Limits and Exceptions",
          paragraphs: [
            "BTA Courtside may deny or limit deletion where retention is required for legal compliance, fraud prevention, security defense, dispute resolution, contractual obligations, audit integrity, or backup system consistency.",
            "Where full deletion is not possible, we will apply lawful minimization and restriction controls where appropriate and available.",
          ],
          bullets: [
            "Organization-controlled data may require controller-level approval.",
            "Security and billing records may require statutory retention windows.",
            "Backup and disaster recovery copies may persist temporarily before overwrite cycles complete.",
          ],
        },
        {
          id: "organization-control",
          title: "Organization Control and Youth Context",
          paragraphs: [
            "Where data is uploaded within school, team, club, or enterprise workspaces, the organization may control retention and deletion decisions, subject to applicable law and contract terms.",
            "For youth and student information, requests may need to be routed through the controlling organization, parent/guardian channels, or authorized administrators based on legal role and authority.",
          ],
          bullets: [
            "Youth/student policy reference: /youth-student-data-policy.",
            "Privacy policy reference: /privacy.",
            "Notice procedure reference: /contact-notice-procedure.",
          ],
        },
      ]}
    />
  );
}
