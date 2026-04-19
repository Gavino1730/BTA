import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/site-url";

type MetaInput = {
  title: string;
  description: string;
  path: string;
};

const BRAND_TITLE = "BTA Courtside";

function normalizePageTitle(rawTitle: string): string {
  const firstSegment = rawTitle
    .split("|")[0]
    ?.replace(/\s+BTA Courtside$/i, "")
    .trim();

  if (!firstSegment || /^BTA Courtside$/i.test(firstSegment)) {
    return BRAND_TITLE;
  }

  return `${firstSegment} | ${BRAND_TITLE}`;
}

export function buildPageMetadata({ title, description, path }: MetaInput): Metadata {
  const siteUrl = getSiteUrl();
  const canonicalPath = path.startsWith("/") ? path : `/${path}`;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const normalizedTitle = normalizePageTitle(title);

  return {
    title: normalizedTitle,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      title: normalizedTitle,
      description,
      type: "website",
      url: canonicalUrl,
      siteName: "BTA Courtside",
      locale: "en_US",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${normalizedTitle} — BTA Courtside`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: normalizedTitle,
      description,
      images: ["/twitter-image"],
    },
  };
}
