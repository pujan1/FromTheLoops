

import {
  companyPath,
  companyRolePath,
  reportPath,
  topicCompanyPath,
  topicPath,
  userPath,
  wedgePath,
} from "@fromtheloop/shared";

export const routes = {
  home: "/",
  about: "/about",
  signIn: "/sign-in",
  signUp: "/sign-up",
  dashboard: "/dashboard",
  settings: "/settings",
  settingsDelete: "/settings/delete",
  exportData: "/api/export",
  styleguide: "/styleguide",
  companies: "/companies",
  topics: "/topics",
  reports: "/reports",
  stats: "/stats",
  search: "/search",
  searchFor: (q: string) => (q ? `/search?q=${encodeURIComponent(q)}` : "/search"),
  // Canonical browse paths.
  topic: (topicSlug: string) => topicPath(topicSlug),
  topicCompany: (topicSlug: string, companySlug: string) =>
    topicCompanyPath(topicSlug, companySlug),
  company: (companySlug: string) => companyPath(companySlug),
  companyRole: (companySlug: string, roleSlug: string) =>
    companyRolePath(companySlug, roleSlug),
  wedge: (companySlug: string, roleSlug: string, levelSlug: string) =>
    wedgePath(companySlug, roleSlug, levelSlug),
  report: (id: string) => reportPath(id),
  // A contributor's public profile (their attributed reports only).
  user: (username: string) => userPath(username),

  submit: "/submit",
  submitBasics: (draftId?: string) =>
    draftId ? `/submit?draft=${draftId}` : "/submit",
  submitRounds: (draftId?: string) =>
    draftId ? `/submit/rounds?draft=${draftId}` : "/submit/rounds",
  draft: (id: string) => `/drafts/${id}`,

  // Admin-only ops dashboards (allowlist-gated; see lib/admin.ts).
  adminHealth: "/admin/health",
} as const;
