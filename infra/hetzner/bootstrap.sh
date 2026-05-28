#!/usr/bin/env bash
# Run as root on the Hetzner box, from /opt/fromtheloop.
# Idempotent — re-running upgrades images and reconciles the systemd unit.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

if [ ! -f .env.prod ]; then
  echo "ERROR: .env.prod missing. Copy from .env.prod.example and fill in values." >&2
  exit 1
fi

# --ignore-pull-failures: the worker image is built locally, has no remote registry
docker compose -f docker-compose.prod.yml --env-file .env.prod pull --ignore-pull-failures

if ! cmp -s systemd/fromtheloop.service /etc/systemd/system/fromtheloop.service 2>/dev/null; then
  cp systemd/fromtheloop.service /etc/systemd/system/fromtheloop.service
  systemctl daemon-reload
  systemctl enable fromtheloop.service
fi

systemctl restart fromtheloop.service

sleep 3
docker ps --format 'table {{.Names}}\t{{.Status}}'
