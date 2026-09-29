# lenin_auto · motor de Lenin Auto Cars

Paquete de Python con toda la inteligencia de la tienda: catálogo, búsqueda en lenguaje
natural, diagnóstico, mantenimiento, confianza y logística. Se usa como API (FastAPI),
como línea de comandos o como biblioteca.

## Instalar

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
export LENIN_SECRET="una-clave-larga-y-secreta"   # firma los certificados
```

## Línea de comandos

```bash
python -m lenin_auto buscar "pastillas delanteras corolla 2016 menos de 60"
python -m lenin_auto buscar "filtro de aceite" --vehiculo toyota-corolla:2016:2ZR-FE
python -m lenin_auto diagnostico "me chilla y vibra al frenar" --vehiculo nissan-versa:2014
python -m lenin_auto servicio toyota-corolla:2016:2ZR-FE --km 40000 --presupuesto 150
python -m lenin_auto vin 2T1BURHE3GC741258 --en-linea
python -m lenin_auto pieza <id> --vehiculo toyota-corolla:2016
python -m lenin_auto verificar <token>
python -m lenin_auto importar inventario.csv --salida inventario.json --reporte problemas.csv
python -m lenin_auto exportar plantilla.csv -n 50 --separador ";"
python -m lenin_auto pedidos listar
python -m lenin_auto pedidos avanzar LAC-7Q2M-9XKD-4 enviado --nota "Guía 123"
python -m lenin_auto stats
LENIN_INVENTORY=inventario.json python -m lenin_auto servir --puerto 8000   # API + interfaz
```

Todas aceptan `--json`.

## API

`python -m lenin_auto servir` y abre `http://127.0.0.1:8000/api/docs` (OpenAPI interactivo).

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/api/meta` | Vehículos, taxonomía, marcas con confianza, síntomas, ajustes |
| GET | `/api/search` | Búsqueda con `q`, filtros (`cat`, `pt`, `brand`, `tier`, `pos`, `min`, `max`, `stock`, `sale`), vehículo (`make`, `model`, `year`, `engine`), `fit`, `sort`, `page`, `size` |
| GET | `/api/suggest` | Autocompletado |
| GET | `/api/products/{id}` | Ficha, compatibilidad con confianza, alternativas, relacionadas, confianza de marca y certificado |
| GET | `/api/verify?token=` | Verifica un certificado HMAC |
| POST | `/api/cart` | Totales y consolidación de envíos |
| GET | `/api/service-plan` | Plan por kilometraje, paquetes y presupuesto (`km`, `budget`, `pack`) |
| GET | `/api/diagnosis?symptoms=` | Diagnóstico bayesiano de uno o varios síntomas |
| GET | `/api/vin/{vin}` | Decodificación ISO 3779 (`online=true` consulta la NHTSA) |
| GET | `/api/catalog?path=` | Columnas del explorador Marca → Año → Modelo → Motor → Sistema → Pieza |
| GET | `/api/home` | Datos de la portada |
| POST | `/api/orders` | Registra un pedido (cabecera `Idempotency-Key`); congela precios y certifica cada pieza compatible |
| POST | `/api/orders/lookup` | Seguimiento con código y correo |

Todas las rutas `/api/` (menos `/api/health`) pasan por el limitador token bucket y
responden con `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`; al exceder,
429 con `Retry-After`. Todas las respuestas llevan CSP estricta, `nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` y, sobre HTTPS, HSTS.

## Estructura

```
lenin_auto/
  catalog/        JSON editables (vehículos, taxonomía, léxico, síntomas) + modelo tipado
  inventory.py    Product, inventario de demostración determinista e instantáneas JSON
  importer.py     CSV del ERP → instantánea, con reporte por fila; exportación a CSV
  search/         text · phonetic · symspell · bm25 · fusion · parser · engine
  trust/          ratings · value · brand · fitment · certificate
  workshop/       diagnosis (Bayes + Weibull) · maintenance (plan + mochila)
  logistics/      shipping (set cover exacto)
  vin.py          ISO 3779 + vPIC
  orders.py       pedidos en SQLite: códigos Luhn mod 32, estados, idempotencia
  security.py     token bucket y cabeceras de seguridad (ASGI puro)
  store.py        fachada: arma todo una vez
  api.py · cli.py
```

## Calidad

```bash
ruff check . && ruff format --check . && mypy lenin_auto && pytest
```

mypy en modo estricto; 83 pruebas cubren texto, búsqueda, diagnóstico, mantenimiento,
confianza, logística, VIN, pedidos, seguridad, el importador (ida y vuelta de las 20 885
piezas) y la API, más pruebas diferenciales del motor contra su definición literal.
