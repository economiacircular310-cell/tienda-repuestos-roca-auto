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
| Facetas | Conteos que dicen cuánto verías al marcar otra opción | Facetas disyuntivas con máscara de bits |
| Diagnóstico | «me chilla y vibra al frenar» → discos 55 %, pastillas 41 % | **Bayes ingenuo** + desgaste **Weibull** |
| Mantenimiento | Qué toca a los 40 000 km y qué hacer hoy con $150 | Intervalos + **mochila 0/1** lexicográfica (seguridad primero) |
| Confianza | Certificado de compatibilidad verificable por cualquiera | **HMAC-SHA256** (RFC 2104) |
| Calificaciones | 5★ con 2 reseñas no le gana a 4,7★ con 900 | **Promedio bayesiano** + **límite de Wilson** |
| Marca y precio | Índice de confianza de marca (A+…D) y «precio justo» por percentil | Puntaje compuesto + percentiles de mercado |
| Envíos | Mínimo de paquetes entre almacenes | **Set cover** exacto |
| VIN | Fabricante, año y dígito verificador sin red | **ISO 3779** + NHTSA vPIC |

El inventario incluido (≈20 900 piezas, 53 marcas, 1 586 configuraciones de vehículo) es de
**demostración**: precios, existencias y números de parte son ficticios.

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
docker run -p 8000:8000 -e LENIN_SECRET="…" lenin-auto-cars
```

Corre en cualquier servicio que acepte Docker (Render, Railway, Fly.io, un VPS).

## Probar desde la terminal

```bash
cd backend
python -m lenin_auto buscar "toyta corrola balatas delanteras"
python -m lenin_auto diagnostico "me chilla y vibra al frenar" --vehiculo nissan-versa:2014
python -m lenin_auto servicio toyota-corolla:2016:2ZR-FE --km 40000 --presupuesto 150
```

## Configurar

Variables `LENIN_*` (ver `backend/lenin_auto/config.py`): nombre, moneda, idioma, envío
gratis, correo, WhatsApp y `LENIN_SECRET`. Vehículos, piezas, sinónimos y síntomas están
en JSON editables en `backend/lenin_auto/catalog/`. Para usar tu inventario real, reemplaza
`backend/lenin_auto/inventory.py` manteniendo la clase `Product`.

## Calidad

CI en cada PR: ruff, mypy estricto y 54 pruebas pytest en el backend; typecheck, formato y
build en el frontend; y la imagen Docker.
