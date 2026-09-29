# Lenin Auto Cars — tienda de repuestos

Tienda de repuestos automotrices con un buscador que entiende cómo habla el cliente.
Tomamos el catálogo de RockAuto como prototipo funcional y lo rehicimos con identidad,
funciones y algoritmos propios. Análisis completo en [docs/ANALISIS-ROCKAUTO.md](docs/ANALISIS-ROCKAUTO.md);
detalle técnico en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Qué trae

- **Buscador en lenguaje natural** (Ctrl K o `/`): «pastillas delanteras corolla 2016 menos de 60»
  se convierte en vehículo + pieza + posición + precio, con resultados mientras escribes.
  Sinónimos regionales (balatas, mofle, croche, maza…), corrección de errores («toyta corrola»),
  búsqueda por voz donde el navegador lo permite.
- **Números de parte, OEM y referencias cruzadas** en cualquier formato (`0 986 494 525` =
  `0986-494-525`); un OEM devuelve todas las piezas equivalentes.
- **Diagnóstico por síntomas**: «chilla al frenar» → pastillas, discos y caliper con su probabilidad, calculada
  con un modelo bayesiano según la antigüedad del vehículo.
- **Plan de mantenimiento** por kilometraje con paquetes Económico, Recomendado y Premium.
- **Garaje** con varios vehículos, **decodificador de VIN** y filtro de compatibilidad en todo el sitio.
- **Explorador de catálogo** Marca → Año → Modelo → Motor → Sistema → Pieza.
- **Lámina técnica interactiva** del vehículo en la portada.
- Facetas con conteo, histograma de precios, índice «Mejor valor», carrito con
  **consolidación de envíos** por almacén, tema claro y oscuro, diseño móvil primero.

El inventario incluido (≈20 900 piezas, 53 marcas, 13 fabricantes de vehículos) es de
**demostración**: precios, existencias y números de parte son ficticios.

## Uso

Requiere Node 20 o superior.

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # compila a dist/
npm run preview    # sirve dist/
npm run check      # tipos + pruebas + formato
```

## Configuración

`src/config.ts`: nombre, moneda, idioma, monto de envío gratis, correo y WhatsApp.
Almacenes, marcas y categorías en `src/data/catalog.ts`; vehículos en `src/data/vehicles.ts`.
Para usar tu inventario real, reemplaza el generador de `src/data/inventory.ts` por tu feed
manteniendo el tipo `Product` (ver `docs/ARQUITECTURA.md`).

## Publicar

`dist/` es estático y usa rutas relativas: funciona en GitHub Pages, Netlify, Vercel o cualquier
hosting. Para GitHub Pages ya está el flujo `.github/workflows/deploy-pages.yml`: en
**Settings → Pages** elige «GitHub Actions» como fuente y cada push a `main` publica el sitio.
