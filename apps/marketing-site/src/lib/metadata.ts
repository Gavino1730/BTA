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
    openGraph: {
      title: normalizedTitle,
      description,
      type: "website",
      url: canonicalUrl,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "BTA Courtside marketing preview",
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
