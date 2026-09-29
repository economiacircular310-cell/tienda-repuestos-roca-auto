"""Motor de búsqueda del inventario.

Tubería de una consulta:

    consulta ─► intérprete ─┬─► número de parte / OEM / referencia cruzada (mapa exacto)
                            ├─► síntomas ──► diagnóstico bayesiano ──► tipos de pieza probables
                            ├─► vehículo, pieza, posición, nivel, precio ──► filtros
                            └─► texto libre ──► BM25F con variantes por palabra:
                                                  exacta 1.0 · prefijo 0.8 (última palabra)
                                                  SymSpell 0.7/0.5 · fonética española 0.75
    candidatos ─► filtros + facetas disyuntivas: álgebra de conjuntos de bits (un entero de
                  Python con un bit por producto; AND/OR/popcount en C)
               ─► ranking: Reciprocal Rank Fusion de relevancia textual, probabilidad de
                  diagnóstico, compatibilidad, calidad bayesiana y disponibilidad
               ─► diversificación MMR de la primera página (marcas y niveles variados)
"""

from __future__ import annotations

import math
import time
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
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
            for k in p.fits:
                self.types_by_fit[k].add(p.part_type_id)

        # Calidad a priori: calificación bayesiana × log(reseñas)
        self.quality = [ratings.adjusted(p.rating, p.reviews) * math.log1p(p.reviews + 1) for p in self.products]
        self._completions = self._build_completions()

        # Conjuntos de bits: un entero de Python con un bit por producto. Filtrar y contar
        # facetas disyuntivas es AND/OR/popcount en C en lugar de un bucle por producto.
        n = len(self.products)
        self._n = n
        self._all = (1 << n) - 1
        per_dim: dict[Dim, dict[str, list[int]]] = {d: defaultdict(list) for d in DIMS}
        per_key: dict[str, list[int]] = defaultdict(list)
        for p in self.products:
            for d, v in zip(DIMS, (p.cat_id, p.part_type_id, p.brand_id, p.tier, p.position), strict=True):
                if v:
                    per_dim[d][v].append(p.i)
            for k in p.fits:
                per_key[k].append(p.i)
        self._dim_bits = {d: {v: _bitset(ix, n) for v, ix in vals.items()} for d, vals in per_dim.items()}
        self._key_bits = {k: _bitset(ix, n) for k, ix in per_key.items()}
        self._stock_bits = _bitset((p.i for p in self.products if p.in_stock), n)
        self._sale_bits = _bitset((p.i for p in self.products if p.on_sale), n)
        self._fit_masks: dict[frozenset[str], int] = {}
        self._price = [p.price for p in self.products]
        self._by_price = sorted(range(n), key=self._price.__getitem__)
        self._sorted_prices = [self._price[i] for i in self._by_price]
        # claves de orden precalculadas (mismos valores que antes: el orden resultante es idéntico)
        self._quality_key = [-q for q in self.quality]
        self._stock_key = [(not p.in_stock, -p.stock_total) for p in self.products]
        self._rating_key = [-ratings.adjusted(p.rating, p.reviews) for p in self.products]
        self._tier_key = [(TIER_ORDER.index(p.tier), p.price) for p in self.products]
        self._universal = [p.universal for p in self.products]
        self._brand = [p.brand_id for p in self.products]
        self._tier = [p.tier for p in self.products]
        self._part_type = [p.part_type_id for p in self.products]
        # órdenes globales estables: para candidatos en orden de índice equivalen a ordenarlos
        self._quality_order = sorted(range(n), key=self._quality_key.__getitem__)
        self._stock_order = sorted(range(n), key=self._stock_key.__getitem__)
        self.build_ms = (time.perf_counter() - t0) * 1000

    # ------------------------------------------------------------------ utilidades

    def _fit_mask(self, keys: frozenset[str]) -> int:
        """Productos que sirven en alguna configuración del vehículo (memorizado por vehículo)."""
        mask = self._fit_masks.get(keys)
        if mask is None:
            mask = self._key_bits.get("*", 0)
            if len(keys) < len(self._key_bits):
                for k in keys:
                    mask |= self._key_bits.get(k, 0)
            else:
                for k, bits in self._key_bits.items():
                    if k in keys:
                        mask |= bits
            if len(self._fit_masks) >= 512:
                self._fit_masks.clear()
            self._fit_masks[keys] = mask
        return mask

    def _price_mask(self, lo: float | None, hi: float | None) -> int:
        a = bisect_left(self._sorted_prices, lo) if lo is not None else 0
        b = bisect_right(self._sorted_prices, hi) if hi is not None else self._n
        return _bitset(self._by_price[a:b], self._n)

    @staticmethod
    def _union(bits: dict[str, int], values: Iterable[str]) -> int:
        mask = 0
        for v in values:
            mask |= bits.get(v, 0)
        return mask

    def lookup_pn(self, key: str) -> tuple[PNKind, list[int]] | None:
        return self.exact.get(key)

    def _build_completions(self) -> list[tuple[str, str, int]]:
        c = self.c
        by_type = Counter(p.part_type_id for p in self.products)
        by_cat = Counter(p.cat_id for p in self.products)
        by_brand = Counter(p.brand_id for p in self.products)
        by_fit = Counter(k for p in self.products for k in p.fits)
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

        # candidatos (texto / número de parte), síntomas y palabras de posición
        cand = self._all if scores is None else _bitset(scores, self._n)
        if symptom_types is not None:
            cand &= self._union(self._dim_bits["partType"], symptom_types)
        if pos_words:
            cand &= self._union(
                self._dim_bits["position"],
                (v for v in self._dim_bits["position"] if any(w in v.lower() for w in pos_words)),
            )
        dim_ok = {d: self._union(self._dim_bits[d], sel[d]) if sel[d] else self._all for d in DIMS}
        price_ok = self._all if pmin is None and pmax is None else self._price_mask(pmin, pmax)
        stock_ok = self._stock_bits if req.in_stock else self._all
        sale_ok = self._sale_bits if req.on_sale else self._all
        fit = self._all if fit_keys is None else self._fit_mask(fit_keys)
        dims_all = self._all
        for d in DIMS:
            dims_all &= dim_ok[d]
        base = cand & fit
        passing = base & dims_all & price_ok & stock_ok & sale_ok
        hidden = (cand & ~fit & dims_all & price_ok & stock_ok & sale_ok).bit_count()
        # faceta disyuntiva: cuenta lo que pasa todos los filtros menos el de su propia dimensión
        counts: dict[Dim, Counter[str]] = {}
        for d in DIMS:
            others = base & price_ok & stock_ok & sale_ok
            for d2 in DIMS:
                if d2 != d:
                    others &= dim_ok[d2]
            counts[d] = Counter({v: n for v, bits in self._dim_bits[d].items() if (n := (others & bits).bit_count())})
        in_stock_n = (base & dims_all & price_ok & sale_ok & self._stock_bits).bit_count()
        on_sale_n = (base & dims_all & price_ok & stock_ok & self._sale_bits).bit_count()
        price_pool = base & dims_all & stock_ok & sale_ok
        if scores is None:
            order = _indices(passing)
        else:
            keep = set(_indices(passing))
            order = [i for i in scores if i in keep]
        same = price_pool == passing and scores is None  # sin filtro de precio: los mismos índices
        prices = [self._price[i] for i in (order if same else _indices(price_pool))]
        vehicle_fit = fit_keys is not None
        score_of: dict[int, float] = {}
        if req.size == 0:  # solo conteos (portada, facetas): el orden no importa
            ordered = order
        else:
            ordered, score_of = self._rank(
                order, scores, vehicle_fit, req, symptom_types, has_text=bool(words) or scores is not None
            )
        # solo se materializa la página pedida
        page: list[Hit] = []
        for i in ordered[req.page * req.size : (req.page + 1) * req.size]:
            p = self.products[i]
            fits = vehicle_fit and not self._universal[i]
            page.append(Hit(p, score_of.get(i, 0.0), fits, self.marks(p.title, highlight)))
        return SearchResult(
            request=req,
            parsed=parsed,
            total=len(ordered),
            hits=page,
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
        ids: list[int],
        scores: dict[int, float] | None,
        vehicle_fit: bool,
        req: SearchRequest,
        symptom_types: dict[str, float] | None,
        has_text: bool,
    ) -> tuple[list[int], dict[int, float]]:
        """Orden final de los resultados y la puntuación que se informa de cada uno.

        Todas las claves de orden son listas o diccionarios precalculados (``__getitem__`` en C)
        con los mismos valores que antes; el ordenamiento de Python es estable, así que el
        resultado es idéntico al de comparar producto por producto.
        """
        plain = scores or {}
        if req.sort == "precio-asc":
            return sorted(ids, key=self._price.__getitem__), plain
        if req.sort == "precio-desc":
            return sorted(ids, key=self._price.__getitem__, reverse=True), plain
        if req.sort == "valoracion":
            return sorted(ids, key=self._rating_key.__getitem__), plain
        if req.sort == "nivel":
            return sorted(ids, key=self._tier_key.__getitem__), plain
        if not ids:
            return ids, plain

        if scores is None and len(ids) * 4 >= self._n:
            member = set(ids)  # candidatos en orden de índice: filtrar el orden global es lo mismo
            by_quality = [i for i in self._quality_order if i in member]
            by_stock = [i for i in self._stock_order if i in member]
        else:
            by_quality = sorted(ids, key=self._quality_key.__getitem__)
            by_stock = sorted(ids, key=self._stock_key.__getitem__)
        rankings: list[tuple[list[int], float]] = [(by_quality, 0.35), (by_stock, 0.2)]
        if has_text:
            rankings.append((sorted(ids, key=plain.__getitem__, reverse=True), 1.0))
        if symptom_types:
            part_type = self._part_type
            dx_key = {i: symptom_types.get(part_type[i], 0) for i in ids}
            rankings.append((sorted(ids, key=dx_key.__getitem__, reverse=True), 1.2))
        if vehicle_fit:
            universal = self._universal
            if not all(universal[i] for i in ids):
                rankings.append((sorted(ids, key=universal.__getitem__), 0.5))
        fused = rrf(rankings)
        order = sorted(ids, key=fused.__getitem__, reverse=True)

        brand, tier, part_type = self._brand, self._tier, self._part_type

        def similarity(a: int, b: int) -> float:
            return 0.55 * (brand[a] == brand[b]) + 0.3 * (tier[a] == tier[b]) + 0.15 * (part_type[a] == part_type[b])

        cut = (req.page + 3) * req.size
        order = mmr(order[:cut], fused, similarity, top=(req.page + 1) * req.size) + order[cut:]
        return order, fused

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


_BYTE_BITS = tuple(tuple(b for b in range(8) if v >> b & 1) for v in range(256))


def _bitset(indices: Iterable[int], n: int) -> int:
    buf = bytearray((n + 7) // 8)
    for i in indices:
        buf[i >> 3] |= 1 << (i & 7)
    return int.from_bytes(buf, "little")


def _indices(mask: int) -> list[int]:
    """Posiciones de los bits encendidos, en orden ascendente."""
    out: list[int] = []
    for j, byte in enumerate(mask.to_bytes((mask.bit_length() + 7) // 8, "little")):
        if byte:
            base = j << 3
            out.extend(base + b for b in _BYTE_BITS[byte])
    return out


def _histogram(values: list[float], bins: int = 16) -> tuple[float, float, list[int]]:
    """Histograma de precios. La cubeta de un precio es monótona en el precio, así que con los
    valores ordenados basta buscar por bisección dónde empieza cada una: O(k log k) en C."""
    if not values:
        return (0.0, 0.0, [])
    values = sorted(values)
    lo, hi = values[0], values[-1]
    span = (hi - lo) or 1.0
    last = bins - 1

    def bucket(v: float) -> int:
        return min(last, int((v - lo) / span * bins))

    starts = [bisect_left(values, b, key=bucket) for b in range(bins)] + [len(values)]
    return (math.floor(lo), math.ceil(hi), [starts[b + 1] - starts[b] for b in range(bins)])
