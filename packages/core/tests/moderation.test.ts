// New-user hold policy — pure unit tests, no DB.

import { describe, expect, it } from "vitest";
import {
  decideInitialReportStatus,
  NEW_USER_HOLD_MS,
  TRUSTED_VERIFIED_THRESHOLD,
} from "../src/index.js";

describe("decideInitialReportStatus", () => {
  it("holds a brand-new account (young + no verified submissions)", () => {
    expect(
      decideInitialReportStatus({ accountAgeMs: 0, verifiedReportCount: 0 }),
    ).toBe("pending_moderation");
  });

  it("holds an old account that lacks verified submissions", () => {
    expect(
      decideInitialReportStatus({
        accountAgeMs: NEW_USER_HOLD_MS * 10,
        verifiedReportCount: TRUSTED_VERIFIED_THRESHOLD - 1,
      }),
    ).toBe("pending_moderation");
  });

  it("holds a verified-but-too-young account (24h floor)", () => {
    expect(
      decideInitialReportStatus({
        accountAgeMs: NEW_USER_HOLD_MS - 1,
        verifiedReportCount: TRUSTED_VERIFIED_THRESHOLD + 5,
      }),
    ).toBe("pending_moderation");
  });

  it("publishes once past 24h AND at the verified threshold", () => {
    expect(
      decideInitialReportStatus({
        accountAgeMs: NEW_USER_HOLD_MS,
        verifiedReportCount: TRUSTED_VERIFIED_THRESHOLD,
      }),
    ).toBe("active");
  });
});
