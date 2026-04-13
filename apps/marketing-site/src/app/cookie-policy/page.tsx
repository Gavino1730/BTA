import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Cookie Policy | BTA Courtside",
  description:
    "Read the BTA Courtside Cookie Policy covering essential cookies, analytics technologies, and user controls.",
  path: "/cookie-policy",
});

export default function CookiePolicyPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Legal Policy"
      title="Cookie Policy"
      summary="This Cookie Policy explains how BTA Courtside uses cookies and similar technologies across marketing pages, account experiences, and support workflows."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "overview",
          title: "What Cookies Are",
          paragraphs: [
            "Cookies are small text files stored by your browser that help websites function, remember preferences, and measure usage patterns. Similar technologies include local storage, pixels, and script-based identifiers.",
            "Some cookies are set directly by BTA Courtside, while others may be set by trusted service providers acting on our behalf.",
          ],
          bullets: [
            "Session cookies expire when browser sessions end.",
            "Persistent cookies remain for a defined period unless manually removed.",
            "Some technologies are necessary for security and account continuity.",
          ],
        },
        {
          id: "categories",
          title: "Cookie Categories We Use",
          paragraphs: [
            "We use different cookie categories based on functional need. Exact usage can vary depending on your route, account state, and browser settings.",
            "Where legally required, optional cookie categories may be enabled only after user consent.",
          ],
          bullets: [
            "Essential cookies: authentication, security controls, and core page functionality.",
            "Performance cookies: service diagnostics, load behavior, and reliability analysis.",
            "Analytics cookies: aggregate usage insights that inform content and UX improvements.",
            "Preference cookies: remembered settings such as language or display choices.",
          ],
        },
        {
          id: "purposes",
          title: "How We Use Cookie Data",
          paragraphs: [
            "Cookie-derived information helps us secure sessions, detect abuse, troubleshoot issues, and improve platform stability. Data is used in combination with other operational telemetry where appropriate.",
            "We do not use cookies to sell personal information. Processing is aligned with our Privacy Policy and contractual obligations.",
          ],
          bullets: [
            "Maintain authenticated sessions and prevent unauthorized account use.",
            "Measure page reliability and error patterns to prioritize fixes.",
            "Understand aggregate content usage trends for product and support planning.",
          ],
        },
        {
          id: "controls",
          title: "Your Controls and Choices",
          paragraphs: [
            "Most browsers allow users to block, remove, or limit cookies. You can manage settings through browser privacy controls, though disabling certain cookies may affect website behavior.",
            "Where consent tools are available, you can update category preferences at any time through those controls.",
          ],
          bullets: [
            "Browser-level settings can clear existing cookies and block new ones.",
            "Blocking essential cookies may impact login, navigation, and account features.",
            "For privacy questions, contact support@btaintel.com.",
          ],
        },
        {
          id: "updates",
          title: "Changes and Contact",
          paragraphs: [
            "We may update this Cookie Policy to reflect changes in technology, legal requirements, or service operations. Updates will be reflected by the revised date at the top of this page.",
            "For more detail on personal information processing, review our Privacy Policy or contact our privacy team directly.",
          ],
          bullets: [
            "Privacy inquiries: support@btaintel.com",
            "Support inquiries: support@btaintel.com",
            "Legal inquiries: support@btaintel.com",
          ],
        },
      ]}
    />
  );
}
