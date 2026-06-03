// Single source of truth for app routes. Use these instead of bare path
// strings so a path change is one edit, not a grep-and-pray.
//
// Static routes are plain strings; parameterized ones are builder functions.

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
  // A single submitted report's owner view (post-submit landing + edit entry).
  report: (id: string) => `/reports/${id}`,

  submit: "/submit",
  // The basics screen, optionally resuming a draft (used by "Back to basics"
  // and by the edit flow, which rehydrates a report into a draft).
  submitBasics: (draftId?: string) =>
    draftId ? `/submit?draft=${draftId}` : "/submit",
  submitRounds: (draftId?: string) =>
    draftId ? `/submit/rounds?draft=${draftId}` : "/submit/rounds",
  draft: (id: string) => `/drafts/${id}`,
} as const;
