import { getSiteUrl } from "@/lib/site-url";

/**
 * Site-level JSON-LD structured data for Google rich results.
 * Renders Organization + WebSite schemas to improve search appearance.
 */
export function SiteJsonLd(): JSX.Element {
  const siteUrl = getSiteUrl();

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "BTA Courtside Intelligence",
    alternateName: "BTA Courtside",
    legalName: "BTA Courtside Intelligence",
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      url: `${siteUrl}/brand-icon.png`,
      width: 512,
      height: 512,
    },
    description:
      "Premium basketball operations software for live stat keeping, game workflows, synced film review, and AI coaching insights.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Portland",
      addressRegion: "OR",
      postalCode: "97229",
      addressCountry: "US",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        email: "support@btaintel.com",
        contactType: "customer support",
        availableLanguage: "English",
      },
    ],
    sameAs: [],
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: "BTA Courtside",
    description:
      "Live basketball operations platform for coaches, operators, and competitive programs.",
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/support?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${siteUrl}/#app`,
    name: "BTA Courtside",
    applicationCategory: "SportsApplication",
    operatingSystem: "Web, iOS",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free trial available. Paid plans for teams and programs.",
    },
    description:
      "Real-time basketball stat keeping, coaching dashboards, synced film review, and AI-driven game insights for competitive programs.",
    url: siteUrl,
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApp) }}
      />
    </>
  );
}
