import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const routes = [
    "/",
    "/features",
    "/pricing",
    "/about",
    "/demo-signup",
    "/contact",
    "/support",
    "/security",
    "/terms",
    "/privacy",
    "/cookie-policy",
    "/acceptable-use",
    "/data-deletion",
    "/billing-refund-policy",
    "/copyright-policy",
    "/youth-student-data-policy",
    "/community-standards",
    "/ai-accuracy-disclaimer",
    "/contact-notice-procedure",
  ] as const;

  return routes.map((route) => ({
    url: route === "/" ? siteUrl : `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
