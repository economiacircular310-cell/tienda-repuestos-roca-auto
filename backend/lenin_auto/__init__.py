"""Lenin Auto Cars — motor de catálogo, búsqueda y confianza para repuestos automotrices.

Paquetes:
    catalog     datos de referencia (vehículos, taxonomía, marcas) y compatibilidad
    inventory   inventario de demostración determinista
    search      intérprete de lenguaje natural, BM25F, SymSpell, fonética, RRF y MMR
    trust       calificación bayesiana, confianza de marca, precio justo, certificados HMAC
    workshop    diagnóstico bayesiano con Weibull y plan de mantenimiento con mochila
    logistics   consolidación exacta de envíos
    vin         decodificador ISO 3779
    store       fachada que arma todo una sola vez (la usan la API y la CLI)
"""

__version__ = "2.0.0"
