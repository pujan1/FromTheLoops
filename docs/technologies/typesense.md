# Typesense

## Role In FromTheLoop

Typesense is the planned faceted search index for reports, companies, roles, topics, outcomes, and trust tiers. PostgreSQL remains the source of truth; Typesense is optimized for search and filtering.

## Where It Lives

- Local compose: `docker-compose.yml`
- Production compose: `infra/hetzner/docker-compose.prod.yml`
- Search package placeholder: `packages/search/src/index.ts`
- Package manifest: `packages/search/package.json`

## Workflow Integration

Local Typesense runs on port 8108:

```yaml
typesense:
  image: typesense/typesense:27.1
  command:
    - --data-dir=/data
    - --api-key=local-dev-key
    - --listen-port=8108
    - --enable-cors
  ports:
    - "8108:8108"
```

Production Typesense is internal-only on the Hetzner compose network. Sprint 3 will wire index schema, indexing jobs, and reconciliation.

## Tradeoffs And Gotchas

- Typesense provides facets and typo-tolerant search without Algolia pricing.
- Self-hosting avoids record-count costs but adds ops responsibility.
- Typesense can drift from Postgres. A reconciliation job is needed once indexing is live.
- Current healthcheck can intermittently report unhealthy and should be investigated before search work depends on it.
- Falkenstein hosting means US users may see extra search latency until the box moves or search is fronted by a managed service.

## Common Workflow

1. Keep source-of-truth writes in Postgres.
2. Emit or enqueue indexing jobs when reports/taxonomy changes.
3. Upsert search documents into Typesense from the worker.
4. Add reconciliation checks that compare Typesense documents to Postgres rows.
