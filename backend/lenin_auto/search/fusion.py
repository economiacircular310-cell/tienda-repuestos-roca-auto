"""Fusión y diversificación de rankings.

Reciprocal Rank Fusion (Cormack, Clarke & Büttcher, SIGIR 2009)
    RRF(d) = Σ_c w_c / (k + rank_c(d))
    Combina listas ordenadas por señales de escalas incomparables (relevancia textual,
    calidad bayesiana, disponibilidad, probabilidad de diagnóstico) sin normalizarlas.
    k = 60 es el valor del artículo original; amortigua la ventaja del primer puesto.

Maximal Marginal Relevance (Carbonell & Goldstein, SIGIR 1998)
    MMR = argmax_d [ λ·rel(d) − (1−λ)·max_{s∈S} sim(d, s) ]
    Reordena la primera página para que no sean diez productos de la misma marca y nivel:
    el cliente ve de entrada la opción económica, la de uso diario y la de alto desempeño.
    λ = 0,5 se calibró midiendo «pastillas»: 5 marcas en la primera docena con λ = 0,72,
    8 marcas y los 4 niveles con λ = 0,5, sin sacar de la página a los más relevantes.
"""

from __future__ import annotations

from collections.abc import Callable, Hashable, Sequence
from typing import TypeVar

T = TypeVar("T", bound=Hashable)


def rrf(rankings: Sequence[tuple[Sequence[T], float]], k: int = 60) -> dict[T, float]:
    """Cada lista sin elementos repetidos. Suma en el mismo orden que la definición (bit a bit
    igual), pero lista por lista con diccionarios: sin un paso de Python por elemento y lista."""
    scores: dict[T, float] = {}
    for ranking, weight in rankings:
        adds = dict(zip(ranking, [weight / (k + rank) for rank in range(1, len(ranking) + 1)], strict=True))
        if not scores:
            scores = adds  # 0.0 + x == x
        elif scores.keys() == adds.keys():
            scores = {item: s + adds[item] for item, s in scores.items()}
        else:
            for item, add in adds.items():
                scores[item] = scores.get(item, 0.0) + add
    return scores


def mmr(
    items: Sequence[T],
    relevance: dict[T, float],
    similarity: Callable[[T, T], float],
    lam: float = 0.5,
    top: int = 24,
) -> list[T]:
    if len(items) <= 1:
        return list(items)
    pool = list(items[: top * 3])
    hi = max(relevance[i] for i in pool)
    lo = min(relevance[i] for i in pool)
    span = (hi - lo) or 1.0
    rel = {i: (relevance[i] - lo) / span for i in pool}
    nearest = dict.fromkeys(pool, 0.0)  # máx. similitud con lo ya elegido, actualizado al elegir: O(n·top)
    chosen: list[T] = []
    while pool and len(chosen) < top:
        best = max(pool, key=lambda d: lam * rel[d] - (1 - lam) * nearest[d])
        chosen.append(best)
        pool.remove(best)
        for d in pool:
            nearest[d] = max(nearest[d], similarity(d, best))
    picked = set(chosen)
    return chosen + [i for i in items if i not in picked]
