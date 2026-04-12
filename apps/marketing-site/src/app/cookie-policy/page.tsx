import type { Metadata } from "next";

import { ContentPage } from "@/components/pages/content-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Cookie Policy | BTA Courtside",
  description:
    "Read the BTA Courtside Cookie Policy covering essential cookies, analytics technologies, and user controls.",
  path: "/cookie-policy",
});

export default function CookiePolicyPage(): JSX.Element {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Cookie Policy"
      summary="This policy explains the cookies and similar technologies used on BTA Courtside marketing and product surfaces."
      primaryCta={{ label: "Privacy Policy", href: "/privacy" }}
      secondaryCta={{ label: "Contact Support", href: "/support" }}
      sections={[
        {
          title: "How Cookies Are Used",
          points: [
            "Essential cookies support secure sessions and basic site functionality.",
            "Analytics cookies help us improve reliability, navigation, and content quality.",
            "Performance diagnostics may store temporary identifiers for troubleshooting.",
          ],
        },
        {
          title: "Your Choices",
          points: [
            "Browser settings can block or remove cookies.",
            "Blocking certain cookies may affect site behavior and login flows.",
            "Questions can be sent to privacy@btaintel.com.",
          ],
        },
      ]}
    />
  );
}
