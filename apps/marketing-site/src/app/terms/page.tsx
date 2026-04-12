import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service | BTA Courtside",
  description:
    "Review BTA Courtside Terms of Service, including use rights, account responsibilities, and service limitations.",
  path: "/terms",
});

export default function TermsPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Terms of Service"
      summary="These terms govern use of BTA Courtside services, websites, and software applications."
      primaryCta={{ label: "Contact Legal", href: "mailto:legal@btaintel.com" }}
      secondaryCta={{ label: "Privacy Policy", href: "/privacy" }}
      sections={[
        {
          title: "Service Use",
          points: [
            "Customers receive a limited, non-transferable right to use the service under active subscription.",
            "Organizations are responsible for account security and authorized staff usage.",
            "You agree not to misuse the service or interfere with platform reliability.",
          ],
        },
        {
          title: "Commercial Terms",
          points: [
            "Billing terms are defined by your order form or commercial agreement.",
            "Access may be suspended for material violations or non-payment.",
            "Liability, warranty, and indemnity terms apply as set in your executed contract.",
          ],
        },
      ]}
    />
  );
}
