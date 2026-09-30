# Despliegue en un servidor propio (clouding.io, Ubuntu 24.04, 1 vCPU / 2 GB / 30 GB)

Stack: Docker Compose con PostGIS, la aplicación y Caddy (HTTPS automático). Todo está en `docker-compose.prod.yml`, `Dockerfile` y `deploy/`.

## 1. Preparar el servidor (una vez, como root)

```bash
ssh root@27.0.174.32
git clone https://github.com/fincax/FlippIA.git /opt/flippia   # el repo es privado: usa un token o una deploy key
bash /opt/flippia/deploy/setup-server.sh https://github.com/fincax/FlippIA.git
```

El script instala Docker desde el repositorio oficial, crea 4 GB de swap (la compilación de Next.js no cabe en 2 GB de RAM), abre solo SSH, 80 y 443 en `ufw`, activa `fail2ban` y genera `/opt/flippia/.env` con secretos aleatorios (`APP_SECRET`, `POSTGRES_PASSWORD`, `CRON_SECRET`) a partir de `deploy/.env.production.example`.

## 2. Dominio y TLS

Caddy pide el certificado a Let's Encrypt para `DOMAIN`. Dos opciones:

- **Sin dominio propio**: el script deja `DOMAIN=27-0-174-32.sslip.io`, un nombre público que resuelve a la IP del servidor y obtiene certificado válido. Funciona desde el primer minuto.
- **Con dominio propio**: crea un registro A `app.tudominio.com → 27.0.174.32` y pon `DOMAIN` y `APP_URL` en `.env`.

## 3. Completar `.env`

Revisa `/opt/flippia/.env`:

- `IDEALISTA_API_KEY` / `IDEALISTA_API_SECRET` (comparables y Radar reales), `ANTHROPIC_API_KEY` (narrativa; opcional).
- `RADAR_FEEDS` con los feeds Kyero/JSON de las agencias, o `[]`.
- `DEMO_MODE=false`, o `true` con `DEMO_USER_PASSWORD` privada si quieres la organización demo.

## 4. Desplegar

```bash
cd /opt/flippia && bash deploy/deploy.sh
```

Compila la imagen (la primera vez, varios minutos en 1 vCPU), arranca PostGIS, aplica las migraciones y levanta la aplicación y Caddy. Termina mostrando la URL. Para actualizar tras un `git push` a `main`, el mismo comando.

Tareas programadas (Smart Watcher cada hora, sincronización del Radar cada día):

```bash
bash deploy/install-cron.sh
```

## 5. Comprobar

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml run --rm app pnpm sources:check "Calle Pureza 45, Sevilla"
docker compose -f docker-compose.prod.yml run --rm app pnpm market:check "37.3826,-5.9963"
```

Desde el navegador: `https://<DOMAIN>/` responde, `/app` redirige a `/login`. Con `DEMO_MODE=true`, `pnpm db:seed` dentro del contenedor crea la organización demo (`SEED_DEMO=true DEMO_USER_PASSWORD=<privada>`).

## 6. Operación

- **Copias de seguridad**: `docker exec flippia-db pg_dump -U flippia flippia | gzip > /opt/backups/flippia-$(date +%F).sql.gz` en un cron diario; guarda una copia fuera del servidor.
- **Memoria**: `app` limitado a 1 GB y `db` a 512 MB; con 2 GB de RAM y 4 GB de swap el servidor aguanta análisis concurrentes moderados (el límite de 3 análisis simultáneos por organización ya está en la aplicación).
- **Logs**: JSON por línea (`docker compose logs app`). Rotación por Docker (`/etc/docker/daemon.json` con `log-opts` si crecen).
- **Actualizaciones del sistema**: `unattended-upgrades` queda activado; reinicia cuando `/var/run/reboot-required` exista.
- **Red**: la aplicación necesita salida HTTPS a `ovc.catastro.meh.es`, `cdu.urbanismosevilla.org`, `api.idealista.com` y `api.anthropic.com`.

Límites conocidos y lista de comprobación previa a clientes: `docs/PRODUCTION.md`.
