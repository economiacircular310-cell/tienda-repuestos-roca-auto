"""Motor de búsqueda del inventario.

Tubería de una consulta:

    consulta ─► intérprete ─┬─► número de parte / OEM / referencia cruzada (mapa exacto)
                            ├─► síntomas ──► diagnóstico bayesiano ──► tipos de pieza probables
                            ├─► vehículo, pieza, posición, nivel, precio ──► filtros
                            └─► texto libre ──► BM25F con variantes por palabra:
                                                  exacta 1.0 · prefijo 0.8 (última palabra)
                                                  SymSpell 0.7/0.5 · fonética española 0.75
    candidatos ─► filtros + facetas disyuntivas (máscara de bits, una pasada)
               ─► ranking: Reciprocal Rank Fusion de relevancia textual, probabilidad de
                  diagnóstico, compatibilidad, calidad bayesiana y disponibilidad
               ─► diversificación MMR de la primera página (marcas y niveles variados)
"""

from __future__ import annotations

import math
import time
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from ..catalog import TIER_ORDER, Catalog, VehicleQuery
from ..inventory import Inventory, Product
from ..trust.ratings import RatingModel
from ..workshop.diagnosis import Diagnosis, Diagnostician
from . import bm25
from .fusion import mmr, rrf
from .parser import ParsedQuery, PNKind, QueryParser
from .phonetic import phonetic_key
from .symspell import SymSpell
from .text import STOPWORDS, Token, fold, index_terms, looks_like_pn, norm_pn, stem, typo_budget

Sort = Literal["relevancia", "precio-asc", "precio-desc", "valoracion", "nivel"]
Dim = Literal["category", "partType", "brand", "tier", "position"]
DIMS: tuple[Dim, ...] = ("category", "partType", "brand", "tier", "position")
_BIT: dict[str, int] = {
    "category": 1,
    "partType": 2,
    "brand": 4,
    "tier": 8,
    "position": 16,
    "price": 32,
    "stock": 64,
    "sale": 128,
}
_BOOSTS = {"t": 3.0, "b": 2.5, "s": 1.0}


@dataclass(slots=True)
class SearchRequest:
    q: str = ""
    category: list[str] = field(default_factory=list)
    part_type: list[str] = field(default_factory=list)
    brand: list[str] = field(default_factory=list)
    tier: list[str] = field(default_factory=list)
    position: list[str] = field(default_factory=list)
    price_min: float | None = None
    price_max: float | None = None
    in_stock: bool = False
    on_sale: bool = False
    vehicle: VehicleQuery | None = None
    fit_only: bool = True
    sort: Sort = "relevancia"
    page: int = 0
    size: int = 24


@dataclass(frozen=True, slots=True)
class FacetValue:
    value: str
    label: str
    count: int
    selected: bool


@dataclass(frozen=True, slots=True)
class Hit:
    product: Product
    score: float
    fits: bool
    marks: tuple[tuple[int, int], ...]


@dataclass(slots=True)
class SearchResult:
    request: SearchRequest
    parsed: ParsedQuery
    total: int
    hits: list[Hit]
    facets: dict[Dim, list[FacetValue]]
    price_hist: tuple[float, float, list[int]]
    in_stock_count: int
    on_sale_count: int
    vehicle: VehicleQuery | None
    vehicle_source: Literal["query", "garage"] | None
    hidden_by_fitment: int
    corrections: list[tuple[str, str, str]]  # (escrito, entendido, canal)
    relaxed: bool
    pn_match: tuple[PNKind, str, int] | None
    diagnosis: Diagnosis | None
    suggestions: list[str]
    took_ms: float


class SearchEngine:
    def __init__(
        self, catalog: Catalog, inventory: Inventory, ratings: RatingModel, diagnostician: Diagnostician
    ) -> None:
        t0 = time.perf_counter()
        self.c = catalog
        self.inv = inventory
        self.products = inventory.products
        self.ratings = ratings
        self.dx = diagnostician
        self.parser = QueryParser(catalog, diagnostician)

        pt_name = {p.id: p.name for p in catalog.part_types}
        brand_name = {b.id: b.name for b in catalog.brands}
        self.index = bm25.build(
            (
                (
                    p.i,
                    {
                        "t": f"{pt_name[p.part_type_id]} {p.variant or ''} {p.position or ''}",
                        "b": brand_name[p.brand_id],
                        "s": " ".join(v for _, v in p.specs),
                    },
                )
                for p in self.products
            ),
            _BOOSTS,
            index_terms,
        )

        # Vocabulario para ortografía (SymSpell) y fonética
        self.spell = SymSpell(max_distance=2)
        self.sounds: dict[str, list[str]] = defaultdict(list)
        for term in self.index.vocab:
            if len(term) >= 4 and term.isalpha():
                self.spell.add(term, self.index.df(term))
                self.sounds[phonetic_key(term)].append(term)

        # Números de parte: mapa exacto y lista para coincidencias parciales
        self.exact: dict[str, tuple[PNKind, list[int]]] = {}
        self.pn_keys: list[tuple[str, int]] = []
        xref_prefixes = tuple(f"{b} " for b, _ in catalog.xref_brands)

        def add_exact(key: str, kind: PNKind, i: int) -> None:
            cur = self.exact.get(key)
            if cur is None:
                self.exact[key] = (kind, [i])
            elif cur[0] == kind and i not in cur[1]:
                cur[1].append(i)

        for p in self.products:
            add_exact(p.pn_key, "pn", p.i)
            self.pn_keys.append((p.pn_key, p.i))
        for p in self.products:
            for o in p.oem:
                add_exact(norm_pn(o), "oem", p.i)
                self.pn_keys.append((norm_pn(o), p.i))
            for x in p.xref:
                brand = next((b for b in xref_prefixes if x.startswith(b)), "")
                add_exact(norm_pn(x[len(brand) :]), "xref", p.i)
                self.pn_keys.append((norm_pn(x[len(brand) :]), p.i))

        self.types_by_fit: dict[str, set[str]] = defaultdict(set)
        for p in self.products:
            self.types_by_fit[p.fit].add(p.part_type_id)

        # Calidad a priori: calificación bayesiana × log(reseñas)
        self.quality = [ratings.adjusted(p.rating, p.reviews) * math.log1p(p.reviews + 1) for p in self.products]
        self._completions = self._build_completions()
        self.build_ms = (time.perf_counter() - t0) * 1000

    # ------------------------------------------------------------------ utilidades

    def lookup_pn(self, key: str) -> tuple[PNKind, list[int]] | None:
        return self.exact.get(key)

    def _build_completions(self) -> list[tuple[str, str, int]]:
        c = self.c
        by_type = Counter(p.part_type_id for p in self.products)
        by_cat = Counter(p.cat_id for p in self.products)
        by_brand = Counter(p.brand_id for p in self.products)
        by_fit = Counter(p.fit for p in self.products)
        out: list[tuple[str, str, int]] = []
        for pt in c.part_types:
            out.append((pt.name, fold(pt.name), by_type[pt.id]))
            out.extend((s, fold(s), by_type[pt.id]) for s in pt.syn if len(s) > 5)
        out.extend((cat.name, fold(cat.name), by_cat[cat.id]) for cat in c.categories)
        out.extend((b.name, fold(b.name), by_brand[b.id]) for b in c.brands)
        for m in c.models:
            text = f"{c.make_by_id[m.make_id].name} {m.name}"
            out.append((text, fold(text), sum(by_fit[k] for k in c.fit_keys(VehicleQuery(model_id=m.id)))))
        return out

    def suggest(self, q: str, limit: int = 5) -> list[str]:
        """Autocompleta la última palabra (o las dos últimas) con frases del catálogo."""
        trimmed = q.rstrip()
        if len(trimmed) < 2 or q.endswith(" "):
            return []
        words = trimmed.split()
        for n in (2, 1):
            if len(words) < n:
                continue
            head = " ".join(words[:-n])
            tail = fold(" ".join(words[-n:]))
            if len(tail) < 2:
                continue
            found: dict[str, float] = {}
            for text, f, weight in self._completions:
                if f != tail and (f.startswith(tail) or f" {tail}" in f):
                    full = f"{head} {text.lower()}".strip()
                    found[full] = max(found.get(full, 0), weight * (2 if f.startswith(tail) else 1))
            if found:
                return [t for t, _ in sorted(found.items(), key=lambda kv: -kv[1])[:limit]]
        return []

    def _variants(self, tok: Token, last: bool) -> list[tuple[str, float, str]]:
        term = tok.s
        out: list[tuple[str, float, str]] = []
        if term in self.index.postings:
            out.append((term, 1.0, "exacta"))
        if last and len(term) >= 2:
            out += [(t, 0.8, "prefijo") for t in self.index.expand_prefix(term) if t != term]
        if out or len(term) < 4:
            return out
        for s in self.spell.lookup(term, max(1, typo_budget(len(term)))):
            out.append((s.term, 0.7 if s.distance == 1 else 0.5, "ortografía"))
        for t in self.sounds.get(phonetic_key(term), ()):
            if all(t != o[0] for o in out):
                out.append((t, 0.75, "fonética"))
        return out

    def marks(self, title: str, terms: set[str]) -> tuple[tuple[int, int], ...]:
        """Rangos del título a resaltar (palabras cuyo lema empieza por un término buscado)."""
        if not terms:
            return ()
        out: list[tuple[int, int]] = []
        pos = 0
        for word in title.split():
            start = title.index(word, pos)
            pos = start + len(word)
            s = stem(fold("".join(ch for ch in word if ch.isalnum())))
            if len(s) > 1 and any(len(t) > 1 and (s.startswith(t) or (len(t) > 3 and t.startswith(s))) for t in terms):
                out.append((start, pos))
        return tuple(out)

    # ------------------------------------------------------------------ búsqueda

    def search(self, req: SearchRequest) -> SearchResult:
        t0 = time.perf_counter()
        parsed = self.parser.parse(req.q, self.lookup_pn)
        c = self.c
        scores: dict[int, float] | None = None
        highlight: set[str] = set()
        corrections: list[tuple[str, str, str]] = [(a, b, "léxico") for a, b in parsed.corrections]
        relaxed = False
        pn_match: tuple[PNKind, str, int] | None = None

        if parsed.pn:
            kind, raw, ids = parsed.pn
            scores = dict.fromkeys(ids, 1.0)
            pn_match = (kind, raw, len(ids))

        words = [t for t in parsed.text_tokens if t.f not in STOPWORDS]
        if words:
            pn_words = [t for t in words if t.s not in self.index.postings and looks_like_pn(norm_pn(t.raw))]
            words = [t for t in words if t not in pn_words]
            if pn_words:
                keys = [norm_pn(t.raw) for t in pn_words]
                found: dict[int, float] = {}
                for key, i in self.pn_keys:
                    if any(k in key for k in keys):
                        found[i] = max(found.get(i, 0.0), 1.0 if key.startswith(keys[0]) else 0.7)
                scores = found if scores is None else {i: s + found[i] for i, s in scores.items() if i in found}
            if words:
                groups = []
                for n, tok in enumerate(words):
                    variants = self._variants(tok, last=n == len(words) - 1)
                    groups.append([(t, w) for t, w, _ in variants])
                    highlight.update(t for t, _, _ in variants)
                    if variants and all(ch in ("ortografía", "fonética") for _, _, ch in variants):
                        corrections.append((tok.raw, variants[0][0], variants[0][2]))
                text = self.index.search(groups, require_all=True)
                if not text and len(groups) > 1:
                    text = self.index.search(groups, require_all=False)
                    relaxed = bool(text)
                top = max(text.values(), default=1.0) or 1.0
                text = {d: s / top for d, s in text.items()}
                scores = text if scores is None else {i: s + text[i] for i, s in scores.items() if i in text}

        for pt in parsed.part_types:
            highlight.update(stem(fold(w)) for w in c.part_type_by_id[pt].name.split() if fold(w) not in STOPWORDS)

        # vehículo: el de la consulta manda sobre el del garaje
        qv = parsed.vehicle
        vehicle = qv if qv and not qv.empty else req.vehicle
        source: Literal["query", "garage"] | None = (
            "query" if qv and not qv.empty else "garage" if req.vehicle else None
        )
        fit_keys = c.fit_keys(vehicle) if vehicle and req.fit_only else None

        # diagnóstico: solo causas con piezas para ese vehículo
        diagnosis = None
        if parsed.symptoms:
            available = None
            if fit_keys is not None:
                available = set(self.types_by_fit.get("*", ()))
                for k in fit_keys:
                    available |= self.types_by_fit.get(k, set())
            diagnosis = self.dx.diagnose(parsed.symptoms, vehicle.year if vehicle else None, available=available)
        symptom_types = (
            {cause.part_type_id: cause.p for cause in diagnosis.causes if cause.p >= 0.04}
            if diagnosis and not parsed.part_types and not req.part_type
            else None
        )
        if symptom_types:
            for pt in symptom_types:
                highlight.update(stem(fold(w)) for w in c.part_type_by_id[pt].name.split() if fold(w) not in STOPWORDS)

        sel: dict[Dim, set[str]] = {
            "category": {*req.category, *parsed.categories},
            "partType": {*req.part_type, *parsed.part_types},
            "brand": {*req.brand, *parsed.brands},
            "tier": {*req.tier, *parsed.tiers},
            "position": set(req.position),
        }
        pos_words = [w.lower() for w in parsed.positions]
        pmin = req.price_min if req.price_min is not None else parsed.price_min
        pmax = req.price_max if req.price_max is not None else parsed.price_max

        counts: dict[Dim, Counter[str]] = {d: Counter() for d in DIMS}
        hits: list[tuple[Product, float, bool]] = []
        hidden = in_stock_n = on_sale_n = 0
        prices: list[float] = []
        bit = _BIT

        candidates = (self.products[i] for i in scores) if scores is not None else iter(self.products)
        for p in candidates:
            if symptom_types is not None and p.part_type_id not in symptom_types:
                continue
            if pos_words and not (p.position and any(w in p.position.lower() for w in pos_words)):
                continue
            values = (p.cat_id, p.part_type_id, p.brand_id, p.tier, p.position)
            mask = 0
            for d, v in zip(DIMS, values, strict=True):
                if sel[d] and v not in sel[d]:
                    mask |= bit[d]
            if (pmin is not None and p.price < pmin) or (pmax is not None and p.price > pmax):
                mask |= bit["price"]
            stocked = p.in_stock
            if req.in_stock and not stocked:
                mask |= bit["stock"]
            sale = p.on_sale
            if req.on_sale and not sale:
                mask |= bit["sale"]
            if fit_keys is not None and p.fit != "*" and p.fit not in fit_keys:
                if mask == 0:
                    hidden += 1
                continue
            if mask == 0:
                hits.append((p, scores[p.i] if scores is not None else 0.0, fit_keys is not None and p.fit != "*"))
                for d, v in zip(DIMS, values, strict=True):
                    if v:
                        counts[d][v] += 1
            elif mask & (mask - 1) == 0:  # falla una sola dimensión: cuenta para esa faceta
                for d, v in zip(DIMS, values, strict=True):
                    if mask == bit[d] and v:
                        counts[d][v] += 1
            if mask & ~bit["price"] == 0:
                prices.append(p.price)
            if mask & ~bit["stock"] == 0 and stocked:
                in_stock_n += 1
            if mask & ~bit["sale"] == 0 and sale:
                on_sale_n += 1

        ordered = self._rank(hits, req, symptom_types, has_text=bool(words) or scores is not None)
        page = ordered[req.page * req.size : (req.page + 1) * req.size]
        return SearchResult(
            request=req,
            parsed=parsed,
            total=len(ordered),
            hits=[Hit(p, s, f, self.marks(p.title, highlight)) for p, s, f in page],
            facets=self._facets(counts, sel),
            price_hist=_histogram(prices),
            in_stock_count=in_stock_n,
            on_sale_count=on_sale_n,
            vehicle=vehicle,
            vehicle_source=source,
            hidden_by_fitment=hidden,
            corrections=corrections,
            relaxed=relaxed,
            pn_match=pn_match,
            diagnosis=diagnosis,
            suggestions=self.suggest(req.q),
            took_ms=round((time.perf_counter() - t0) * 1000, 2),
        )

    def _rank(
        self,
        hits: list[tuple[Product, float, bool]],
        req: SearchRequest,
        symptom_types: dict[str, float] | None,
        has_text: bool,
    ) -> list[tuple[Product, float, bool]]:
        if req.sort == "precio-asc":
            return sorted(hits, key=lambda h: h[0].price)
        if req.sort == "precio-desc":
            return sorted(hits, key=lambda h: -h[0].price)
        if req.sort == "valoracion":
            return sorted(hits, key=lambda h: -self.ratings.adjusted(h[0].rating, h[0].reviews))
        if req.sort == "nivel":
            return sorted(hits, key=lambda h: (TIER_ORDER.index(h[0].tier), h[0].price))
        if not hits:
            return hits

        ids = [h[0].i for h in hits]
        by = {h[0].i: h for h in hits}
        rankings: list[tuple[list[int], float]] = [
            (sorted(ids, key=lambda i: -self.quality[i]), 0.35),
            (sorted(ids, key=lambda i: (not self.products[i].in_stock, -self.products[i].stock_total)), 0.2),
        ]
        if has_text:
            rankings.append((sorted(ids, key=lambda i: -by[i][1]), 1.0))
        if symptom_types:
            rankings.append((sorted(ids, key=lambda i: -symptom_types.get(self.products[i].part_type_id, 0)), 1.2))
        if any(h[2] for h in hits):
            rankings.append((sorted(ids, key=lambda i: not by[i][2]), 0.5))
        fused = rrf(rankings)
        order = sorted(ids, key=lambda i: -fused[i])

        def similarity(a: int, b: int) -> float:
            pa, pb = self.products[a], self.products[b]
            return (
                0.55 * (pa.brand_id == pb.brand_id)
                + 0.3 * (pa.tier == pb.tier)
                + 0.15 * (pa.part_type_id == pb.part_type_id)
            )

        cut = (req.page + 3) * req.size
        order = mmr(order[:cut], fused, similarity, top=(req.page + 1) * req.size) + order[cut:]
        return [(by[i][0], fused[i], by[i][2]) for i in order]

    def _facets(self, counts: dict[Dim, Counter[str]], sel: dict[Dim, set[str]]) -> dict[Dim, list[FacetValue]]:
        c = self.c
        labels: dict[Dim, Callable[[str], str]] = {
            "category": lambda v: c.category_by_id[v].name,
            "partType": lambda v: c.part_type_by_id[v].name,
            "brand": lambda v: c.brand_by_id[v].name,
            "tier": lambda v: c.tier_by_id[v].name,
            "position": lambda v: v,
        }
        out: dict[Dim, list[FacetValue]] = {}
        for d in DIMS:
            values = set(counts[d]) | sel[d]
            items = [FacetValue(v, labels[d](v), counts[d][v], v in sel[d]) for v in values]
            if d == "tier":
                order: dict[str, int] = {t: n for n, t in enumerate(TIER_ORDER)}
                items.sort(key=lambda f: order.get(f.value, 99))
            else:
                items.sort(key=lambda f: (not f.selected, -f.count, f.label))
            out[d] = items
        return out

    def benchmark(self, rounds: int = 2) -> float:
        queries = [
            "pastillas de freno delanteras corolla 2016",
            "amortiguador hilux",
            "filtro aceite",
            "bujia iridio",
            "kit embrague sentra 2015 menos de 300",
            "bomba de agua g4fc",
            "balatas",
            "radiador civic 2018",
            "faro izquierdo",
            "aceite 5w-30 sintetico",
            "chilla al frenar versa 2014",
            "amortiwador",
        ]
        times = []
        for _ in range(rounds):
            for q in queries:
                t = time.perf_counter()
                self.search(SearchRequest(q=q))
                times.append((time.perf_counter() - t) * 1000)
        times.sort()
        return round(times[len(times) // 2], 2)


def _histogram(values: list[float], bins: int = 16) -> tuple[float, float, list[int]]:
    if not values:
        return (0.0, 0.0, [])
    lo, hi = min(values), max(values)
    span = (hi - lo) or 1.0
    hist = [0] * bins
    for v in values:
        hist[min(bins - 1, int((v - lo) / span * bins))] += 1
    return (math.floor(lo), math.ceil(hi), hist)
