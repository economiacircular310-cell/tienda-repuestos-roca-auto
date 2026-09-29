"""SymSpell: corrección ortográfica por borrado simétrico (Wolf Garbe, 2012).

En lugar de generar todas las ediciones posibles de la palabra buscada (inserciones,
sustituciones, transposiciones: explosivo), se precalculan solo los *borrados* de cada
término del vocabulario. Buscar es generar los borrados de la consulta y cruzarlos con
ese mapa: O(1) por candidato, del orden de un millón de veces más rápido que comparar
contra todo el vocabulario. Cada candidato se confirma con Damerau-Levenshtein.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from .text import damerau


@dataclass(frozen=True, slots=True)
class Suggestion:
    term: str
    distance: int
    count: int


class SymSpell:
    def __init__(self, max_distance: int = 2, prefix_length: int = 8) -> None:
        self.max_distance = max_distance
        self.prefix_length = prefix_length
        self.words: dict[str, int] = {}
        self._deletes: dict[str, list[str]] = defaultdict(list)

    def _edits(self, word: str, distance: int, out: set[str]) -> set[str]:
        if distance >= self.max_distance or len(word) <= 1:
            return out
        for i in range(len(word)):
            deleted = word[:i] + word[i + 1 :]
            if deleted not in out:
                out.add(deleted)
                self._edits(deleted, distance + 1, out)
        return out

    def _deletes_of(self, word: str) -> set[str]:
        key = word[: self.prefix_length]
        return self._edits(key, 0, {key})

    def add(self, term: str, count: int = 1) -> None:
        if term in self.words:
            self.words[term] += count
            return
        self.words[term] = count
        for d in self._deletes_of(term):
            self._deletes[d].append(term)

    def lookup(self, word: str, max_distance: int | None = None, limit: int = 5) -> list[Suggestion]:
        """Términos del vocabulario a distancia ≤ max_distance, los más cercanos y frecuentes primero."""
        limit_d = self.max_distance if max_distance is None else min(max_distance, self.max_distance)
        if word in self.words:
            return [Suggestion(word, 0, self.words[word])]
        seen: set[str] = set()
        found: list[Suggestion] = []
        for d in self._deletes_of(word):
            for cand in self._deletes.get(d, ()):
                if cand in seen or abs(len(cand) - len(word)) > limit_d:
                    continue
                seen.add(cand)
                dist = damerau(word, cand, limit_d)
                if dist <= limit_d:
                    found.append(Suggestion(cand, dist, self.words[cand]))
        found.sort(key=lambda s: (s.distance, -s.count, s.term))
        return found[:limit]
