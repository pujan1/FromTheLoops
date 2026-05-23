# @fromtheloop/shared

The leaf package. No deps on any other workspace package. Anything imported by two or more packages lands here.

## What goes here

- Zod schemas for cross-boundary payloads (e.g. submission form, queue job shapes)
- Enum constants: `round_type`, `outcome`, `source`, trust tiers, mod-action types
- Pure helpers (slugify, level normalization, etc.)

## What does NOT go here

- Anything that imports a DB client, a Typesense client, or React
- Domain logic (use [@fromtheloop/core](../core/))
