"""Índice de confianza de marca (0–100) y nota.

Combina señales que el cliente no puede ver de un vistazo:
    45 %  calificación bayesiana ponderada por reseñas de todo su catálogo, escalada al
          rango real del mercado (3,8★ → 0, 4,5★ → 1): comparar contra 5★ ideales
          aplastaría las diferencias que sí importan
    20 %  garantía promedio (2 años o más = completo)
    20 %  disponibilidad: proporción de referencias con existencias
    10 %  proveedor de equipo original de alguna marca de vehículo
     5 %  amplitud del catálogo (log del número de referencias)
Notas: A+ ≥ 85 · A ≥ 75 · B ≥ 65 · C ≥ 55 · D.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

from ..catalog import Catalog
from ..inventory import Inventory
from .ratings import RatingModel


@dataclass(frozen=True, slots=True)
class BrandTrust:
    brand_id: str
    score: int
    grade: str
    rating: float
    reviews: int
    references: int
    in_stock_pct: int
    oem_supplier: bool


def _grade(score: int) -> str:
    return "A+" if score >= 85 else "A" if score >= 75 else "B" if score >= 65 else "C" if score >= 55 else "D"


def brand_trust(catalog: Catalog, inventory: Inventory, ratings: RatingModel) -> dict[str, BrandTrust]:
    agg: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0, 0.0])  # Σr·n, Σn, Σgarantía, stock, refs
    for p in inventory:
        a = agg[p.brand_id]
        a[0] += p.rating * p.reviews
        a[1] += p.reviews
        a[2] += p.warranty_years
        a[3] += 1 if p.in_stock else 0
        a[4] += 1
    max_refs = max(a[4] for a in agg.values())
    out: dict[str, BrandTrust] = {}
    for b in catalog.brands:
        if b.id not in agg:
            continue
        sum_rn, n, warranty, stocked, refs = agg[b.id]
        raw = sum_rn / n if n else ratings.prior_mean
        adj = ratings.adjusted(raw, int(n))
        oem = "oem" in b.tiers
        score = (
            45 * min(1.0, max(0.0, (adj - 3.8) / 0.7))
            + 20 * min(1.0, (warranty / refs) / 2)
            + 20 * stocked / refs
            + 10 * oem
            + 5 * math.log1p(refs) / math.log1p(max_refs)
        )
        s = max(0, min(100, round(score)))
        out[b.id] = BrandTrust(b.id, s, _grade(s), round(adj, 2), int(n), int(refs), round(100 * stocked / refs), oem)
    return out
