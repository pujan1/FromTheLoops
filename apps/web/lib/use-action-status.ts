"use client";

// Drives a server action through its lifecycle so components branch on a single
// status instead of juggling try/catch + boolean flags. The action returns an
// ActionResult, so the unhappy path (auth, rate limit, validation) is data the
// hook reads directly; a thrown error (an exceptional fault) is normalized into
// the same error shape under code "unexpected".
//
// This is the small hook the audit calls for before reaching for TanStack
// Query — it owns exactly one in-flight action's state, nothing global.

import { ACTION_ERROR, type ActionResult } from "@fromtheloop/shared";
import { useCallback, useRef, useState } from "react";
import type { NoticeTone } from "@/components/ui";

export type ActionStatus = "idle" | "pending" | "success" | "error";

export interface ActionFailure {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export interface UseActionStatus<TArgs extends unknown[], T> {
  status: ActionStatus;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: T | undefined;
  error: ActionFailure | undefined;
  fieldErrors: Record<string, string> | undefined;
  // Invoke the action. Resolves to the full ActionResult so a caller that needs
  // the value inline (e.g. to route on success) can read it without a re-render.
  run: (...args: TArgs) => Promise<ActionResult<T>>;
  reset: () => void;
}

const UNEXPECTED: ActionFailure = {
  code: "unexpected",
  message: "Something went wrong. Please try again.",
};

export function useActionStatus<TArgs extends unknown[], T>(
  action: (...args: TArgs) => Promise<ActionResult<T>>,
): UseActionStatus<TArgs, T> {
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ActionFailure | undefined>(undefined);

  // Guard against a stale (superseded) call writing state after a newer one —
  // only the most recent run is allowed to commit its result.
  const runId = useRef(0);

  const run = useCallback(
    async (...args: TArgs): Promise<ActionResult<T>> => {
      const id = ++runId.current;
      setStatus("pending");
      setError(undefined);

      let result: ActionResult<T>;
      try {
        result = await action(...args);
      } catch {
        if (id === runId.current) {
          setStatus("error");
          setError(UNEXPECTED);
        }
        return { ok: false, ...UNEXPECTED };
      }

      if (id !== runId.current) return result;

      if (result.ok) {
        setData(result.data);
        setStatus("success");
      } else {
        setError({
          code: result.code,
          message: result.message,
          fieldErrors: result.fieldErrors,
        });
        setStatus("error");
      }
      return result;
    },
    [action],
  );

  const reset = useCallback(() => {
    runId.current++;
    setStatus("idle");
    setData(undefined);
    setError(undefined);
  }, []);

  return {
    status,
    isPending: status === "pending",
    isSuccess: status === "success",
    isError: status === "error",
    data,
    error,
    fieldErrors: error?.fieldErrors,
    run,
    reset,
  };
}

// Maps an action failure to the notice tone it should render with. A rate limit
// is a "slow down", not a fault — warning, not danger; everything else
// (unauthenticated, invalid, unexpected) is a danger the user must resolve.
export function noticeToneForError(
  error: ActionFailure | undefined,
): NoticeTone {
  return error?.code === ACTION_ERROR.rateLimited ? "warning" : "danger";
}
