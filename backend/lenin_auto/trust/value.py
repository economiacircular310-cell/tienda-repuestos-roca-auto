"""Índice de valor y precio justo.

Índice de valor (entre opciones intercambiables de la misma pieza)
    valor = R̃² · √(años de garantía) · disponibilidad / precio^0.7
    Usa la calificación bayesiana R̃, no la cruda. El exponente 0.7 < 1 evita que siempre
    gane lo más barato; el cuadrado de R̃ castiga a los productos mal calificados.

Precio justo
    Percentil del precio dentro de su mercado comparable (mismo tipo de pieza y nivel),
    corregido por tamaño del vehículo. Con 20 000 referencias es una referencia honesta:
    ≤ P35 «buen precio», ≤ P70 «precio de mercado», más arriba «sobre el promedio».
"""

from __future__ import annotations

import math
from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass

from ..inventory import Inventory, Product
from .ratings import RatingModel


@dataclass(frozen=True, slots=True)
class FairPrice:
    percentile: int
    label: str
    median: float


class ValueModel:
    def __init__(self, inventory: Inventory, ratings: RatingModel) -> None:
        self.ratings = ratings
        self._score = {p.id: self.score(p) for p in inventory}
        self.best_value: frozenset[str] = frozenset(
            max(group, key=lambda p: self._score[p.id]).id for group in inventory.groups.values() if len(group) >= 3
        )
        market: dict[tuple[str, str], list[float]] = defaultdict(list)
        for p in inventory:
            market[(p.part_type_id, p.tier)].append(p.price)
        self._market = {k: sorted(v) for k, v in market.items()}

    def score(self, p: Product) -> float:
        r = self.ratings.adjusted(p.rating, p.reviews) / 5
        availability = 1.0 if p.in_stock else 0.8
        return float(r * r * math.sqrt(p.warranty_years) * availability / p.price**0.7)

    def value(self, p: Product) -> float:
        return self._score[p.id]

    def fair_price(self, p: Product) -> FairPrice:
        prices = self._market[(p.part_type_id, p.tier)]
        pct = round(100 * bisect_left(prices, p.price) / max(1, len(prices) - 1))
        pct = max(0, min(100, pct))
        label = "Buen precio" if pct <= 35 else "Precio de mercado" if pct <= 70 else "Sobre el promedio"
        return FairPrice(pct, label, prices[len(prices) // 2])
