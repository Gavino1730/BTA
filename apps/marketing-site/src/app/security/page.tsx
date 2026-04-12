import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Security | BTA Courtside",
  description:
    "Learn how BTA Courtside approaches platform security, access controls, and incident response.",
  path: "/security",
});

export default function SecurityPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Security"
      title="Security principles for game-day reliability"
      summary="Security for BTA Courtside is tightly coupled with reliability. Controls are designed to protect data integrity, access boundaries, and operational continuity under real season workloads."
      primaryCta={{ label: "Report Security Issue", href: "mailto:security@btaintel.com" }}
      secondaryCta={{ label: "Support", href: "/support" }}
      variant="pulse"
      sectionLayout="split"
      keyMetrics={[
        { label: "Access Control", value: "Role Based", detail: "Scoped permissions across staff roles" },
        { label: "Transport", value: "Encrypted", detail: "Secure in-transit communication paths" },
        { label: "Disclosure Channel", value: "Direct", detail: "security@btaintel.com" },
      ]}
      sections={[
        {
          title: "Platform Controls",
          intro: "We apply practical controls that match real operations, not checklist theater.",
          points: [
            "Role-based access boundaries aligned to coach, operator, and admin responsibilities.",
            "Secure transport, managed hosting protections, and controlled service configuration paths.",
            "Audit-oriented telemetry supporting reliability diagnostics and security investigations.",
          ],
          note: "Controls are reviewed as workflows evolve across products and services.",
        },
        {
          title: "Responsible Disclosure",
          intro: "We welcome responsible reporting and coordinate remediation quickly.",
          points: [
            "Send vulnerability reports to security@btaintel.com.",
            "Include reproduction steps, environment details, and impact assessment where possible.",
            "We acknowledge receipt, triage severity, and provide remediation follow-up communication.",
          ],
          note: "Please avoid testing that could disrupt live customer operations.",
        },
        {
          title: "Operational Security Practices",
          intro: "Security and uptime are handled as one system responsibility.",
          points: [
            "Incident response paths prioritize containment, service continuity, and communication clarity.",
            "Post-incident reviews document root causes and hardening actions for future prevention.",
            "Security considerations are integrated into release validation and environment configuration guidance.",
          ],
          note: "For contractual security requirements, contact legal@btaintel.com.",
        },
      ]}
    />
  );
}
