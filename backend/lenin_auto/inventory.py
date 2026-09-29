"""Inventario de demostración, determinista: misma semilla, mismos productos.

Por cada grupo (tipo de pieza × clave de compatibilidad × posición × variante) se arma un
plan de niveles al estilo RockAuto —económico, uso diario, a veces alto desempeño y
original— y se eligen marcas que realmente fabrican esa pieza. El número OEM es común al
grupo: por eso buscar un OEM devuelve todas las equivalentes.

El inventario real llega por ``importer.py`` (CSV de tu ERP o proveedor) como una
instantánea JSON; con ``LENIN_INVENTORY`` apuntando a ella, la tienda la usa en lugar de la
demostración, con los mismos índices, modelos y garantías.
"""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Any, TypeVar

from .catalog import TIER_ORDER, UNIVERSAL, Brand, Catalog, Generation, PartType, Tier, load_catalog
from .config import settings
from .search.text import norm_pn

Rng = Callable[[], float]
T = TypeVar("T")
_LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"
_MASK = 0xFFFFFFFF
_WARRANTY = re.compile(r"\s*(\d+(?:[.,]\d+)?)\s*(mes|month)?")


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = (h * 0x01000193) & _MASK
    return h


def mulberry32(seed: int) -> Rng:
    """Generador pseudoaleatorio de 32 bits, rápido y reproducible entre plataformas."""
    state = seed & _MASK

    def rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & _MASK
        t = ((state ^ (state >> 15)) * (1 | state)) & _MASK
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & _MASK)) & _MASK) ^ t
        return ((t ^ (t >> 14)) & _MASK) / 4294967296

    return rand


def _fill(pattern: str, r: Rng) -> str:
    return "".join(
        str(int(r() * 10)) if ch == "#" else _LETTERS[int(r() * len(_LETTERS))] if ch == "@" else ch for ch in pattern
    )


def _pick(items: list[T] | tuple[T, ...], r: Rng) -> T:
    return items[int(r() * len(items))]


def _price(p: float, r: Rng) -> float:
    return max(2.99, math.floor(p) + (0.99 if r() < 0.55 else 0.49))


def popularity(rating: float, reviews: int, in_stock: bool, tier: str) -> int:
    return round(reviews * (rating / 5) + (40 if in_stock else 0) + (25 if tier == "diario" else 0))


@dataclass(slots=True)
class Product:
    i: int
    id: str
    part_number: str
    pn_key: str
    brand_id: str
    part_type_id: str
    cat_id: str
    tier: Tier
    position: str | None
    variant: str | None
    title: str
    price: float
    list_price: float | None
    closeout: bool
    stock: tuple[int, ...]
    rating: float
    reviews: int
    fits: frozenset[str]
    oem: tuple[str, ...]
    xref: tuple[str, ...]
    specs: tuple[tuple[str, str], ...]
    warranty: str
    popularity: int

    @property
    def stock_total(self) -> int:
        return sum(self.stock)

    @property
    def in_stock(self) -> bool:
        return self.stock_total > 0

    @property
    def on_sale(self) -> bool:
        return bool(self.list_price) or self.closeout

    @property
    def discount_pct(self) -> int:
        return round((1 - self.price / self.list_price) * 100) if self.list_price else 0

    @property
    def universal(self) -> bool:
        return UNIVERSAL in self.fits

    def fits_any(self, keys: frozenset[str]) -> bool:
        """¿Sirve en alguna de las configuraciones de un vehículo? (``Catalog.fit_keys``)."""
        return UNIVERSAL in self.fits or not keys.isdisjoint(self.fits)

    @property
    def fit_id(self) -> str:
        """Forma canónica de la compatibilidad (claves ordenadas)."""
        return "+".join(sorted(self.fits))

    @property
    def group_key(self) -> str:
        """Opciones intercambiables: misma compatibilidad, tipo, posición y variante."""
        return f"{self.fit_id}|{self.part_type_id}|{self.position or ''}|{self.variant or ''}"

    @property
    def warranty_years(self) -> float:
        """«2 años» → 2 · «18 meses» → 1.5 · «de por vida» → 10."""
        w = self.warranty.lower()
        if "vida" in w or "lifetime" in w:
            return 10.0
        m = _WARRANTY.match(w)
        if not m:
            return 1.0
        n = float(m.group(1).replace(",", "."))
        return n / 12 if m.group(2) else n


@dataclass(frozen=True, slots=True)
class _Group:
    pt: PartType
    fit: str
    make_id: str | None
    position: str | None
    variant: str | None
    size: float


class InventoryBuilder:
    _OWN_OEM = frozenset({"mobis", "acdelco", "motorcraft", "mopar"})

    def __init__(self, catalog: Catalog) -> None:
        self.c = catalog

    def _engine_allowed(self, pt: PartType, code: str) -> bool:
        e = self.c.engines[code]
        diesel = e.fuel == "Diésel"
        if pt.id in {"bujia", "bobina", "cuerpo-aceleracion", "sensor-oxigeno"}:
            return not diesel
        if pt.id == "cables-bujia":
            oldest = min(g.start for g in self.c.gens_by_engine[code])
            return not diesel and oldest < 2012 and e.cyl <= 4
        if pt.id == "kit-embrague":
            return e.cyl < 8 and e.fuel != "Híbrido"
        if pt.id == "motor-arranque":
            return e.fuel != "Híbrido"
        return True

    def _rear_drum(self, g: Generation) -> bool:
        m = self.c.model_by_id[g.model_id]
        max_l = max(self.c.engines[e].liters for e in g.engines)
        return m.body == "Pickup" or (m.body != "SUV" and max_l <= 1.6)

    def _groups(self) -> Iterator[_Group]:
        c = self.c
        for pt in c.part_types:
            if pt.basis == "universal":
                for v in pt.variants or ("",):
                    yield _Group(pt, "*", None, None, v or None, 1.0)
            elif pt.basis == "engine":
                for code, gens in c.gens_by_engine.items():
                    if self._engine_allowed(pt, code):
                        make = c.model_by_id[gens[0].model_id].make_id
                        size = 1 + max(0.0, c.engines[code].liters - 1.6) * 0.08
                        yield _Group(pt, f"e:{code}", make, None, None, size)
            else:
                for g in c.generations:
                    m = c.model_by_id[g.model_id]
                    drum = self._rear_drum(g)
                    if pt.id == "zapatas-freno" and not drum:
                        continue
                    size = 1.22 if m.body == "Pickup" else 1.12 if m.body == "SUV" else 1.0
                    for pos in pt.positions or (None,):
                        if drum and pos == "Trasero" and pt.id in {"pastillas-freno", "disco-freno"}:
                            continue
                        yield _Group(pt, f"g:{g.id}", m.make_id, pos, None, size)

    def _offers(self, grp: _Group, r: Rng) -> list[tuple[Brand, Tier]]:
        pt = grp.pt
        if pt.basis == "universal":
            out: list[tuple[Brand, Tier]] = []
            for b in self.c.brands:
                if pt.id in b.types and (r() < 0.8 or b.id == "lac-value"):
                    out.append((b, "diario" if "diario" in b.tiers else b.tiers[0]))
            return out
        plan: list[Tier] = ["economico", "diario"]
        if r() < 0.3:
            plan.append("diario")
        if pt.perf and r() < 0.72:
            plan.append("desempeno")
        if r() < 0.5:
            plan.append("oem")
        taken: set[str] = set()
        offers: list[tuple[Brand, Tier]] = []
        for tier in plan:
            cands = [
                b
                for b in self.c.brands
                if b.id not in taken
                and tier in b.tiers
                and b.covers(pt)
                and (tier != "oem" or (grp.make_id is not None and grp.make_id in b.oem_makes))
            ]
            if not cands:
                continue
            house = next((b for b in cands if b.id == "lac-value"), None)
            brand = house if tier == "economico" and house and r() < 0.3 else _pick(cands, r)
            taken.add(brand.id)
            offers.append((brand, tier))
        return offers

    def build(self) -> list[Product]:
        c = self.c
        products: list[Product] = []
        used: set[str] = set()

        def unique_pn(pattern: str, r: Rng) -> str:
            for _ in range(12):
                pn = _fill(pattern, r)
                if norm_pn(pn) not in used:
                    used.add(norm_pn(pn))
                    return pn
            pn = f"{_fill(pattern, r)}-{int(r() * 90 + 10)}"
            used.add(norm_pn(pn))
            return pn

        for grp in self._groups():
            pt = grp.pt
            r = mulberry32(fnv1a(f"{pt.id}|{grp.fit}|{grp.position or ''}|{grp.variant or ''}"))
            offers = self._offers(grp, r)
            if not offers:
                continue
            oem: list[str] = []
            if grp.make_id and pt.basis != "universal":
                oem.append(_fill(c.oem_patterns[grp.make_id], r))
                if r() < 0.28:
                    oem.append(_fill(c.oem_patterns[grp.make_id], r))
            lo, hi = pt.price
            base = (lo + (hi - lo) * (0.2 + 0.45 * r())) * grp.size

            for brand, tier in offers:
                t = c.tier_by_id[tier]
                price = _price(base * t.mult * (0.9 + 0.2 * r()), r)
                list_price: float | None = None
                closeout = r() < 0.045
                if closeout:
                    price = _price(price * 0.78, r)
                elif r() < 0.15:
                    list_price = _price(price * (1.15 + r() * 0.3), r)
                if brand.id in self._OWN_OEM and oem and norm_pn(oem[0]) not in used:
                    used.add(norm_pn(oem[0]))
                    pn = oem[0]
                else:
                    pn = unique_pn(brand.pn, r)
                stock = tuple(1 + int(r() * r() * 48) if r() < 0.56 else 0 for _ in c.warehouses)
                rating = min(5.0, round((3.5 + r() * 1.5 - (0.25 if tier == "economico" else 0)) * 10) / 10)
                reviews = int(r() ** 2.2 * 900) + (12 if tier == "diario" else 0)
                if not reviews:
                    rating = 0.0  # sin reseñas no hay calificación que mostrar (los modelos ya la ignoran)
                specs: list[tuple[str, str]] = [(s.k, _pick(s.v, r)) for s in pt.specs]
                if grp.variant:
                    specs.insert(0, ("Especificación", grp.variant))
                if grp.position:
                    specs.insert(0, ("Posición", grp.position))
                specs += [("Origen de la marca", brand.origin), ("Garantía", t.warranty)]
                lead = next((v for k, v in specs if pt.specs and k == pt.specs[0].k), None)
                title = f"{pt.name}{' ' + grp.variant if grp.variant else ''}{' · ' + lead if lead else ''}"
                xref: tuple[str, ...] = ()
                if r() < 0.6:
                    xb, xp = _pick(c.xref_brands, r)
                    xref = (f"{xb} {_fill(xp, r)}",)
                key = norm_pn(pn)
                products.append(
                    Product(
                        i=len(products),
                        id=f"{brand.id}-{key.lower()}",
                        part_number=pn,
                        pn_key=key,
                        brand_id=brand.id,
                        part_type_id=pt.id,
                        cat_id=pt.cat,
                        tier=tier,
                        position=grp.position,
                        variant=grp.variant,
                        title=title,
                        price=price,
                        list_price=list_price,
                        closeout=closeout,
                        stock=stock,
                        rating=rating,
                        reviews=reviews,
                        fits=frozenset({grp.fit}),
                        oem=tuple(oem),
                        xref=xref,
                        specs=tuple(specs),
                        warranty=t.warranty,
                        popularity=popularity(rating, reviews, any(stock), tier),
                    )
                )
        return products


class Inventory:
    def __init__(self, products: list[Product], catalog: Catalog) -> None:
        self.products = products
        self.catalog = catalog
        self.by_id = {p.id: p for p in products}

    def __len__(self) -> int:
        return len(self.products)

    def __iter__(self) -> Iterator[Product]:
        return iter(self.products)

    @cached_property
    def by_type(self) -> dict[str, list[Product]]:
        out: dict[str, list[Product]] = {}
        for p in self.products:
            out.setdefault(p.part_type_id, []).append(p)
        return out

    @cached_property
    def groups(self) -> dict[str, list[Product]]:
        out: dict[str, list[Product]] = {}
        for p in self.products:
            out.setdefault(p.group_key, []).append(p)
        return out

    def fitment_rows(self, p: Product) -> list[dict[str, object]]:
        """Vehículos donde entra una pieza: una fila por generación y tramo de años con los
        mismos motores, reconstruida exactamente desde sus claves de compatibilidad."""
        c = self.catalog
        if p.universal:
            return []
        by_gen: dict[str, dict[int, set[str]]] = defaultdict(lambda: defaultdict(set))
        for key in p.fits:
            for cfg in c.configs_of_key(key):
                by_gen[cfg.gen.id][cfg.year].add(cfg.engine)
        rows: list[dict[str, object]] = []
        for gen_id, years in by_gen.items():
            g = c.gen_by_id[gen_id]
            m = c.model_by_id[g.model_id]
            run: list[int] = []
            for y in sorted(years):
                if run and (y != run[-1] + 1 or years[y] != years[run[0]]):
                    rows.append(self._row(m.make_id, m.id, g, run, years[run[0]]))
                    run = []
                run.append(y)
            rows.append(self._row(m.make_id, m.id, g, run, years[run[0]]))
        return sorted(rows, key=lambda r: (str(r["make"]), str(r["model"]), r["years"]))

    def _row(
        self, make_id: str, model_id: str, g: Generation, years: list[int], engines: set[str]
    ) -> dict[str, object]:
        c = self.catalog
        return {
            "make_id": make_id,
            "make": c.make_by_id[make_id].name,
            "model_id": model_id,
            "model": c.model_by_id[model_id].name,
            "generation": g.code,
            "years": [years[0], years[-1]],
            "engines": [c.engines[e].label() for e in g.engines if e in engines],
        }


# ---------------------------------------------------------------------- instantáneas JSON

SNAPSHOT_FORMAT = "lenin-auto/inventario@1"


def brand_record(b: Brand) -> dict[str, Any]:
    return {
        "id": b.id,
        "name": b.name,
        "origin": b.origin,
        "tiers": list(b.tiers),
        "cats": list(b.cats),
        "types": list(b.types),
        "oem_makes": list(b.oem_makes),
        "pn": b.pn,
    }


def brand_from_record(b: dict[str, Any]) -> Brand:
    return Brand(
        b["id"],
        b["name"],
        b["origin"],
        tuple(b["tiers"]),
        tuple(b["cats"]),
        tuple(b["types"]),
        tuple(b["oem_makes"]),
        b["pn"],
    )


def product_record(p: Product) -> dict[str, Any]:
    return {
        "part_number": p.part_number,
        "brand_id": p.brand_id,
        "part_type_id": p.part_type_id,
        "tier": p.tier,
        "position": p.position,
        "variant": p.variant,
        "title": p.title,
        "price": p.price,
        "list_price": p.list_price,
        "closeout": p.closeout,
        "stock": list(p.stock),
        "rating": p.rating,
        "reviews": p.reviews,
        "fits": sorted(p.fits),
        "oem": list(p.oem),
        "xref": list(p.xref),
        "specs": [list(kv) for kv in p.specs],
        "warranty": p.warranty,
    }


def make_product(i: int, rec: dict[str, Any], catalog: Catalog) -> Product:
    """Arma un ``Product`` desde un registro, derivando los campos calculados."""
    pt = catalog.part_type_by_id[rec["part_type_id"]]
    if rec["tier"] not in TIER_ORDER:
        raise ValueError(f"nivel desconocido: {rec['tier']}")
    stock = tuple(int(x) for x in rec["stock"])
    key = norm_pn(rec["part_number"])
    return Product(
        i=i,
        id=f"{rec['brand_id']}-{key.lower()}",
        part_number=rec["part_number"],
        pn_key=key,
        brand_id=rec["brand_id"],
        part_type_id=pt.id,
        cat_id=pt.cat,
        tier=rec["tier"],
        position=rec["position"],
        variant=rec["variant"],
        title=rec["title"],
        price=float(rec["price"]),
        list_price=float(rec["list_price"]) if rec["list_price"] else None,
        closeout=bool(rec["closeout"]),
        stock=stock,
        rating=float(rec["rating"]),
        reviews=int(rec["reviews"]),
        fits=frozenset(rec["fits"]),
        oem=tuple(rec["oem"]),
        xref=tuple(rec["xref"]),
        specs=tuple((str(k), str(v)) for k, v in rec["specs"]),
        warranty=rec["warranty"],
        popularity=popularity(float(rec["rating"]), int(rec["reviews"]), any(stock), rec["tier"]),
    )


def save_snapshot(path: str | Path, products: Iterable[Product], brands: Iterable[Brand], source: str = "") -> None:
    data = {
        "format": SNAPSHOT_FORMAT,
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": source,
        "brands": [brand_record(b) for b in brands],
        "products": [product_record(p) for p in products],
    }
    Path(path).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def load_snapshot(path: str | Path, catalog: Catalog) -> list[Product]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("format") != SNAPSHOT_FORMAT:
        raise ValueError(f"{path}: no es una instantánea de inventario ({SNAPSHOT_FORMAT})")
    catalog.add_brands([brand_from_record(b) for b in data["brands"]])
    return [make_product(i, rec, catalog) for i, rec in enumerate(data["products"])]


@lru_cache(maxsize=1)
def load_inventory() -> Inventory:
    """El inventario importado (``LENIN_INVENTORY``) o, sin él, el de demostración."""
    catalog = load_catalog()
    products = load_snapshot(settings.inventory, catalog) if settings.inventory else InventoryBuilder(catalog).build()
    return Inventory(products, catalog)
