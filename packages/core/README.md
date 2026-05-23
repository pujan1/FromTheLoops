# @fromtheloop/core

Domain logic that isn't a query, isn't HTTP, and isn't a view. Lives here so both [@fromtheloop/web](../../apps/web/) and [@fromtheloop/worker](../../apps/worker/) can call it.

## What goes here

- Report lifecycle (draft → submit → moderate → publish → soft-delete)
- Karma scoring rules
- Trust-tier computation + aggregation weights ([PLAN.md §Aggregation weighting](../../PLAN.md#aggregation-weighting))
- Moderation primitives (auto-rules, mod-action emission)
- Taxonomy operations (company / role / tag suggest + promote)

## What does NOT go here

- DB queries → [@fromtheloop/db](../db/)
- Search indexing or query → [@fromtheloop/search](../search/)
- Shared types/validators → [@fromtheloop/shared](../shared/)
- HTTP shapes → in the route handler that owns the endpoint
