import { getDb, getSitemapEntries } from "@fromtheloop/db";
import type { MetadataRoute } from "next";
import { routes } from "@/lib/routes";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();
  const { companies, roles, levels, topics, topicCompanies } =
    await getSitemapEntries(db);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl(routes.home), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl(routes.reports), changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl(routes.companies), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl(routes.topics), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl(routes.about), changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl(routes.faq), changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl(routes.privacy), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl(routes.terms), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl(routes.takedown), changeFrequency: "yearly", priority: 0.2 },
  ];

  const companyEntries: MetadataRoute.Sitemap = companies.map((c) => ({
    url: absoluteUrl(routes.company(c.slug)),
    lastModified: c.lastMod,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const roleEntries: MetadataRoute.Sitemap = roles.map((r) => ({
    url: absoluteUrl(routes.companyRole(r.companySlug, r.roleSlug)),
    lastModified: r.lastMod,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const levelEntries: MetadataRoute.Sitemap = levels.map((l) => ({
    url: absoluteUrl(routes.wedge(l.companySlug, l.roleSlug, l.levelSlug)),
    lastModified: l.lastMod,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const topicEntries: MetadataRoute.Sitemap = topics.map((t) => ({
    url: absoluteUrl(routes.topic(t.slug)),
    lastModified: t.lastMod,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const topicCompanyEntries: MetadataRoute.Sitemap = topicCompanies.map((tc) => ({
    url: absoluteUrl(routes.topicCompany(tc.topicSlug, tc.companySlug)),
    lastModified: tc.lastMod,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [
    ...staticEntries,
    ...companyEntries,
    ...roleEntries,
    ...levelEntries,
    ...topicEntries,
    ...topicCompanyEntries,
  ];
}
