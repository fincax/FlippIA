#!/usr/bin/env bash
# Installs the scheduled jobs on the host crontab:
#   hourly  POST /api/cron/watches  (Smart Watcher, session and rate-limit purge)
#   daily   POST /api/cron/radar    (Radar sources: Idealista API, feeds)
# Run from the repository directory after deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
SECRET="$(grep -E '^CRON_SECRET=' .env | cut -d= -f2-)"
if [[ -z "$DOMAIN" || -z "$SECRET" ]]; then echo "DOMAIN o CRON_SECRET vacíos en .env" >&2; exit 1; fi
TAG="# flippia-cron"
( crontab -l 2>/dev/null | grep -v "$TAG" || true
  echo "17 * * * * curl -fsS -m 280 -X POST -H 'Authorization: Bearer ${SECRET}' https://${DOMAIN}/api/cron/watches >/dev/null 2>&1 $TAG"
  echo "41 6 * * * curl -fsS -m 280 -X POST -H 'Authorization: Bearer ${SECRET}' https://${DOMAIN}/api/cron/radar >/dev/null 2>&1 $TAG"
) | crontab -
echo "Cron instalado:"; crontab -l | grep "$TAG"
