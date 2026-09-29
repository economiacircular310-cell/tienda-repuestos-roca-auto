# Análisis de RockAuto y rediseño para Lenin Auto Cars

RockAuto (rockauto.com) se tomó como **prototipo funcional**, no como modelo visual. Lo que
sigue es qué hace bien, dónde se queda corto y qué hicimos distinto.

## 1. Estructura de RockAuto

| Zona       | Qué tiene                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encabezado | Logo con el lema «All the parts your car will ever need», accesos a ayuda, estado de pedido y devoluciones, promociones y reembolsos, cuenta.                                     |
| Búsqueda   | Selector Año / Marca / Modelo con banderas de país, búsqueda por número de parte y por tipo de pieza, vehículos guardados.                                                        |
| Catálogo   | Árbol de texto: **Marca → Año → Modelo → Motor → Categoría → Tipo de pieza → listado**. Índice A–Z con cientos de marcas, incluidas clásicas.                                     |
| Listado    | Por cada tipo de pieza, varias marcas y **niveles de precio** (Economy, Daily Driver, High Performance, OE), botón «Info», liquidaciones mayoristas y costo de envío por almacén. |
| Comercial  | Promociones, reembolsos del fabricante, pago en cuotas, certificados de regalo, boletín.                                                                                          |
| Pie        | Idioma y moneda, garantías, sitio móvil, avisos legales.                                                                                                                          |

## 2. Lo que hace bien (y conservamos)

- **Profundidad y precisión de compatibilidad**: todo parte del vehículo exacto, hasta el motor.
- **Árbol de catálogo**: seis clics y estás en la pieza. Lo mantuvimos como explorador de columnas.
- **Varios niveles por pieza**: el cliente elige cuánto pagar. Lo mantuvimos con cuatro niveles
  (Económico, Uso diario, Alto desempeño, Original OEM).
- **Transparencia**: precio, marca, número de parte y almacén a la vista.

## 3. Dónde se queda corto

| Problema                                                                                    | Impacto                                                                          |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Interfaz de los 2000: tablas densas, sin jerarquía visual, sin imágenes consistentes.       | Cuesta escanear; transmite «barato» más que «experto».                           |
| No es móvil primero (tiene un sitio móvil aparte).                                          | La mayoría de las búsquedas de repuestos en Latinoamérica son desde el teléfono. |
| Búsqueda literal: sin lenguaje natural, sin sinónimos regionales, sin tolerancia a errores. | «balatas», «mofle» o «croche» no encuentran nada; «corrola» tampoco.             |
| El número de parte se busca tal cual (guiones y espacios importan).                         | Fricción al copiar números de la caja o la factura.                              |
| Nada ayuda a quien no sabe qué pieza necesita.                                              | El cliente sin conocimiento técnico se va.                                       |
| Sin planificación de mantenimiento.                                                         | Se pierde la venta recurrente (aceite, filtros, bujías).                         |
| El carrito no explica de qué almacén sale cada pieza ni cómo minimizar envíos.              | Costos y plazos sorpresa.                                                        |

## 4. Lo que hicimos distinto

### Diseño

- **Identidad «lámina técnica»**: el sitio se ve como un catálogo de despiece OEM moderno — papel
  azul de plano con cuadrícula, llamadas numeradas, cuadro de rotulación, cotas. Nadie más en la
  categoría se ve así.
- **Tipografía de taller**: Barlow Condensed (rotulación DIN de carretera) para títulos, IBM Plex
  Sans para leer, IBM Plex Mono para números de parte con etiqueta tipo ubicación de almacén.
- **Un solo acento**: amarillo señal, reservado para acciones y datos clave.
- **Cada pieza tiene dibujo técnico propio** (discos, amortiguadores, filtros, bujías, fluidos…),
  generado en SVG, en lugar de fotos de stock dispares.
- **Móvil primero**, tema claro y oscuro, accesible con teclado.

### Funciones

| RockAuto                            | Lenin Auto Cars                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selector Año / Marca / Modelo       | Selector Marca → Año → Modelo → Motor **+ decodificador de VIN** (local y NHTSA vPIC) **+ garaje** con varios vehículos.                                              |
| Búsqueda por número o tipo de pieza | **Buscador en lenguaje natural** (Ctrl K o «/») que entiende vehículo, pieza, posición, nivel, precio y síntomas en una sola frase, con resultados mientras escribes. |
| Árbol de texto                      | **Explorador en columnas** (Marca · Año · Modelo · Motor · Sistema · Pieza) con conteos en vivo y vista por pasos en móvil.                                           |
| —                                   | **Lámina interactiva del vehículo**: toca un sistema y ves sus piezas para tu auto.                                                                                   |
| —                                   | **Diagnóstico por síntomas** con probabilidades («chilla al frenar» → pastillas, discos, caliper).                                                                    |
| —                                   | **Plan de mantenimiento** por kilometraje con tres paquetes de precio cerrado.                                                                                        |
| Niveles de precio                   | Niveles **+ índice «Mejor valor»** calculado por pieza.                                                                                                               |
| Costo de envío por almacén          | **Consolidación automática** del carrito en el mínimo de envíos.                                                                                                      |

### Algoritmos

Ver [ARQUITECTURA.md](./ARQUITECTURA.md): intérprete de lenguaje natural, índice BM25 con
prefijos y tolerancia a errores, normalización de números de parte y OEM, facetas disyuntivas,
modelo bayesiano de diagnóstico, planificador de mantenimiento, índice de valor y consolidación
de envíos.
