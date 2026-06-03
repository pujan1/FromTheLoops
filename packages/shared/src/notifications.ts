// Transactional-email job contract — the boundary between the web app (which
// owns email *content*: it renders the templates) and the worker (which owns
// *dispatch*: it talks to Resend). Both sides import this so the queue name and
// payload shape can't drift.
//
// The payload carries fully-rendered html/text, not a template id + data. That
// keeps email templates (React/TSX, with the app's copy + i18n) in the web app
// and out of the worker — the worker never imports from apps/web.

export const NOTIFICATIONS_QUEUE = "notifications";

// Job name within the queue. One kind today (a rendered email); room for more.
export const EMAIL_JOB = "email";

export interface EmailJobData {
  to: string;
  subject: string;
  // Rendered HTML body (email-client-safe; inline styles).
  html: string;
  // Optional plain-text fallback for clients that don't render HTML.
  text?: string;
}
