import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service | BTA Courtside",
  description:
    "Review BTA Courtside Terms of Service, including use rights, account responsibilities, and service limitations.",
  path: "/terms",
});

export default function TermsPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Legal Terms"
      title="Terms of Service"
      summary="These Terms govern access to and use of services provided by BTA Courtside Intelligence, doing business as Beyond the Arc, including btaintel.com and related software, applications, and workflow tools."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "agreement",
          title: "Agreement to These Terms",
          paragraphs: [
            "These Terms of Service, together with incorporated policies and any controlling order forms, govern access to and use of BTA Courtside services. By accessing or using the service, creating an account, or uploading content, you agree to these Terms.",
            "If you use the service on behalf of a school, team, club, league, or other organization, you represent you have authority to bind that organization to these Terms.",
          ],
          bullets: [
            "Do not use the service if you do not agree to these Terms.",
            "Supplemental terms may apply to specific features and integrations.",
            "Separate signed agreements control where conflicts exist.",
          ],
        },
        {
          id: "eligibility-service",
          title: "Eligibility and Service Description",
          paragraphs: [
            "You must be legally able to enter a binding agreement to use the service. If required by local law, minors may use the service only with involvement of authorized adults or organizations.",
            "Features may include live scoring, statistics, film workflows, reports, dashboards, communication features, and AI-assisted summaries. Features may be modified, restricted, or discontinued.",
          ],
          bullets: [
            "Service availability and feature scope may change over time.",
            "Suspended or terminated users may not re-access without authorization.",
            "Organization-specific permissions and legal obligations still apply.",
          ],
        },
        {
          id: "accounts",
          title: "Accounts, Organization Workspaces, and Security",
          paragraphs: [
            "Users must provide accurate account information and keep credentials secure. You are responsible for activity under your account and must promptly report unauthorized use.",
            "If a workspace is created or paid for by an organization, that organization may control user roles, permissions, exports, and data administration subject to law and contract.",
          ],
          bullets: [
            "Report account compromise to support@btaintel.com.",
            "Organization administrators should remove stale access promptly.",
            "Accounts may be suspended for security or policy violations.",
          ],
        },
        {
          id: "content-ip",
          title: "User Content, Platform Content, and Rights",
          paragraphs: [
            "You retain ownership of your user content to the extent allowed by law and agreement. By uploading content, you grant BTA Courtside a license to host, process, display, analyze, and use content as needed to provide and improve services.",
            "The service, interface, workflows, trademarks, and underlying technology are owned by BTA Courtside or its licensors. No ownership rights are transferred except as expressly granted.",
          ],
          bullets: [
            "Upload only content you are authorized to use.",
            "User content licenses may persist in backups and legal retention contexts.",
            "Platform IP remains protected by applicable law.",
          ],
        },
        {
          id: "prohibited",
          title: "Prohibited Conduct",
          paragraphs: [
            "You may not use the service for unlawful, fraudulent, abusive, or harmful purposes, including harassment, unauthorized scraping, security bypass attempts, malware upload, or false data manipulation intended to mislead or cause harm.",
            "You may not use the platform to build competing products from non-public service data or violate school, league, or venue rules applicable to your usage context.",
          ],
          bullets: [
            "No impersonation or deceptive identity behavior.",
            "No reverse engineering except where legally protected.",
            "No unauthorized access to non-public service areas.",
          ],
        },
        {
          id: "accuracy-ai",
          title: "Live Data, AI Features, and Accuracy Limits",
          paragraphs: [
            "Live sports data can contain delays, omissions, or later corrections. Film synchronization and timeline alignment may be imperfect due to workflow and infrastructure factors.",
            "AI-assisted outputs are informational and may be incomplete, incorrect, or unsuitable for specific decisions. Human review is required before material reliance.",
          ],
          bullets: [
            "No guarantee of finality or completeness for live game values.",
            "AI output is not medical, legal, officiating, or guaranteed coaching advice.",
            "Streaming and realtime features may be interrupted or degraded.",
          ],
        },
        {
          id: "billing-termination",
          title: "Payments, Suspension, and Termination",
          paragraphs: [
            "Paid plans are governed by posted billing terms and any controlling contracts. Non-payment, abuse, legal risk, or policy violations may result in suspension or termination.",
            "You may stop using the service at any time. Termination does not remove obligations accrued prior to termination, including payment and legal duties.",
          ],
          bullets: [
            "Billing details are covered in the Billing and Refund Policy.",
            "Suspension may be immediate for security or abuse risk.",
            "Organization-controlled workspaces may affect post-termination data handling.",
          ],
        },
        {
          id: "disclaimers-liability-law",
          title: "Disclaimers, Liability, Indemnity, and Governing Law",
          paragraphs: [
            "To the fullest extent permitted by law, services are provided on an as-is and as-available basis without warranties of uninterrupted operation, fitness for a particular purpose, non-infringement, or error-free output.",
            "To the fullest extent permitted by law, BTA Courtside and related parties are not liable for indirect, incidental, special, consequential, or punitive damages. Total liability is limited as described in applicable agreement terms, generally no more than amounts paid in the prior twelve months or one hundred U.S. dollars, whichever is greater unless law requires otherwise.",
            "You agree to indemnify BTA Courtside for claims arising from your use, uploaded content, or policy/law violations. These Terms are governed by Oregon law, and disputes will be resolved in competent courts in Oregon unless a signed agreement provides otherwise.",
          ],
          bullets: [
            "Mailing address: Portland, Oregon, USA 97229.",
            "Legal questions: legal@btaintel.com.",
            "We may update Terms and post updated effective dates on this website.",
          ],
        },
      ]}
    />
  );
}
