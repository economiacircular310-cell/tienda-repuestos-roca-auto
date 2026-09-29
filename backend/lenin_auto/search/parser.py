"""Intérprete de consultas en lenguaje natural.

    «pastillas delanteras corolla 2016 menos de 60»
      → pieza: Pastillas de freno · posición: Delantero · vehículo: 2016 Toyota Corolla · precio ≤ 60

Orden de lectura (cada paso consume palabras y deja el resto al siguiente):
    1. rangos de precio            «menos de 60», «entre 20 y 80», «desde 100»
    2. número de parte / OEM       la frase completa o ventanas de hasta 4 palabras, normalizadas
    3. síntomas                    «chilla al frenar», «se calienta» (antes que las piezas:
                                   «luz de motor» no es la categoría Iluminación + Motor)
    4. frases del léxico           coincidencia más larga primero: modelos, marcas, piezas con
                                   sinónimos regionales, categorías, posición, nivel, combustible
    5. año, cilindrada y código de motor, resueltos contra el modelo
    6. corrección de errores       Damerau-Levenshtein contra palabras del léxico
Lo que sobra es texto libre para el índice BM25F.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from ..catalog import Catalog, VehicleQuery, load_json
from ..workshop.diagnosis import Diagnostician
from .text import STOPWORDS, Token, damerau, fold, tokenize, typo_budget

ChipKind = Literal[
    "vehicle", "engine", "fuel", "partType", "category", "brand", "position", "tier", "price", "partNumber", "symptom"
]
EntryKind = Literal["model", "make", "partType", "category", "brand", "position", "tier", "fuel"]
PNKind = Literal["pn", "oem", "xref"]
PNLookup = Callable[[str], tuple[PNKind, list[int]] | None]
Span = tuple[int, int]

_PRIORITY: tuple[EntryKind, ...] = ("model", "make", "partType", "category", "brand", "position", "tier", "fuel")
_YEAR = re.compile(r"(19[89]\d|20[0-3]\d)")
_LITERS = re.compile(r"\d\.\d")
_NUM = r"\$?\s*(\d+(?:[.,]\d+)?)"
_PRICE: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(rf"\bentre\s*{_NUM}\s*y\s*{_NUM}"), "range"),
    (re.compile(rf"(?:\bmenos de|\bpor debajo de|\bbajo|\bhasta|\bmaximo|\bmax|<)\s*{_NUM}"), "max"),
    (re.compile(rf"(?:\bmas de|\bdesde|\bminimo|\barriba de|>)\s*{_NUM}"), "min"),
)


@dataclass(frozen=True, slots=True)
class Entry:
    kind: EntryKind
    value: str
    label: str


@dataclass(slots=True)
class Chip:
    kind: ChipKind
    label: str
    spans: list[Span]
    corrected: bool = False
    without: str = ""  # la consulta sin el texto de este filtro (para su botón ×)


@dataclass(slots=True)
class ParsedQuery:
    query: str
    text_tokens: list[Token] = field(default_factory=list)
    vehicle: VehicleQuery | None = None
    part_types: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    brands: list[str] = field(default_factory=list)
    positions: list[str] = field(default_factory=list)
    tiers: list[str] = field(default_factory=list)
    price_min: float | None = None
    price_max: float | None = None
    pn: tuple[PNKind, str, list[int]] | None = None  # (tipo, texto, índices)
    symptoms: list[str] = field(default_factory=list)
    chips: list[Chip] = field(default_factory=list)
    corrections: list[tuple[str, str]] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(t.f for t in self.text_tokens)


def remove_spans(query: str, spans: list[Span]) -> str:
    out = query
    for a, b in sorted(spans, reverse=True):
        out = out[:a] + " " * (b - a) + out[b:]
    out = re.sub(r"\s+", " ", out).strip()
    out = re.sub(r"\b(de|para|del|al|el|la)$", "", out, flags=re.I).strip()
    return re.sub(r"^(al|el|la|de)\b\s*", "", out, flags=re.I).strip()


class QueryParser:
    def __init__(self, catalog: Catalog, diagnostician: Diagnostician) -> None:
        self.c = catalog
        self.dx = diagnostician
        lex = load_json("lexicon.json")
        self.noise = frozenset(lex["noise"])
        self.phrases: dict[str, list[Entry]] = {}
        self.max_len = 1

        def add(phrase: str, e: Entry) -> None:
            key = " ".join(t.s for t in tokenize(phrase) if not t.is_stop)
            if not key:
                return
            bucket = self.phrases.setdefault(key, [])
            if e not in bucket:
                bucket.append(e)
            self.max_len = max(self.max_len, key.count(" ") + 1)

        c = catalog
        for mk in c.makes:
            e = Entry("make", mk.id, mk.name)
            for p in (mk.name, *mk.aliases):
                add(p, e)
        for md in c.models:
            e = Entry("model", md.id, md.name)
            for p in (md.name, *md.aliases, f"{c.make_by_id[md.make_id].name} {md.name}"):
                add(p, e)
        for pt in c.part_types:
            e = Entry("partType", pt.id, pt.name)
            for p in (pt.name, *pt.syn):
                add(p, e)
        for cat in c.categories:
            e = Entry("category", cat.id, cat.name)
            for p in (cat.name, cat.short, *lex["category_aliases"].get(cat.id, ())):
                add(p, e)
        for br in c.brands:
            e = Entry("brand", br.id, br.name)
            for p in (br.name, re.sub(r"[^a-z0-9]", "", fold(br.name)), *lex["brand_aliases"].get(br.id, ())):
                add(p, e)
        for pos, words in lex["positions"].items():
            for w in words:
                add(w, Entry("position", pos, pos))
        for tier, words in lex["tiers"].items():
            label = c.tier_by_id[tier].name
            for w in words:
                add(w, Entry("tier", tier, label))
        for fuel, words in lex["fuels"].items():
            for w in words:
                add(w, Entry("fuel", fuel, fuel))

        self.fuzzy = [
            (k, v)
            for k, v in self.phrases.items()
            if " " not in k
            and len(k) >= 4
            and not any(ch.isdigit() for ch in k)
            and any(e.kind in ("model", "make", "partType", "brand", "category") for e in v)
        ]
        self.engine_full = {re.sub(r"[^a-z0-9]", "", fold(code)): code for code in c.engines}
        self.engine_word: dict[str, set[str]] = {}
        for code in c.engines:
            for w in re.split(r"[^a-z0-9]+", fold(code)):
                if len(w) >= 3 and any(ch.isalpha() for ch in w) and w not in STOPWORDS:
                    self.engine_word.setdefault(w, set()).add(code)

    @staticmethod
    def _pick(entries: list[Entry]) -> Entry:
        return min(entries, key=lambda e: _PRIORITY.index(e.kind))

    def parse(self, query: str, lookup_pn: PNLookup | None = None) -> ParsedQuery:
        out = ParsedQuery(query)
        folded = fold(query)
        consumed: list[Span] = []

        def free(t: Token) -> bool:
            return not any(a <= t.start and t.end <= b for a, b in consumed)

        # 1) precio
        price_spans: list[Span] = []
        for pattern, kind in _PRICE:
            for m in pattern.finditer(folded):
                nums = [float(n.replace(",", ".")) for n in m.groups() if n]
                if any(_YEAR.fullmatch(str(int(n))) for n in nums):
                    continue
                span = (m.start(), m.end())
                if any(span[0] < b and span[1] > a for a, b in consumed):
                    continue
                consumed.append(span)
                price_spans.append(span)
                if kind == "range":
                    out.price_min, out.price_max = min(nums), max(nums)
                elif kind == "max":
                    out.price_max = nums[0]
                else:
                    out.price_min = nums[0]
        if price_spans:
            lo, hi = out.price_min, out.price_max
            label = (
                f"${lo:g}–${hi:g}"
                if lo is not None and hi is not None
                else f"Hasta ${hi:g}"
                if hi is not None
                else f"Desde ${lo:g}"
            )
            out.chips.append(Chip("price", label, price_spans))

        tokens = [t for t in tokenize(query) if free(t)]

        # 2) número de parte
        if lookup_pn and tokens:
            whole = re.sub(r"[^A-Z0-9]", "", query.upper())
            hit = lookup_pn(whole) if len(whole) >= 4 else None
            if hit:
                out.pn = (hit[0], query.strip(), hit[1])
                out.chips.append(Chip("partNumber", query.strip().upper(), [(tokens[0].start, tokens[-1].end)]))
                return self._finish(out)
            for size in range(min(4, len(tokens)), 0, -1):
                for i in range(len(tokens) - size + 1):
                    window = tokens[i : i + size]
                    key = re.sub(r"[^A-Z0-9]", "", "".join(t.raw for t in window).upper())
                    if len(key) < 4 or _YEAR.fullmatch(key):
                        continue
                    hit = lookup_pn(key)
                    if hit:
                        span = (window[0].start, window[-1].end)
                        consumed.append(span)
                        out.pn = (hit[0], query[span[0] : span[1]], hit[1])
                        out.chips.append(Chip("partNumber", query[span[0] : span[1]].upper(), [span]))
                        break
                if out.pn:
                    break
            tokens = [t for t in tokens if free(t)]

        # 3) síntomas
        for sym, used in self.dx.find(tokens):
            spans = [(t.start, t.end) for t in used]
            consumed.extend(spans)
            out.symptoms.append(sym.id)
            out.chips.append(Chip("symptom", sym.label, spans))
        tokens = [t for t in tokens if free(t)]

        # 4–6) léxico, vehículo, motor, corrección
        make_id: str | None = None
        model_id: str | None = None
        year: int | None = None
        fuel: str | None = None
        liters: float | None = None
        vehicle_spans: list[Span] = []
        engine_cands: list[tuple[set[str], Span]] = []
        leftovers: list[Token] = []
        content = [t for t in tokens if not t.is_stop]

        def apply(e: Entry, span: Span, corrected: bool = False) -> None:
            nonlocal make_id, model_id, fuel
            if e.kind == "model":
                model_id = e.value
                make_id = self.c.model_by_id[e.value].make_id
                vehicle_spans.append(span)
            elif e.kind == "make":
                make_id = make_id or e.value
                vehicle_spans.append(span)
            else:
                if e.kind == "fuel":
                    fuel = e.value
                else:
                    bucket = {
                        "partType": out.part_types,
                        "category": out.categories,
                        "brand": out.brands,
                        "position": out.positions,
                        "tier": out.tiers,
                    }[e.kind]
                    if e.value not in bucket:
                        bucket.append(e.value)
                out.chips.append(Chip(e.kind, e.label, [span], corrected))

        i = 0
        while i < len(content):
            t = content[i]
            nxt = content[i + 1] if i + 1 < len(content) else None
            if _YEAR.fullmatch(t.f):
                year = int(t.f)
                vehicle_spans.append((t.start, t.end))
                i += 1
                continue
            if _LITERS.fullmatch(t.f):
                liters = float(t.f)
                vehicle_spans.append((t.start, t.end))
                i += 1
                continue
            key1 = re.sub(r"[^a-z0-9]", "", t.f)
            key2 = re.sub(r"[^a-z0-9]", "", t.f + nxt.f) if nxt else ""
            if (
                t.f == "motor"
                and nxt
                and (
                    _LITERS.fullmatch(nxt.f)
                    or re.sub(r"[^a-z0-9]", "", nxt.f) in self.engine_full
                    or nxt.f in self.engine_word
                )
            ):
                i += 1
                continue
            full = self.engine_full.get(key2) if key2 else None
            if full and nxt:
                engine_cands.append(({full}, (t.start, nxt.end)))
                i += 2
                continue
            if key1 in self.engine_full:
                engine_cands.append(({self.engine_full[key1]}, (t.start, t.end)))
                i += 1
                continue
            matched = False
            for size in range(min(self.max_len, len(content) - i), 0, -1):
                window = content[i : i + size]
                entries = self.phrases.get(" ".join(w.s for w in window))
                if entries:
                    apply(self._pick(entries), (window[0].start, window[-1].end))
                    i += size
                    matched = True
                    break
            if matched:
                continue
            if key1 in self.engine_word:
                engine_cands.append((set(self.engine_word[key1]), (t.start, t.end)))
                i += 1
                continue
            budget = typo_budget(len(t.s))
            if budget and t.f not in self.noise:
                best: tuple[int, list[Entry]] | None = None
                for word, entries in self.fuzzy:
                    if t.s[-1:] in "ao" and word[:-1] == t.s[:-1]:
                        continue  # «encendida» no es un error de «encendido»
                    d = damerau(t.s, word, budget)
                    if d <= budget and (best is None or d < best[0]):
                        best = (d, entries)
                if best:
                    e = self._pick(best[1])
                    out.corrections.append((t.raw, e.label))
                    apply(e, (t.start, t.end), corrected=True)
                    i += 1
                    continue
            if t.f not in self.noise:
                leftovers.append(t)
            i += 1

        # motor: intersección de pistas (código, cilindrada, modelo, año)
        model_engines: list[str] | None = None
        if model_id:
            model_engines = (
                self.c.engines_for(model_id, year)
                if year
                else list(dict.fromkeys(e for g in self.c.model_by_id[model_id].gens for e in g.engines))
            )
        engine_set: set[str] | None = None
        for codes, span in engine_cands:
            engine_set = codes if engine_set is None else engine_set & codes
            vehicle_spans.append(span)
        if liters is not None:
            pool = list(engine_set) if engine_set is not None else (model_engines or [])
            by_l = {e for e in pool if abs(self.c.engines[e].liters - liters) < 0.05}
            if by_l:
                engine_set = by_l
        if engine_set and model_engines:
            inter = engine_set & set(model_engines)
            engine_set = inter or engine_set
        engine = next(iter(engine_set)) if engine_set and len(engine_set) == 1 else None
        if engine and not make_id:
            make_id = next((m.make_id for m in self.c.models if any(engine in g.engines for g in m.gens)), None)

        if make_id or model_id or year or engine or fuel:
            out.vehicle = VehicleQuery(make_id, model_id, year, engine, fuel)
            if make_id or model_id or year or engine:
                label = self.c.vehicle_label(VehicleQuery(make_id, model_id, year), engine=False) or "Vehículo"
                out.chips.insert(0, Chip("vehicle", label, vehicle_spans))
                if engine:
                    out.chips.insert(1, Chip("engine", self.c.engines[engine].label(), [s for _, s in engine_cands]))
        elif engine_cands or liters is not None:
            for _, (a, b) in engine_cands:
                leftovers.extend(t for t in tokens if a <= t.start and t.end <= b)

        # con un tipo de pieza la categoría sobra (o se contradice): «motor … bujías»
        if out.part_types and out.categories:
            out.categories = []
            out.chips = [ch for ch in out.chips if ch.kind != "category"]

        out.text_tokens = sorted(leftovers, key=lambda t: t.start)
        return self._finish(out)

    @staticmethod
    def _finish(out: ParsedQuery) -> ParsedQuery:
        for chip in out.chips:
            chip.without = remove_spans(out.query, chip.spans)
        return out
