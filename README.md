# Lenin Auto Cars

Tienda de repuestos automotrices con motor en **Python**. Tomamos el catálogo de RockAuto
como prototipo funcional y lo rehicimos con identidad, funciones y algoritmos propios.
Todo el cálculo vive en el servidor; la interfaz solo muestra.

```
backend/    Python 3.11+ · FastAPI · búsqueda, diagnóstico, confianza, logística
frontend/   React 19 + TypeScript + Tailwind 4 · cliente delgado de la API
docs/       análisis de RockAuto y arquitectura (cada algoritmo explicado)
```

## Qué la hace única

| Área | Qué hace | Algoritmo |
| --- | --- | --- |
| Búsqueda | Entiende «pastillas delanteras corolla 2016 menos de 60» | Intérprete de lenguaje natural + **BM25F** |
| Errores | «amortiguadr», «amortiwador», «balbula» | **SymSpell** + **fonética española** propia |
| Ranking | Mezcla relevancia, calidad, stock y diagnóstico; primera página variada | **Reciprocal Rank Fusion** + **MMR** |
| Velocidad | 20 885 piezas, mediana de 2,6 ms por consulta en CPython | Conjuntos de bits (AND/OR/popcount) + órdenes precalculados |
| Facetas | Conteos que dicen cuánto verías al marcar otra opción | Facetas disyuntivas por álgebra de conjuntos |
| Diagnóstico | «me chilla y vibra al frenar» → discos 55 %, pastillas 41 % | **Bayes ingenuo** + desgaste **Weibull** |
| Mantenimiento | Qué toca a los 40 000 km y qué hacer hoy con $150 | Intervalos + **mochila 0/1** lexicográfica (seguridad primero) |
| Compatibilidad | Solo se certifica lo que el fabricante declara (año y motor exactos) | Claves de 5 granularidades, representación mínima |
| Confianza | Certificado de compatibilidad verificable por cualquiera | **HMAC-SHA256** (RFC 2104) |
| Calificaciones | 5★ con 2 reseñas no le gana a 4,7★ con 900 | **Promedio bayesiano** + **límite de Wilson** |
| Marca y precio | Índice de confianza de marca (A+…D) y «precio justo» por percentil | Puntaje compuesto + percentiles de mercado |
| Envíos | Mínimo de paquetes entre almacenes | **Set cover** exacto |
| VIN | Fabricante, año y dígito verificador sin red | **ISO 3779** + NHTSA vPIC |
| Pedidos | Código dictable por teléfono que detecta errores de tipeo | Base32 de Crockford + **Luhn mod 32** |
| Tu inventario | Importa la planilla del ERP tal como viene, con reporte por fila | El mismo intérprete del buscador + Damerau-Levenshtein |
| Protección | Ráfagas permitidas, abuso sostenido cortado | **Token bucket** + CSP estricta |

El inventario incluido (≈20 900 piezas, 53 marcas, 1 586 configuraciones de vehículo) es de
**demostración**: precios, existencias y números de parte son ficticios. Para vender con el
tuyo, ver [Tu inventario](#tu-inventario).

## Ejecutar

```bash
# 1) Motor e API
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
export LENIN_SECRET="una-clave-larga-y-secreta"
python -m lenin_auto servir            # http://127.0.0.1:8000  (docs en /api/docs)

# 2) Interfaz en desarrollo (otra terminal)
cd frontend
npm install
npm run dev                            # http://localhost:5173  (reenvía /api al puerto 8000)
```

Para producción: `cd frontend && npm run build` y FastAPI sirve `frontend/dist` en el mismo
origen, o usa la imagen Docker:

```bash
docker build -t lenin-auto-cars .
docker run -p 8000:8000 -e LENIN_SECRET="…" -v lenin-datos:/app/data lenin-auto-cars
```

El volumen `/app/data` conserva la base de pedidos (SQLite) entre despliegues.

Corre en cualquier servicio que acepte Docker (Render, Railway, Fly.io, un VPS).

### Paquete para el servidor

```bash
deploy/empaquetar.sh        # → dist-servidor/lenin-auto-cars-<versión>.zip
```

El zip trae el motor, la interfaz ya compilada (el servidor no necesita Node), un
instalador para VPS Ubuntu 24.04 / Debian 12 (`sudo ./instalar.sh tu-dominio.com`: systemd
endurecido + nginx), `docker-compose.yml` y la guía paso a paso: [deploy/README.md](deploy/README.md).

## Probar desde la terminal

```bash
cd backend
python -m lenin_auto buscar "toyta corrola balatas delanteras"
python -m lenin_auto diagnostico "me chilla y vibra al frenar" --vehiculo nissan-versa:2014
python -m lenin_auto servicio toyota-corolla:2016:2ZR-FE --km 40000 --presupuesto 150
```

## Tu inventario

Exporta tu inventario desde Excel o tu ERP a CSV. Los encabezados pueden venir en español o
en inglés, y el separador puede ser `,`, `;` o tabulador. Luego:

```bash
cd backend
python -m lenin_auto importar mi-inventario.csv                       # solo valida
python -m lenin_auto importar mi-inventario.csv --salida inventario.json --reporte problemas.csv
LENIN_INVENTORY=inventario.json python -m lenin_auto servir
```

El importador entiende marcas con errores («NKG» → NGK) y alias («Kayaba» → KYB). También
reconoce sinónimos regionales y en inglés («balatas», «brake pads»), precios «$1.234,50» y
aplicaciones como `Toyota Corolla 2014-2016; Yaris 1.5 2012+; Hilux diésel; Motor 2ZR-FE`.
Cada fila con problema queda en el reporte con su causa. Lo que el proveedor no declara no
se certifica: una pieza para «Corolla 2014-2016» no aparece confirmada en un Corolla 2018.

Con `python -m lenin_auto exportar plantilla.csv -n 50` obtienes una plantilla con datos
reales. Hay un ejemplo con errores típicos en `docs/ejemplos/inventario-ejemplo.csv`.

## Configurar

Variables `LENIN_*` (ver `backend/lenin_auto/config.py`):

| Variable | Para qué |
| --- | --- |
| `LENIN_SECRET` | Firma de certificados (obligatoria en producción) |
| `LENIN_INVENTORY` | Instantánea JSON generada por `importar` (sin ella, la demostración) |
| `LENIN_DB` | Archivo SQLite de pedidos |
| `LENIN_RATE_BURST`, `LENIN_RATE_PER_SECOND` | Límite de peticiones por cliente (ráfaga y ritmo) |
| `LENIN_TRUST_PROXY=1` | Tomar la IP del cliente de `X-Forwarded-For` detrás de un proxy |
| `LENIN_STORE_NAME`, `LENIN_CURRENCY`, `LENIN_LOCALE`, `LENIN_FREE_SHIPPING`, `LENIN_EMAIL`, `LENIN_WHATSAPP` | Datos de la tienda |

Vehículos, piezas, sinónimos y síntomas están en JSON editables en
`backend/lenin_auto/catalog/`.

Los pedidos se gestionan desde la terminal:
`python -m lenin_auto pedidos listar` y `python -m lenin_auto pedidos avanzar LAC-XXXX-XXXX-X enviado --nota "Guía 123"`.

## Calidad

CI en cada PR: ruff, mypy estricto y 84 pruebas pytest en el backend; typecheck, formato y
build en el frontend; y la imagen Docker. Dos pruebas que valen por muchas:

- **Ida y vuelta**: exportar las 20 885 piezas a CSV y volver a importarlas da exactamente
  el mismo inventario, campo por campo.
- **Diferenciales**: conteos, facetas, fusión RRF, MMR e histograma se comparan contra su
  definición literal producto por producto; las optimizaciones no cambian ni un resultado.
