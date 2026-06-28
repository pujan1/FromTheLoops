// Email job contract between the web app (renders content) and the worker
// (dispatches via Resend). Payload carries fully-rendered html/text so the
// worker never imports templates from apps/web.

export const NOTIFICATIONS_QUEUE = "notifications";
export const EMAIL_JOB = "email";

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}
