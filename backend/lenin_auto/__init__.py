"""Lenin Auto Cars — motor de catálogo, búsqueda y confianza para repuestos automotrices.

Paquetes:
    catalog     datos de referencia (vehículos, taxonomía, marcas) y compatibilidad
    inventory   producto, inventario de demostración determinista e instantáneas JSON
    importer    CSV del ERP → inventario, con reporte por fila (y exportación a CSV)
    search      intérprete de lenguaje natural, BM25F, SymSpell, fonética, RRF y MMR
    trust       calificación bayesiana, confianza de marca, precio justo, certificados HMAC
    workshop    diagnóstico bayesiano con Weibull y plan de mantenimiento con mochila
    logistics   consolidación exacta de envíos
    vin         decodificador ISO 3779
    orders      pedidos en SQLite con códigos verificables (Luhn mod 32)
    security    limitador token bucket y cabeceras de seguridad
    store       fachada que arma todo una sola vez (la usan la API y la CLI)
"""

__version__ = "2.1.0"
