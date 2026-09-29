"""Diagnóstico por síntomas: Bayes ingenuo con desgaste Weibull.

    P(pieza | síntomas, km) ∝ P(pieza | km) · Π_s P(s | pieza)

Verosimilitud P(s | pieza)
    Pesos de taller por síntoma (catalog/symptoms.json). Si una pieza no explica un
    síntoma se usa ε = 0,03: con dos síntomas gana la pieza que explica ambos
    («chilla al frenar» + «vibra al frenar» → discos antes que pastillas).

A priori P(pieza | km): distribución de Weibull (Weibull, 1951), el estándar de la
ingeniería de confiabilidad para vida de componentes
    F(km) = 1 − exp(−(km / η)^β)
    η = vida característica de la pieza; β = forma: > 1 desgaste progresivo (pastillas,
    filtros, amortiguadores), ≈ 1 fallas aleatorias (electrónica). Se suaviza con 0,25
    para no descartar nunca una causa por ser «nueva».

Los kilómetros se estiman por la antigüedad (15 000 km/año) si el cliente no los indica.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..catalog import Catalog, load_json
from ..search.text import Token, damerau, tokenize, typo_budget

_EPSILON = 0.03
_BETA_BY_CAT = {
    "frenos": 2.6,
    "suspension": 2.4,
    "filtros": 3.0,
    "encendido": 2.2,
    "motor": 2.0,
    "transmision": 2.0,
    "enfriamiento": 1.8,
    "escape": 1.8,
    "carroceria": 1.5,
    "iluminacion": 1.3,
    "electrico": 1.3,
    "climatizacion": 1.3,
    "combustible": 1.5,
}


@dataclass(frozen=True, slots=True)
class Symptom:
    id: str
    label: str
    phrases: tuple[str, ...]
    causes: tuple[tuple[str, float], ...]
    advice: str


@dataclass(frozen=True, slots=True)
class Cause:
    part_type_id: str
    name: str
    p: float
    wear: float


@dataclass(frozen=True, slots=True)
class Diagnosis:
    symptoms: tuple[Symptom, ...]
    km: int
    km_estimated: bool
    causes: tuple[Cause, ...]

    @property
    def label(self) -> str:
        return " + ".join(s.label for s in self.symptoms)

    @property
    def advice(self) -> str:
        return " ".join(s.advice for s in self.symptoms)


def weibull_cdf(km: float, eta: float, beta: float) -> float:
    return 1 - math.exp(-((km / eta) ** beta))


class Diagnostician:
    def __init__(self, catalog: Catalog, km_per_year: int = 15_000) -> None:
        data = load_json("symptoms.json")
        self.catalog = catalog
        self.km_per_year = km_per_year
        self.life: dict[str, float] = data["service_life"]
        self.symptoms = tuple(
            Symptom(s["id"], s["label"], tuple(s["phrases"]), tuple((c[0], c[1]) for c in s["causes"]), s["advice"])
            for s in data["symptoms"]
        )
        self.by_id = {s.id: s for s in self.symptoms}
        self._phrases = [(s, [t.s for t in tokenize(ph) if not t.is_stop]) for s in self.symptoms for ph in s.phrases]

    def estimate_km(self, year: int | None) -> int:
        if not year:
            return 60_000
        return max(5_000, round((self.catalog.max_year - year + 0.5) * self.km_per_year))

    def find(self, tokens: list[Token]) -> list[tuple[Symptom, list[Token]]]:
        """Síntomas presentes en la consulta, sin reutilizar palabras entre ellos."""
        content = [t for t in tokens if not t.is_stop]
        found: list[tuple[Symptom, list[Token]]] = []
        used_all: set[int] = set()
        while True:
            best: tuple[float, Symptom, list[Token]] | None = None
            for sym, words in self._phrases:
                if not words or any(sym is f[0] for f in found):
                    continue
                used: list[Token] = []
                for w in words:
                    hit = next(
                        (
                            t
                            for t in content
                            if t not in used
                            and (
                                t.s == w
                                or (len(w) >= 5 and damerau(t.s, w, typo_budget(len(w))) <= typo_budget(len(w)))
                            )
                        ),
                        None,
                    )
                    if hit:
                        used.append(hit)
                need = len(words) - 1 if len(words) >= 3 else len(words)
                # Palabras de contexto («frenar») se comparten; cada síntoma aporta al menos una propia
                if len(used) < need or all(id(t) in used_all for t in used):
                    continue
                score = len(used) + len(used) / len(words)
                if best is None or score > best[0]:
                    best = (score, sym, used)
            if best is None:
                return found
            found.append((best[1], best[2]))
            used_all.update(id(t) for t in best[2])

    def diagnose(
        self,
        symptom_ids: list[str],
        year: int | None = None,
        km: int | None = None,
        available: set[str] | None = None,
    ) -> Diagnosis | None:
        symptoms = tuple(self.by_id[s] for s in symptom_ids if s in self.by_id)
        if not symptoms:
            return None
        k = km if km is not None else self.estimate_km(year)
        candidates = {pt for s in symptoms for pt, _ in s.causes}
        if available is not None:
            candidates &= available
        posts: list[tuple[str, float, float]] = []
        for pt in candidates:
            part = self.catalog.part_type_by_id[pt]
            wear = weibull_cdf(k, self.life.get(pt, 120_000), _BETA_BY_CAT.get(part.cat, 2.0))
            likelihood = math.prod(dict(s.causes).get(pt, _EPSILON) for s in symptoms)
            posts.append((pt, likelihood * (0.25 + 0.75 * wear), wear))
        total = sum(p for _, p, _ in posts) or 1.0
        causes = tuple(
            sorted(
                (Cause(pt, self.catalog.part_type_by_id[pt].name, p / total, round(w, 3)) for pt, p, w in posts),
                key=lambda c: -c.p,
            )
        )
        return Diagnosis(symptoms, k, km is None, causes)
