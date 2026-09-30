#!/usr/bin/env bash
# Arma el paquete para subir al servidor: dist-servidor/lenin-auto-cars-<versión>.zip
#   deploy/empaquetar.sh [carpeta-de-salida]
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SALIDA="$(mkdir -p "${1:-$RAIZ/dist-servidor}" && cd "${1:-$RAIZ/dist-servidor}" && pwd)"
VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' "$RAIZ/backend/lenin_auto/__init__.py")"

echo "▸ Compilando la interfaz"
(cd "$RAIZ/frontend" && { [ -d node_modules ] || npm ci; } && npm run build >/dev/null)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
P="$TMP/lenin-auto-cars"
mkdir -p "$P/backend" "$P/ejemplos"
cp -r "$RAIZ/backend/lenin_auto" "$P/backend/"
cp "$RAIZ/backend/pyproject.toml" "$RAIZ/backend/README.md" "$P/backend/"
find "$P" -name __pycache__ -prune -exec rm -rf {} +
cp -r "$RAIZ/frontend/dist" "$P/web"
cp "$RAIZ/deploy/Dockerfile" "$RAIZ/deploy/docker-compose.yml" "$RAIZ/deploy/instalar.sh" \
   "$RAIZ/deploy/lenin-auto.service" "$RAIZ/deploy/nginx.conf" "$P/"
cp "$RAIZ/deploy/env.ejemplo" "$P/.env.ejemplo"
cp "$RAIZ/deploy/README.md" "$P/LEEME.md"
cp "$RAIZ/docs/ejemplos/inventario-ejemplo.csv" "$P/ejemplos/"
chmod +x "$P/instalar.sh"

ZIP="$SALIDA/lenin-auto-cars-$VERSION.zip"
rm -f "$ZIP"
(cd "$TMP" && zip -qr "$ZIP" lenin-auto-cars)
echo "▸ Paquete listo: $ZIP ($(du -h "$ZIP" | cut -f1))"
