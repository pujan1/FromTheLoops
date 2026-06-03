// Standard return shape for server actions.
//
// Actions don't throw for *expected* failure modes — auth, rate limits, bad
// input. They return a discriminated result the caller branches on without a
// try/catch, so every flow (submit, moderation, helpful flags, deletes) renders
// feedback the same way. Throwing is reserved for genuinely exceptional faults
// (a DB outage), which still surface as a generic failure at the call site.
//
// `code` is a stable, machine-readable discriminator (see ACTION_ERROR);
// `message` is human-readable and safe to show. `fieldErrors` maps a form field
// to its error so inputs can highlight inline.

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      fieldErrors?: Record<string, string>;
    };

// Known error codes. Open by design (`code` stays a string) so new surfaces can
// add their own, but the common ones live here so call sites branch on a
// constant instead of a typo-prone literal.
export const ACTION_ERROR = {
  unauthenticated: "unauthenticated",
  rateLimited: "rate_limited",
  invalid: "invalid",
} as const;

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError(
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, code, message, fieldErrors };
}
