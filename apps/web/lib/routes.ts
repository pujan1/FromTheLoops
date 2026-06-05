// Single source of truth for app routes. Use these instead of bare path
// strings so a path change is one edit, not a grep-and-pray.
//
// Static routes are plain strings; parameterized ones are builder functions.
// The public browse paths (company / role / wedge / report) delegate to the
// canonical builders in @fromtheloop/shared — the one URL contract the
// resolver in @fromtheloop/core matches against.

import {
  companyPath,
  companyRolePath,
  reportPath,
  wedgePath,
} from "@fromtheloop/shared";

export const routes = {
  home: "/",
  about: "/about",
  signIn: "/sign-in",
  signUp: "/sign-up",
  dashboard: "/dashboard",
  styleguide: "/styleguide",

  companies: "/companies",
  topics: "/topics",
  reports: "/reports",
  stats: "/stats",
  topic: (slug: string) => `/topics/${slug}`,
  // Canonical browse paths.
  company: (companySlug: string) => companyPath(companySlug),
  companyRole: (companySlug: string, roleSlug: string) =>
    companyRolePath(companySlug, roleSlug),
  wedge: (companySlug: string, roleSlug: string, levelSlug: string) =>
    wedgePath(companySlug, roleSlug, levelSlug),
  // A single report's public detail page (also the owner's post-submit landing
  // + edit entry when they own it).
  report: (id: string) => reportPath(id),

  submit: "/submit",
  // The basics screen, optionally resuming a draft (used by "Back to basics"
  // and by the edit flow, which rehydrates a report into a draft).
  submitBasics: (draftId?: string) =>
    draftId ? `/submit?draft=${draftId}` : "/submit",
  submitRounds: (draftId?: string) =>
    draftId ? `/submit/rounds?draft=${draftId}` : "/submit/rounds",
  draft: (id: string) => `/drafts/${id}`,

  // Admin-only ops dashboards (allowlist-gated; see lib/admin.ts).
  adminHealth: "/admin/health",
} as const;
