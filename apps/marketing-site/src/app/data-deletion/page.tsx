import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Data Deletion Requests | BTA Courtside",
  description:
    "Submit or review process details for BTA Courtside data deletion and account removal requests.",
  path: "/data-deletion",
});

export default function DataDeletionPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Policy"
      title="Data Deletion Requests"
      summary="Customers and authorized users can request deletion in accordance with contractual, regulatory, and operational retention requirements."
      primaryCta={{ label: "Submit Request", href: "mailto:privacy@btaintel.com" }}
      secondaryCta={{ label: "Privacy Policy", href: "/privacy" }}
      sections={[
        {
          title: "Request Requirements",
          points: [
            "Send requests from an authorized organization or account email address.",
            "Include organization name, account identifier, and scope of deletion request.",
            "Identity verification may be required before processing.",
          ],
        },
        {
          title: "Processing Notes",
          points: [
            "Certain records may be retained for security, compliance, or billing obligations.",
            "Deletion timelines vary by data type and storage location.",
            "Status updates are provided through the requesting email thread.",
          ],
        },
      ]}
    />
  );
}
