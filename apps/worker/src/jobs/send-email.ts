// Transactional email dispatch — the worker side of the notifications queue.
//
// The web app renders an email (subject + html, see apps/web/emails) and
// enqueues an EmailJobData; this job is the only place that talks to Resend.
// Keeping dispatch here means the web request returns immediately and isn't
// coupled to Resend's availability, and a transient send failure is retried by
// BullMQ rather than failing the user's submission.
//
// Resend is lazily constructed so the worker boots (and the cron runs) even
// when RESEND_API_KEY is unset — in that case email send is a logged no-op
// rather than a crash, matching the "blank disables" convention used for
// Sentry/Typesense.

import type { EmailJobData } from "@fromtheloop/shared";
import type { Job } from "bullmq";
import { Resend } from "resend";

let resend: Resend | null = null;
let warnedNoKey = false;

function getResend(): Resend | null {
  if (resend) return resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resend = new Resend(key);
  return resend;
}

export async function processSendEmail(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, html, text } = job.data;

  const client = getResend();
  if (!client) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn(
        "[send-email] RESEND_API_KEY unset — skipping send (no-op).",
      );
    }
    console.log(`[send-email] job ${job.id}: skipped (to=${to}, subject="${subject}")`);
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "no-reply@fromtheloop.com";
  const { error } = await client.emails.send({ from, to, subject, html, text });
  if (error) {
    // Throw so BullMQ records the failure and applies its retry/backoff.
    throw new Error(`Resend send failed: ${error.name}: ${error.message}`);
  }
  console.log(`[send-email] job ${job.id}: sent to ${to}`);
}
