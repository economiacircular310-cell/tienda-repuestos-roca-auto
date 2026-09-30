#!/usr/bin/env bash
# Instala o actualiza Lenin Auto Cars en un VPS Ubuntu 24.04 / Debian 12 (sin Docker).
#
#   sudo ./instalar.sh tu-dominio.com      primera vez (configura también nginx)
#   sudo ./instalar.sh                     actualizar: conserva .env, pedidos e inventario
#
# Queda instalado en /opt/lenin-auto como servicio systemd «lenin-auto», detrás de nginx.
set -euo pipefail

DOMINIO="${1:-}"
DESTINO=/opt/lenin-auto
ORIGEN="$(cd "$(dirname "$0")" && pwd)"

paso() { printf '\n\033[1;33m▸ %s\033[0m\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta con sudo: sudo ./instalar.sh ${DOMINIO}"; exit 1; }
[ -d "$ORIGEN/backend" ] && [ -d "$ORIGEN/web" ] || { echo "Ejecuta el script desde la carpeta del paquete."; exit 1; }

paso "Paquetes del sistema (Python, nginx)"
apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -y -q python3 python3-venv nginx curl
if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))'; then
    echo "Se necesita Python 3.11 o superior (Ubuntu 24.04 o Debian 12). En otro sistema usa Docker."
    exit 1
fi

paso "Usuario y carpetas"
id lenin >/dev/null 2>&1 || useradd --system --home-dir "$DESTINO" --shell /usr/sbin/nologin lenin
mkdir -p "$DESTINO/data"
rm -rf "$DESTINO/backend" "$DESTINO/web"
cp -r "$ORIGEN/backend" "$ORIGEN/web" "$DESTINO/"

paso "Entorno de Python y dependencias"
[ -x "$DESTINO/venv/bin/python" ] || python3 -m venv "$DESTINO/venv"
"$DESTINO/venv/bin/pip" install -q --upgrade pip
"$DESTINO/venv/bin/pip" install -q "$DESTINO/backend"

paso "Configuración (.env)"
if [ ! -f "$DESTINO/.env" ]; then
    SECRETO="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
    sed "s|^LENIN_SECRET=.*|LENIN_SECRET=${SECRETO}|" "$ORIGEN/.env.ejemplo" > "$DESTINO/.env"
    echo "Creado $DESTINO/.env con una clave nueva. Revisa correo, WhatsApp y moneda."
else
    echo "Se conserva $DESTINO/.env"
fi
chown root:root "$DESTINO/.env"
chmod 600 "$DESTINO/.env"
chown -R lenin:lenin "$DESTINO/data"

paso "Comando «lenin-auto» (pedidos, importar inventario)"
cat > /usr/local/bin/lenin-auto <<'SCRIPT'
#!/bin/sh
# Línea de comandos de la tienda con la configuración del servidor. Uso: sudo lenin-auto --help
set -a; . /opt/lenin-auto/.env; set +a
LENIN_DB="${LENIN_DB:-/opt/lenin-auto/data/pedidos.sqlite3}"; export LENIN_DB
cd /opt/lenin-auto/data
exec runuser -u lenin -- /opt/lenin-auto/venv/bin/python -m lenin_auto "$@"
SCRIPT
chmod 755 /usr/local/bin/lenin-auto

paso "Servicio systemd"
install -m 644 "$ORIGEN/lenin-auto.service" /etc/systemd/system/lenin-auto.service
systemctl daemon-reload
systemctl enable lenin-auto >/dev/null
systemctl restart lenin-auto
for _ in $(seq 1 60); do
    curl -sf http://127.0.0.1:8000/api/health >/dev/null && break
    sleep 1
done
curl -sf http://127.0.0.1:8000/api/health || { echo "El servicio no respondió. Revisa: journalctl -u lenin-auto -n 50"; exit 1; }
echo

if [ -n "$DOMINIO" ]; then
    paso "nginx para $DOMINIO"
    sed "s/TU_DOMINIO/${DOMINIO}/g" "$ORIGEN/nginx.conf" > /etc/nginx/sites-available/lenin-auto
    ln -sf /etc/nginx/sites-available/lenin-auto /etc/nginx/sites-enabled/lenin-auto
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl reload nginx
fi

paso "Listo"
if [ -n "$DOMINIO" ]; then
    echo "La tienda responde en http://${DOMINIO}"
    echo "Activa HTTPS:  sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d ${DOMINIO} -d www.${DOMINIO}"
else
    echo "Servicio actualizado y en marcha."
fi
echo "Estado: systemctl status lenin-auto   ·   Registro: journalctl -u lenin-auto -f"
