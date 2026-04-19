import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

type SitemapEntry = {
  route: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

const sitemapEntries: SitemapEntry[] = [
  // Core — highest value, crawled frequently
  { route: "/", changeFrequency: "weekly", priority: 1.0 },
  { route: "/features", changeFrequency: "weekly", priority: 0.9 },
  { route: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { route: "/demo-signup", changeFrequency: "weekly", priority: 0.9 },
  { route: "/about", changeFrequency: "monthly", priority: 0.85 },
  // Secondary — crawled monthly
  { route: "/get-started", changeFrequency: "monthly", priority: 0.8 },
  { route: "/contact", changeFrequency: "monthly", priority: 0.75 },
  { route: "/support", changeFrequency: "monthly", priority: 0.75 },
  { route: "/security", changeFrequency: "monthly", priority: 0.7 },
  // Policy pages — rarely change
  { route: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { route: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { route: "/cookie-policy", changeFrequency: "yearly", priority: 0.3 },
  { route: "/acceptable-use", changeFrequency: "yearly", priority: 0.3 },
  { route: "/data-deletion", changeFrequency: "yearly", priority: 0.3 },
  { route: "/billing-refund-policy", changeFrequency: "yearly", priority: 0.3 },
  { route: "/copyright-policy", changeFrequency: "yearly", priority: 0.3 },
  { route: "/youth-student-data-policy", changeFrequency: "yearly", priority: 0.3 },
  { route: "/community-standards", changeFrequency: "yearly", priority: 0.3 },
  { route: "/ai-accuracy-disclaimer", changeFrequency: "yearly", priority: 0.3 },
  { route: "/contact-notice-procedure", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();

  return sitemapEntries.map(({ route, changeFrequency, priority }) => ({
    url: route === "/" ? siteUrl : `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
