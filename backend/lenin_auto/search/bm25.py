"""Índice invertido con BM25F (Robertson & Zaragoza), el modelo de relevancia de Lucene.

Cada campo aporta su frecuencia de término multiplicada por su peso (título > marca >
especificaciones) antes de saturar con BM25, así una palabra en el título pesa más que la
misma palabra repetida en una especificación. El vocabulario ordenado permite expandir
prefijos con búsqueda binaria (para completar mientras se escribe).
"""

from __future__ import annotations

import math
from bisect import bisect_left
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable


class BM25FIndex:
    def __init__(self, boosts: dict[str, float], k1: float = 1.2, b: float = 0.75) -> None:
        self.boosts = boosts
        self.k1 = k1
        self.b = b
        self.postings: dict[str, dict[int, float]] = defaultdict(dict)
        self.doc_len: dict[int, float] = {}
        self.avg_len = 1.0
        self.vocab: list[str] = []
        self._idf: dict[str, float] = {}

    def add(self, doc_id: int, fields: dict[str, Iterable[str]]) -> None:
        weighted: dict[str, float] = {}
        length = 0.0
        for name, terms in fields.items():
            w = self.boosts[name]
            for t in terms:
                weighted[t] = weighted.get(t, 0.0) + w
                length += w
        for t, tf in weighted.items():
            self.postings[t][doc_id] = tf
        self.doc_len[doc_id] = length

    def finalize(self) -> None:
        n = len(self.doc_len) or 1
        self.avg_len = sum(self.doc_len.values()) / n
        self.vocab = sorted(self.postings)
        self._idf = {t: math.log(1 + (n - len(p) + 0.5) / (len(p) + 0.5)) for t, p in self.postings.items()}

    def df(self, term: str) -> int:
        return len(self.postings.get(term, ()))

    def expand_prefix(self, prefix: str, limit: int = 48) -> list[str]:
        i = bisect_left(self.vocab, prefix)
        out: list[str] = []
        while i < len(self.vocab) and self.vocab[i].startswith(prefix) and len(out) < limit:
            out.append(self.vocab[i])
            i += 1
        return out

    def score_term(self, term: str) -> dict[int, float]:
        """Contribución BM25F de un término a cada documento que lo contiene."""
        post = self.postings.get(term)
        if not post:
            return {}
        idf = self._idf[term]
        k1, b, avg = self.k1, self.b, self.avg_len
        dl = self.doc_len
        return {d: idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl[d] / avg)) for d, tf in post.items()}

    def search(self, groups: list[list[tuple[str, float]]], require_all: bool = True) -> dict[int, float]:
        """Cada grupo es una palabra de la consulta con sus variantes ponderadas
        (exacta 1.0, prefijo, corrección, fonética). Por palabra se toma la mejor variante
        de cada documento; con ``require_all`` el documento debe cumplir todas las palabras."""
        total: dict[int, float] = {}
        hits: Counter[int] = Counter()
        for variants in groups:
            best: dict[int, float] = {}
            for term, weight in variants:
                for d, s in self.score_term(term).items():
                    v = s * weight
                    if v > best.get(d, 0.0):
                        best[d] = v
            for d, v in best.items():
                total[d] = total.get(d, 0.0) + v
                hits[d] += 1
        if require_all and len(groups) > 1:
            need = len(groups)
            return {d: s for d, s in total.items() if hits[d] == need}
        return total


def build(
    docs: Iterable[tuple[int, dict[str, str]]], boosts: dict[str, float], analyzer: Callable[[str], list[str]]
) -> BM25FIndex:
    index = BM25FIndex(boosts)
    for doc_id, fields in docs:
        index.add(doc_id, {name: analyzer(text) for name, text in fields.items()})
    index.finalize()
    return index
