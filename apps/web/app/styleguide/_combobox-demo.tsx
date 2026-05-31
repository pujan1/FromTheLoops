"use client";

// Styleguide-only demo harness for <Combobox>. Uses an in-memory list +
// local fuzzy filter so the component is visible without auth or the live
// /api/taxonomy lookups (the real submission form passes a fetch-backed
// `search`). Not shipped outside the styleguide route.

import { useState } from "react";
import { Body, Caption, Combobox, type ComboboxOption } from "@/components/ui";

interface DemoCompany {
  id: string;
  label: string;
  hint: string;
  aliases: string[];
}

const COMPANIES: DemoCompany[] = [
  { id: "stripe", label: "Stripe", hint: "stripe.com", aliases: [] },
  { id: "google", label: "Google", hint: "google.com", aliases: ["Alphabet"] },
  { id: "meta", label: "Meta", hint: "meta.com", aliases: ["Facebook"] },
  { id: "amazon", label: "Amazon", hint: "amazon.com", aliases: ["AWS"] },
  { id: "netflix", label: "Netflix", hint: "netflix.com", aliases: [] },
  { id: "airbnb", label: "Airbnb", hint: "airbnb.com", aliases: [] },
  { id: "openai", label: "OpenAI", hint: "openai.com", aliases: [] },
];

const ROLES: ComboboxOption[] = [
  { id: "swe", label: "Software Engineer" },
  { id: "frontend", label: "Frontend Engineer" },
  { id: "ml", label: "Machine Learning Engineer" },
  { id: "data-engineer", label: "Data Engineer" },
  { id: "sre", label: "Site Reliability Engineer" },
  { id: "product-manager", label: "Product Manager" },
];

// Tiny local matcher standing in for the server's pg_trgm lookup: matches
// label or alias as a substring, ranked by where the match lands.
function localSearch<T extends { label: string; aliases?: string[] }>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return rows
    .map((r) => {
      const haystacks = [r.label, ...(r.aliases ?? [])].map((s) =>
        s.toLowerCase(),
      );
      const best = Math.min(
        ...haystacks.map((h) => {
          const idx = h.indexOf(q);
          return idx === -1 ? Infinity : idx;
        }),
      );
      return { r, best };
    })
    .filter((x) => x.best !== Infinity)
    .sort((a, b) => a.best - b.best || a.r.label.localeCompare(b.r.label))
    .map((x) => x.r);
}

// Simulate a little network latency so the spinner + async path are visible.
function withDelay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function ComboboxDemo() {
  const [company, setCompany] = useState<ComboboxOption | null>(null);
  const [role, setRole] = useState<ComboboxOption | null>(null);
  const [suggested, setSuggested] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: "var(--space-6)", maxWidth: 460 }}>
      <div>
        <Combobox
          label="Company"
          placeholder="Search companies… (try “stri” or “facebook”)"
          value={company}
          onChange={(o) => {
            setCompany(o);
            if (o) setSuggested(null);
          }}
          search={(q) =>
            withDelay(
              localSearch(COMPANIES, q).map(({ id, label, hint }) => ({
                id,
                label,
                hint,
              })),
            )
          }
          onSuggestNew={(q) => {
            setSuggested(q);
            setCompany({ id: `pending:${q}`, label: q, hint: "pending" });
          }}
          required
        />
        <Caption style={{ marginTop: "var(--space-2)" }}>
          selected: {company ? `${company.label} (${company.id})` : "—"}
          {suggested && ` · suggested new: “${suggested}”`}
        </Caption>
      </div>

      <div>
        <Combobox
          label="Canonical role"
          placeholder="Search roles… (no “suggest new”)"
          value={role}
          onChange={setRole}
          search={(q) => withDelay(localSearch(ROLES, q))}
          emptyMessage="No matching role — pick the closest canonical title."
          required
        />
        <Caption style={{ marginTop: "var(--space-2)" }}>
          selected: {role ? `${role.label} (${role.id})` : "—"}
        </Caption>
      </div>

      <Body size="small" tone="muted">
        The company field offers “Suggest new → pending”; the role field is a
        closed canonical set and never does.
      </Body>
    </div>
  );
}
