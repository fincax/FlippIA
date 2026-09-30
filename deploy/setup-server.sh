#!/usr/bin/env bash
# One-time preparation of an Ubuntu 24.04 server (1 vCPU / 2 GB RAM / 30 GB) for FlippIA.
# Run as root:  DOMAIN=flippia.es bash deploy/setup-server.sh https://github.com/fincax/FlippIA.git
# APP_DIR (default /opt/flippia) may point at an existing checkout, e.g. /opt/flippia/app.
# Idempotent: safe to run again.
set -euo pipefail

REPO_URL="${1:-}"
APP_DIR="${APP_DIR:-/opt/flippia}"
SWAP_GB="${SWAP_GB:-4}"

if [[ $EUID -ne 0 ]]; then echo "Ejecuta como root (sudo -i)." >&2; exit 1; fi
if [[ -z "$REPO_URL" ]]; then echo "Uso: bash deploy/setup-server.sh <url del repositorio git>" >&2; exit 1; fi

echo "▸ Paquetes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q ca-certificates curl git gnupg ufw fail2ban unattended-upgrades

echo "▸ Docker (repositorio oficial)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "▸ Swap de ${SWAP_GB} GB (la compilación de Next.js no cabe en 2 GB de RAM)"
if ! swapon --show | grep -q '^/swapfile'; then
  fallocate -l "${SWAP_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "▸ Cortafuegos: solo SSH, HTTP y HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban

echo "▸ Código en ${APP_DIR}"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "▸ Entorno"
if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/deploy/.env.production.example" "$APP_DIR/.env"
  IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
  SSLIP="${DOMAIN:-${IP//./-}.sslip.io}"
  APP_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  PG_PASS="$(openssl rand -hex 24)"
  CRON="$(openssl rand -hex 24)"
  sed -i \
    -e "s|^DOMAIN=.*|DOMAIN=${SSLIP}|" \
    -e "s|^APP_URL=.*|APP_URL=https://${SSLIP}|" \
    -e "s|^APP_SECRET=.*|APP_SECRET=${APP_SECRET}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" \
    -e "s|^CRON_SECRET=.*|CRON_SECRET=${CRON}|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://flippia:${PG_PASS}@db:5432/flippia|" \
    "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "   .env creado con secretos generados; dominio ${SSLIP} (cámbialo en .env si no es el definitivo)."
else
  echo "   .env ya existe: no se toca."
fi

echo
echo "Listo. Siguiente paso:"
echo "  cd ${APP_DIR} && bash deploy/deploy.sh"
echo "Revisa antes ${APP_DIR}/.env (DOMAIN, credenciales de Idealista, ANTHROPIC_API_KEY)."
