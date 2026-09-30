#!/usr/bin/env bash
# Build and (re)start FlippIA on the server. Run from the repository directory:
#   bash deploy/deploy.sh            # pull, build, migrate, start
#   bash deploy/deploy.sh --no-pull  # rebuild what is checked out
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.prod.yml)

if [[ ! -f .env ]]; then echo "Falta .env (copia deploy/.env.production.example)." >&2; exit 1; fi
if [[ "${1:-}" != "--no-pull" ]]; then
  echo "▸ git pull"
  git pull --ff-only
fi

echo "▸ Imagen de la aplicación (la primera compilación tarda varios minutos en 1 vCPU)"
"${COMPOSE[@]}" build app

echo "▸ Comprobación del entorno (.env)"
if ! "${COMPOSE[@]}" run --rm --no-deps app pnpm --silent env:check; then
  echo "Corrige .env y vuelve a ejecutar deploy.sh --no-pull." >&2
  exit 1
fi

echo "▸ Base de datos (espera a que PostGIS acepte conexiones)"
"${COMPOSE[@]}" up -d --wait db
"${COMPOSE[@]}" run --rm app pnpm db:migrate

echo "▸ Aplicación y proxy HTTPS"
"${COMPOSE[@]}" up -d app caddy

echo "▸ Comprobación"
DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "   aplicación respondiendo (intento $i)"
    break
  fi
  sleep 5
done
"${COMPOSE[@]}" ps
echo
echo "URL: https://${DOMAIN}"
echo "Logs: docker compose -f docker-compose.prod.yml logs -f app"
echo "Imágenes antiguas: docker image prune -f"
