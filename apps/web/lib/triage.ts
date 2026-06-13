// ADR-0010 shared constant. Lives in a plain (non-"use client") module so the
// SSR browse pages can read its value to size their ordered-ID query — a value
// exported from the client triage component would be a client reference the
// server can't read. The triage pane/sheet itself doesn't need it.

// Cap on the ordered-ID list shipped to the triage pane/sheet. KB-scale even at
// the ceiling; past it the "next" stops gracefully (page-bounded fallback).
export const TRIAGE_ID_CAP = 1500;
