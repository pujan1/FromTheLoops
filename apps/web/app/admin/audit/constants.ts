// Display vocabulary for the audit feed: each moderation action's visual tone
// (reusing the queue's badge palette) and its past-tense verb. Keyed on
// ModActionType so adding an action is a compile error here until it's labelled.

import type { ModActionType } from "@fromtheloop/db";

export const ACTION_TONE: Record<ModActionType, "good" | "warn" | "danger" | "neutral"> = {
  approve: "good",
  merge: "good",
  reject: "warn",
  hide: "warn",
  delete: "danger",
  ban: "danger",
  edit_taxonomy: "neutral",
  restore: "good",
};

export const ACTION_LABEL: Record<ModActionType, string> = {
  approve: "approved",
  merge: "merged",
  reject: "rejected",
  hide: "hid",
  delete: "deleted",
  ban: "banned",
  edit_taxonomy: "edited",
  restore: "restored",
};
