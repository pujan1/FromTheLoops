// Domain logic surface. Reports finalization (validate + resolve + write) and
// the report→draft rehydration the edit flow uses.
export * from "./reports/submit.js";
export * from "./reports/rehydrate.js";

// Submission content scanning (contact-info/PII block list + profanity flag).
export * from "./anti-abuse/regex.js";

// New-user moderation-hold policy (initial report status).
export * from "./reports/moderation.js";

// Sparse-data fallback: which scope the wedge page renders when a cell is thin.
export * from "./aggregation/scope.js";
