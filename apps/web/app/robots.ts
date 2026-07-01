import type { MetadataRoute } from "next";
import { absoluteUrl, siteOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/dashboard", "/settings", "/drafts", "/search", "/api"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteOrigin,
  };
}
