"""Calificaciones que no mienten.

Promedio bayesiano (el «weighted rating» de IMDb)
    R̃ = (n·R + m·C) / (n + m)
    Un producto con 2 reseñas de 5★ no le gana a uno con 900 reseñas de 4,7★: con pocas
    reseñas la calificación se acerca al promedio general C; con muchas, a la propia R.
    m es cuántas reseñas «de confianza» exigimos antes de creerle al producto.

Límite inferior de Wilson (Wilson, 1927; popularizado por Evan Miller)
    Cota inferior del intervalo de confianza al 95 % de la proporción de clientes
    satisfechos. Es lo que se usa para ordenar «mejor valorados» de forma justa.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

NEUTRAL_RATING = 4.0


def bayesian_average(rating: float, n: int, prior_mean: float, prior_weight: float) -> float:
    return (n * rating + prior_weight * prior_mean) / (n + prior_weight)


def wilson_lower_bound(positive: float, n: int, z: float = 1.96) -> float:
    if n <= 0:
        return 0.0
    p = positive / n
    denom = 1 + z * z / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)
    return (centre - margin) / denom


@dataclass(frozen=True, slots=True)
class RatingModel:
    """Parámetros globales estimados del propio inventario."""

    prior_mean: float
    prior_weight: float = 25.0

    @classmethod
    def fit(cls, ratings: list[tuple[float, int]], prior_weight: float = 25.0) -> RatingModel:
        """C = promedio ponderado por reseñas; sin ninguna reseña (inventario recién importado), 4★ neutral."""
        total = sum(n for _, n in ratings)
        return cls(sum(r * n for r, n in ratings) / total if total else NEUTRAL_RATING, prior_weight)

    def adjusted(self, rating: float, n: int) -> float:
        return bayesian_average(rating, n, self.prior_mean, self.prior_weight)

    def satisfaction(self, rating: float, n: int) -> float:
        """Proporción de satisfechos (≥ 4★) estimada y su cota de Wilson."""
        share = min(1.0, max(0.0, (rating - 1) / 4))
        return wilson_lower_bound(share * n, n)
