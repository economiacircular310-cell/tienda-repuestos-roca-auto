"""Catálogo de referencia: vehículos, taxonomía de piezas, marcas y almacenes.

Los datos viven en JSON junto a este módulo (se editan sin programar) y se cargan una
sola vez en estructuras inmutables con índices para consultas O(1).

Compatibilidad: cada producto lleva una sola clave ``fit``
    ``g:<generación>``   pieza de carrocería o chasis
    ``e:<motor>``        pieza de motor (sirve en todo modelo que monte ese motor)
    ``*``                universal
Un vehículo, completo o parcial, se traduce a un conjunto de claves con ``fit_keys``.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from functools import cached_property, lru_cache
from importlib import resources
from typing import Any, Literal

Tier = Literal["economico", "diario", "desempeno", "oem"]
Fuel = Literal["Gasolina", "Diésel", "Híbrido"]
TIER_ORDER: tuple[Tier, ...] = ("economico", "diario", "desempeno", "oem")


@dataclass(frozen=True, slots=True)
class Make:
    id: str
    name: str
    aliases: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Engine:
    code: str
    liters: float
    cyl: int
    layout: str
    fuel: str
    turbo: bool

    def label(self, with_code: bool = True) -> str:
        extra = " ".join(x for x in ("Turbo" if self.turbo else "", "" if self.fuel == "Gasolina" else self.fuel) if x)
        base = f"{self.liters:.1f}L {self.layout}{self.cyl}{' ' + extra if extra else ''}"
        return f"{base} · {self.code}" if with_code else base


@dataclass(frozen=True, slots=True)
class Generation:
    id: str
    code: str
    model_id: str
    start: int
    end: int
    engines: tuple[str, ...]

    def covers(self, year: int) -> bool:
        return self.start <= year <= self.end


@dataclass(frozen=True, slots=True)
class Model:
    id: str
    make_id: str
    name: str
    body: str
    aliases: tuple[str, ...]
    gens: tuple[Generation, ...]


@dataclass(frozen=True, slots=True)
class Category:
    id: str
    name: str
    short: str
    blurb: str


@dataclass(frozen=True, slots=True)
class SpecDef:
    k: str
    v: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PartType:
    id: str
    name: str
    cat: str
    syn: tuple[str, ...]
    basis: Literal["engine", "platform", "universal"]
    price: tuple[float, float]
    positions: tuple[str, ...]
    specs: tuple[SpecDef, ...]
    perf: bool
    related: tuple[str, ...]
    variants: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class TierInfo:
    id: Tier
    name: str
    short: str
    blurb: str
    mult: float
    warranty: str


@dataclass(frozen=True, slots=True)
class Brand:
    id: str
    name: str
    origin: str
    tiers: tuple[Tier, ...]
    cats: tuple[str, ...]
    types: tuple[str, ...]
    oem_makes: tuple[str, ...]
    pn: str

    def covers(self, pt: PartType) -> bool:
        return pt.id in self.types or (pt.basis != "universal" and pt.cat in self.cats)


@dataclass(frozen=True, slots=True)
class Warehouse:
    id: str
    name: str
    eta: tuple[int, int]


@dataclass(frozen=True, slots=True)
class VehicleQuery:
    """Selección de vehículo completa o parcial (garaje, consulta o VIN)."""

    make_id: str | None = None
    model_id: str | None = None
    year: int | None = None
    engine: str | None = None
    fuel: str | None = None

    @property
    def empty(self) -> bool:
        return not (self.make_id or self.model_id or self.year or self.engine or self.fuel)

    @property
    def complete(self) -> bool:
        return bool(self.make_id and self.model_id and self.year)


def _load(name: str) -> Any:
    return json.loads(resources.files(__package__).joinpath(name).read_text(encoding="utf-8"))


class Catalog:
    """Vista inmutable e indexada de los JSON del catálogo."""

    def __init__(self, vehicles: dict[str, Any], taxonomy: dict[str, Any]) -> None:
        self.min_year: int = vehicles["min_year"]
        self.max_year: int = vehicles["max_year"]
        self.makes = tuple(Make(m["id"], m["name"], tuple(m["aliases"])) for m in vehicles["makes"])
        self.engines = {
            e["code"]: Engine(e["code"], e["liters"], e["cyl"], e["layout"], e["fuel"], e["turbo"])
            for e in vehicles["engines"]
        }
        self.models = tuple(
            Model(
                m["id"],
                m["make_id"],
                m["name"],
                m["body"],
                tuple(m["aliases"]),
                tuple(
                    Generation(
                        f"{m['id']}-{g['code'].lower()}", g["code"], m["id"], g["from"], g["to"], tuple(g["engines"])
                    )
                    for g in m["gens"]
                ),
            )
            for m in vehicles["models"]
        )
        self.categories = tuple(Category(**c) for c in taxonomy["categories"])
        self.tiers = tuple(TierInfo(**t) for t in taxonomy["tiers"])
        self.part_types = tuple(
            PartType(
                id=p["id"],
                name=p["name"],
                cat=p["cat"],
                syn=tuple(p["syn"]),
                basis=p["basis"],
                price=(p["price"][0], p["price"][1]),
                positions=tuple(p.get("positions") or ()),
                specs=tuple(SpecDef(s["k"], tuple(s["v"])) for s in p["specs"]),
                perf=bool(p.get("perf")),
                related=tuple(p.get("related") or ()),
                variants=tuple(p.get("variants") or ()),
            )
            for p in taxonomy["part_types"]
        )
        self.brands = tuple(
            Brand(
                b["id"],
                b["name"],
                b["origin"],
                tuple(b["tiers"]),
                tuple(b["cats"]),
                tuple(b["types"]),
                tuple(b["oem_makes"]),
                b["pn"],
            )
            for b in taxonomy["brands"]
        )
        self.warehouses = tuple(
            Warehouse(w["id"], w["name"], (w["eta"][0], w["eta"][1])) for w in taxonomy["warehouses"]
        )
        self.oem_patterns: dict[str, str] = taxonomy["oem_patterns"]
        self.xref_brands: tuple[tuple[str, str], ...] = tuple((a, b) for a, b in taxonomy["xref_brands"])

        self.make_by_id = {m.id: m for m in self.makes}
        self.model_by_id = {m.id: m for m in self.models}
        self.generations = tuple(g for m in self.models for g in m.gens)
        self.gen_by_id = {g.id: g for g in self.generations}
        self.category_by_id = {c.id: c for c in self.categories}
        self.part_type_by_id = {p.id: p for p in self.part_types}
        self.tier_by_id: dict[str, TierInfo] = {t.id: t for t in self.tiers}
        self.brand_by_id = {b.id: b for b in self.brands}
        gens_by_engine: dict[str, list[Generation]] = defaultdict(list)
        for g in self.generations:
            for e in g.engines:
                gens_by_engine[e].append(g)
        self.gens_by_engine = {k: tuple(v) for k, v in gens_by_engine.items()}

    # ---- navegación del árbol Marca → Año → Modelo → Motor -------------------------------

    def models_of(self, make_id: str) -> tuple[Model, ...]:
        return tuple(m for m in self.models if m.make_id == make_id)

    def years_of_make(self, make_id: str) -> list[int]:
        years = {y for m in self.models_of(make_id) for g in m.gens for y in range(g.start, g.end + 1)}
        return sorted(years, reverse=True)

    def models_of_make_year(self, make_id: str, year: int) -> list[Model]:
        return [m for m in self.models_of(make_id) if any(g.covers(year) for g in m.gens)]

    def gen_for(self, model_id: str, year: int) -> Generation | None:
        """Generación de un modelo en un año; si dos se solapan (cambio de ciclo), la más nueva."""
        gens = [g for g in self.model_by_id[model_id].gens if g.covers(year)] if model_id in self.model_by_id else []
        return gens[-1] if gens else None

    def engines_for(self, model_id: str, year: int) -> list[str]:
        model = self.model_by_id.get(model_id)
        if not model:
            return []
        return list(dict.fromkeys(e for g in model.gens if g.covers(year) for e in g.engines))

    # ---- compatibilidad ---------------------------------------------------------------------

    def fit_keys(self, v: VehicleQuery) -> frozenset[str]:
        """Claves de compatibilidad que cubre un vehículo (completo o parcial)."""
        if v.model_id:
            models: tuple[Model, ...] = tuple(m for m in (self.model_by_id.get(v.model_id),) if m)
        elif v.make_id:
            models = self.models_of(v.make_id)
        else:
            models = self.models
        keys: set[str] = set()
        for m in models:
            for g in m.gens:
                if v.year and not g.covers(v.year):
                    continue
                engines = [e for e in g.engines if (not v.engine or e == v.engine)]
                if v.fuel:
                    engines = [e for e in engines if self.engines[e].fuel == v.fuel]
                if not engines:
                    continue
                keys.add(f"g:{g.id}")
                keys.update(f"e:{e}" for e in engines)
        return frozenset(keys)

    def vehicle_label(self, v: VehicleQuery, engine: bool = True) -> str:
        make = self.make_by_id[v.make_id].name if v.make_id in self.make_by_id else ""
        model = self.model_by_id[v.model_id].name if v.model_id in self.model_by_id else ""
        label = " ".join(str(x) for x in (v.year, make, model) if x)
        if engine and v.engine in self.engines:
            label += f" · {self.engines[v.engine].label(False)}"
        return label

    @cached_property
    def vehicle_config_count(self) -> int:
        """Configuraciones año + modelo + motor del catálogo."""
        return sum((g.end - g.start + 1) * len(g.engines) for g in self.generations)


@lru_cache(maxsize=1)
def load_catalog() -> Catalog:
    return Catalog(_load("vehicles.json"), _load("taxonomy.json"))


def load_json(name: str) -> Any:
    return _load(name)
