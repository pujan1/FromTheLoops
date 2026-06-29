// send-email is the only place that talks to Resend. Three branches matter:
// no API key → logged no-op (the worker must boot + run crons without email
// configured), a Resend error → throw so BullMQ retries, and a clean send →
// resolve. We mock the Resend SDK and toggle RESEND_API_KEY per test.
//
// NOTE: processSendEmail memoizes the Resend client in a module-level singleton
// (built lazily on first keyed call), so tests are ordered to construct it once
// the key is set and never need to reset it.

import type { EmailJobData } from "@fromtheloop/shared";
import type { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factory (itself hoisted above imports) can close over
// sendMock. The Resend impl is a regular function, not an arrow — `new Resend()`
// must be constructable.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: vi.fn(function MockResend() {
    return { emails: { send: sendMock } };
  }),
}));

import { processSendEmail } from "./send-email.js";

function emailJob(over: Partial<EmailJobData> = {}): Job<EmailJobData> {
  return {
    id: "job-1",
    data: { to: "a@b.com", subject: "Hi", html: "<p>hi</p>", ...over },
  } as Job<EmailJobData>;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("processSendEmail", () => {
  // "Blank key disables" — matches the Sentry/Typesense convention. Must not
  // throw, must not attempt a send.
  it("is a no-op when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(processSendEmail(emailJob())).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends with the configured from address and the job payload", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "hello@fromtheloop.com";
    sendMock.mockResolvedValue({ error: null });

    await processSendEmail(emailJob({ to: "user@x.com", subject: "Welcome" }));

    expect(sendMock).toHaveBeenCalledWith({
      from: "hello@fromtheloop.com",
      to: "user@x.com",
      subject: "Welcome",
      html: "<p>hi</p>",
      text: undefined,
    });
  });

  it("falls back to the default from address when none is set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.RESEND_FROM_EMAIL;
    sendMock.mockResolvedValue({ error: null });

    await processSendEmail(emailJob());

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "no-reply@fromtheloop.com" }),
    );
  });

  // A Resend-reported error must throw so BullMQ records the failure and applies
  // its retry/backoff rather than silently dropping the email.
  it("throws when Resend returns an error", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMock.mockResolvedValue({
      error: { name: "rate_limited", message: "slow down" },
    });
    await expect(processSendEmail(emailJob())).rejects.toThrow(
      /Resend send failed: rate_limited: slow down/,
    );
  });
});
