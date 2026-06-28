// Server-action return shape. Expected failures (auth, rate limit, bad input)
// return this discriminated result instead of throwing; only exceptional faults
// throw. `code` is machine-readable, `message` is safe to show.

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      fieldErrors?: Record<string, string>;
    };

// Common codes; open by design (`code` stays a string).
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
