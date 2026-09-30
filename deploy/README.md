# Subir Lenin Auto Cars a tu servidor

Este paquete trae todo lo que el servidor necesita: el motor en Python (`backend/`), la
interfaz ya compilada (`web/`) y los archivos de instalación. No hace falta Node.

**Qué servidor sirve:** un VPS con Linux (DigitalOcean, Hetzner, Contabo, Vultr, AWS
Lightsail…) de 1 GB de RAM, o un servicio que ejecute Docker (Render, Railway, Fly.io).
Cada proceso usa unos 110 MB. **No sirve un hosting compartido que solo corre PHP**
(cPanel/WordPress): la tienda es una aplicación Python.

```
lenin-auto-cars/
  LEEME.md              esta guía
  backend/              motor, API y catálogo (Python)
  web/                  interfaz compilada
  Dockerfile            imagen para Docker, Render, Railway…
  docker-compose.yml    la tienda con su volumen de datos
  .env.ejemplo          configuración (se copia como .env)
  instalar.sh           instalación en un VPS sin Docker
  lenin-auto.service    servicio systemd (lo usa instalar.sh)
  nginx.conf            proxy con tu dominio (lo usa instalar.sh)
  ejemplos/             planilla de inventario de ejemplo
```

## 1. Subir el paquete

Desde tu computador (cambia `usuario` e `IP`):

```bash
scp lenin-auto-cars-*.zip usuario@IP:~
ssh usuario@IP
sudo apt install -y unzip
unzip lenin-auto-cars-*.zip && cd lenin-auto-cars
```

Antes apunta tu dominio al servidor: en tu proveedor de dominio, un registro **A** para
`tu-dominio.com` y otro para `www` con la IP del servidor.

## 2A. VPS sin Docker (Ubuntu 24.04 o Debian 12) — lo más simple

```bash
sudo ./instalar.sh tu-dominio.com
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com     # HTTPS gratis
```

El instalador crea el usuario `lenin` y deja la tienda en `/opt/lenin-auto`. También:

- genera una clave secreta en `/opt/lenin-auto/.env`;
- instala el servicio `lenin-auto` (arranca solo al reiniciar el servidor);
- configura nginx con tu dominio.

Revisa en `/opt/lenin-auto/.env` tu correo, WhatsApp, moneda y costo de envío. Después
reinicia: `sudo systemctl restart lenin-auto`.

## 2B. VPS con Docker

```bash
cp .env.ejemplo .env
nano .env                         # pon LENIN_SECRET (genera una: openssl rand -base64 48)
docker compose up -d --build
```

La tienda queda en `127.0.0.1:8000`. Para publicarla con tu dominio y HTTPS:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sed "s/TU_DOMINIO/tu-dominio.com/g" nginx.conf | sudo tee /etc/nginx/sites-available/lenin-auto
sudo ln -sf /etc/nginx/sites-available/lenin-auto /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

## 2C. Render, Railway u otro servicio con Docker

Sube esta carpeta a un repositorio y crea un servicio web desde el `Dockerfile`. Luego:

1. Define las variables de `.env.ejemplo` en el panel. Como mínimo `LENIN_SECRET` y
   `LENIN_TRUST_PROXY=1`.
2. Agrega un disco persistente montado en `/app/data`. Ahí se guardan los pedidos; sin el
   disco se pierden en cada despliegue.

El puerto se toma de la variable `PORT` que pone la plataforma.

## 3. Comprobar

- `https://tu-dominio.com` muestra la tienda.
- `https://tu-dominio.com/api/health` responde `{"status":"ok",…}`.
- `https://tu-dominio.com/api/docs` muestra la documentación de la API.

## Cargar tu inventario real

Sin inventario propio, la tienda muestra el catálogo de demostración (con el aviso
correspondiente). Para usar el tuyo, exporta tu planilla a CSV; `ejemplos/` trae un
modelo con errores típicos.

**VPS sin Docker**

```bash
sudo cp mi-inventario.csv /opt/lenin-auto/data/
sudo lenin-auto importar /opt/lenin-auto/data/mi-inventario.csv          # solo revisa
sudo lenin-auto importar /opt/lenin-auto/data/mi-inventario.csv \
     --salida /opt/lenin-auto/data/inventario.json --reporte /opt/lenin-auto/data/problemas.csv
echo 'LENIN_INVENTORY=/opt/lenin-auto/data/inventario.json' | sudo tee -a /opt/lenin-auto/.env
sudo systemctl restart lenin-auto
```

**Docker**

```bash
docker compose run --rm -v "$PWD/mi-inventario.csv:/tmp/inv.csv:ro" tienda \
    python -m lenin_auto importar /tmp/inv.csv --salida /app/data/inventario.json
echo 'LENIN_INVENTORY=/app/data/inventario.json' >> .env
docker compose up -d
```

El reporte indica, fila por fila, qué no se pudo importar y por qué.

## Pedidos

```bash
sudo lenin-auto pedidos listar                                       # VPS sin Docker
sudo lenin-auto pedidos avanzar LAC-XXXX-XXXX-X enviado --nota "Guía 123"
docker compose exec tienda python -m lenin_auto pedidos listar      # Docker
```

Estados: `preparando`, `enviado`, `entregado`, `cancelado`. El cliente ve el avance en
«Seguir mi pedido» con su código y su correo.

## Actualizar a una versión nueva

Sube el nuevo zip, descomprímelo y:

- **sin Docker:** `sudo ./instalar.sh` (conserva `.env`, pedidos e inventario);
- **Docker:** copia tu `.env` a la carpeta nueva y ejecuta `docker compose up -d --build`
  (el volumen `datos` conserva pedidos e inventario).

## Copias de seguridad

Todo lo que no se puede regenerar está en la carpeta de datos: los pedidos
(`pedidos.sqlite3`) y tu `inventario.json`. Guarda también el `.env`, porque su
`LENIN_SECRET` verifica los certificados ya emitidos.

```bash
sudo tar czf respaldo-$(date +%F).tgz /opt/lenin-auto/data /opt/lenin-auto/.env              # sin Docker
docker compose exec -T tienda tar czf - /app/data > respaldo-$(date +%F).tgz                    # Docker
```

## Si algo falla

| Síntoma | Qué revisar |
| --- | --- |
| La página no carga | `systemctl status lenin-auto` y `journalctl -u lenin-auto -n 50` (Docker: `docker compose logs`) |
| «502 Bad Gateway» | La tienda aún arranca (unos segundos) o se detuvo: mismo registro de arriba |
| El dominio no abre | El registro A apunta a la IP del servidor y el puerto 80/443 está abierto (`sudo ufw allow 'Nginx Full'`) |
| «Se necesita Python 3.11» | El sistema es antiguo: usa la opción Docker |
| Los certificados dicen «no válido» | Cambió `LENIN_SECRET`; restaura el anterior |
| Al abrir un menú la pantalla queda azul oscuro o negra | Versión anterior a la 2.1.1 (fallaba en navegadores de antes de 2023): actualiza |
