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
    scores: dict[T, float] = {}
    for ranking, weight in rankings:
        for rank, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + weight / (k + rank)
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
    chosen: list[T] = []
    while pool and len(chosen) < top:
        best = max(pool, key=lambda d: lam * rel[d] - (1 - lam) * max((similarity(d, s) for s in chosen), default=0.0))
        chosen.append(best)
        pool.remove(best)
    picked = set(chosen)
    return chosen + [i for i in items if i not in picked]
