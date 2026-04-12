import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy | BTA Courtside",
  description:
    "Read the BTA Courtside Privacy Policy covering data collection, processing, retention, and user rights.",
  path: "/privacy",
});

export default function PrivacyPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Legal Policy"
      title="Privacy Policy"
      summary="This Privacy Policy explains how BTA Courtside collects, uses, stores, and discloses personal information when organizations and individuals use our marketing site, products, and support channels."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "scope",
          title: "Scope and Roles",
          paragraphs: [
            "This policy applies to information processed through our websites, product interfaces, and customer support channels. Depending on context, BTA Courtside may act as a service provider processing customer data on behalf of organizations, or as a controller for business contact and account administration information.",
            "When schools, programs, or organizations use BTA Courtside, they determine what roster, staff, and event data is entered into the platform. In those circumstances, we process information under contractual instructions and applicable data protection law.",
          ],
          bullets: [
            "Controller context: website inquiries, commercial contacts, and account relationship management.",
            "Processor context: event, roster, and workflow data submitted by customer organizations.",
            "Questions about role-specific processing should be directed to privacy@btaintel.com.",
          ],
        },
        {
          id: "collection",
          title: "Information We Collect",
          paragraphs: [
            "We collect information directly from users, from organization administrators, and automatically through platform usage. The exact categories depend on account role, feature usage, and support interactions.",
            "Data categories may include profile information, organization metadata, authentication identifiers, usage telemetry, and event-level operational records needed to deliver core product functionality.",
          ],
          bullets: [
            "Identity and contact details such as name, email address, and organization affiliation.",
            "Account and access data including login activity, role assignments, and session diagnostics.",
            "Operational data entered by users, including game-event and workflow context records.",
            "Support correspondence and attachments provided for troubleshooting or implementation guidance.",
          ],
        },
        {
          id: "use",
          title: "How We Use Information",
          paragraphs: [
            "We use information to provide and secure services, operate accounts, troubleshoot incidents, and communicate with customers. We also use limited telemetry to improve reliability, product quality, and support outcomes.",
            "We do not sell personal information. Data use is limited to legitimate business purposes, contractual obligations, legal requirements, and customer-directed processing in service-provider contexts.",
          ],
          bullets: [
            "Provide product functionality, authentication, and customer-requested workflows.",
            "Maintain service reliability, monitor platform health, and investigate incidents.",
            "Support implementation, answer inquiries, and communicate operational updates.",
            "Comply with legal obligations and enforce contractual terms.",
          ],
        },
        {
          id: "sharing",
          title: "Data Sharing and Disclosure",
          paragraphs: [
            "We share information with service providers and subprocessors that help us host, secure, and operate the platform, subject to contractual confidentiality and data protection obligations.",
            "We may disclose information where required by law, to protect rights and security, or in connection with corporate transactions, always consistent with applicable legal standards.",
          ],
          bullets: [
            "Infrastructure and hosting providers used to operate the service environment.",
            "Security and monitoring partners supporting incident detection and platform integrity.",
            "Professional advisors and authorities where disclosure is legally required.",
          ],
        },
        {
          id: "retention",
          title: "Retention and Deletion",
          paragraphs: [
            "We retain personal information for as long as needed to provide services, fulfill contractual duties, resolve disputes, and satisfy legal obligations. Retention periods vary by data type and customer agreement terms.",
            "Deletion requests are processed in line with contractual commitments, legal constraints, and technical backup cycles. Some records may be retained for security, compliance, or billing reasons.",
          ],
          bullets: [
            "Active account data is retained while services are provisioned.",
            "Support and audit records may be retained for security and dispute resolution purposes.",
            "Deletion requests can be submitted via privacy@btaintel.com or the Data Deletion page.",
          ],
        },
        {
          id: "rights",
          title: "Privacy Rights and Choices",
          paragraphs: [
            "Depending on your jurisdiction, you may have rights to access, correct, delete, restrict, or object to certain processing, and to request data portability where applicable. We evaluate and respond to valid requests in accordance with legal requirements.",
            "Where we process data on behalf of customer organizations, requests may need to be directed to the organization that controls the relevant account and workflow data.",
          ],
          bullets: [
            "Submit rights requests to privacy@btaintel.com with sufficient identity and context details.",
            "Organization administrators can manage role access and user permissions directly.",
            "Users may update selected profile fields within account settings where available.",
          ],
        },
        {
          id: "security",
          title: "Security and International Transfers",
          paragraphs: [
            "We implement administrative, technical, and organizational safeguards designed to protect personal information against unauthorized access, disclosure, or loss. No method of transmission or storage is fully secure, but we continuously improve controls.",
            "If data is transferred across borders, we use appropriate legal and contractual safeguards consistent with applicable law and risk posture.",
          ],
          bullets: [
            "Role-based access controls and monitoring for account and operational actions.",
            "Encryption in transit and controlled infrastructure access practices.",
            "Incident response procedures for containment, investigation, and communication.",
          ],
        },
        {
          id: "updates",
          title: "Policy Updates and Contact",
          paragraphs: [
            "We may update this Privacy Policy from time to time to reflect legal, operational, or product changes. Material updates will be reflected by the updated date and, where required, additional notice.",
            "For privacy questions, requests, or complaints, contact privacy@btaintel.com. For contractual terms, contact legal@btaintel.com.",
          ],
          bullets: [
            "Privacy inquiries: privacy@btaintel.com",
            "Legal inquiries: legal@btaintel.com",
            "Security disclosures: security@btaintel.com",
          ],
        },
      ]}
    />
  );
}
