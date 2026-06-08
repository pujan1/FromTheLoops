#!/usr/bin/env bash
# Seed the PRODUCTION database (Neon) in one go: migrate schema → seed curated
# taxonomy → (optionally) seed dummy reports.
#
# The Vercel web app is stateless; all data lives in Neon. This script targets
# Neon, not Vercel. It's the scripted form of Part C of docs/runbooks/worker-
# deploy.md plus the seed steps — see that runbook for the manual version.
#
# Safety:
#   - Pulls the prod DATABASE_URL from the box over SSH; never prints it.
#   - Refuses to run without confirmation (override with --yes / -y).
#   - All three steps are idempotent (migrate skips applied files, seeds upsert
#     / clear-then-reinsert), so a re-run is safe.
#
# Usage:
#   scripts/seed-prod.sh                 # migrate + curated taxonomy
#   scripts/seed-prod.sh --with-reports  # ...also ~150 dummy seed reports
#   scripts/seed-prod.sh --yes           # skip the confirmation prompt
#
# Env overrides:
#   BOX_HOST=root@box.pujan.tech   the SSH target holding /opt/fromtheloop/.env.prod
#   DATABASE_URL=...               skip the SSH fetch and use this URL directly

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")/.."

BOX_HOST="${BOX_HOST:-root@box.pujan.tech}"
WITH_REPORTS=0
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --with-reports) WITH_REPORTS=1 ;;
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help)
      # Print the leading comment block (lines 2.. up to the first non-# line).
      awk 'NR>1 { if ($0 ~ /^#/) { sub(/^# ?/, ""); print } else exit }' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

# Resolve the prod connection string. Prefer an already-exported DATABASE_URL
# (lets CI / a direct non-pooled URL be injected); otherwise pull it from the
# box's .env.prod. We capture it into a variable and export it for the child
# pnpm processes — it is never echoed.
if [ -n "${DATABASE_URL:-}" ]; then
  echo "→ Using DATABASE_URL from the environment."
else
  echo "→ Fetching prod DATABASE_URL from ${BOX_HOST}:/opt/fromtheloop/.env.prod ..."
  DATABASE_URL="$(ssh "$BOX_HOST" 'grep -h DATABASE_URL /opt/fromtheloop/.env.prod | cut -d= -f2-')"
  if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: could not read DATABASE_URL from the box. Is SSH working and .env.prod present?" >&2
    exit 1
  fi
fi
export DATABASE_URL

# Show enough of the host to confirm "yes, this is prod" without leaking creds.
# Strips credentials and path, leaving scheme + host (e.g. postgresql://...@ep-x.neon.tech).
SAFE_TARGET="$(printf '%s' "$DATABASE_URL" | sed -E 's#(://)[^@]*@#\1***@#; s#([^/])/[^?]*.*#\1#')"

echo
echo "About to write to PRODUCTION:"
echo "    target : ${SAFE_TARGET}"
echo "    steps  : 1) migrate schema  2) seed curated taxonomy$([ "$WITH_REPORTS" = 1 ] && echo "  3) seed ~150 DUMMY reports")"
echo

if [ "$ASSUME_YES" != 1 ]; then
  read -r -p "Proceed? Type 'yes' to continue: " reply
  if [ "$reply" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo
echo "═══ Step 1/$([ "$WITH_REPORTS" = 1 ] && echo 3 || echo 2): migrate schema ═══"
pnpm --filter @fromtheloop/db migrate

echo
echo "═══ Step 2/$([ "$WITH_REPORTS" = 1 ] && echo 3 || echo 2): seed curated taxonomy ═══"
pnpm db:seed

if [ "$WITH_REPORTS" = 1 ]; then
  echo
  echo "═══ Step 3/3: seed dummy reports + refresh aggregates ═══"
  pnpm db:seed:reports
  echo
  echo "NOTE: search (Typesense) lives on the box, not Neon, so the new reports"
  echo "      won't appear in /search until you backfill it ON THE BOX:"
  echo "        ssh ${BOX_HOST}"
  echo "        cd /opt/fromtheloop/build && pnpm backfill:typesense"
fi

echo
echo "✓ Done."
