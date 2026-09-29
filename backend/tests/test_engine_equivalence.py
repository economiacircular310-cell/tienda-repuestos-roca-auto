"""Pruebas diferenciales: las estructuras rápidas del motor (conjuntos de bits, órdenes
precalculados, RRF por diccionarios, histograma por bisección) contra la definición literal,
producto por producto. Si alguna optimización cambia un solo conteo, falla aquí."""

import math
import random
from collections import Counter

import pytest

from lenin_auto.catalog import VehicleQuery
from lenin_auto.search.engine import DIMS, SearchRequest, _histogram
from lenin_auto.search.fusion import mmr, rrf
from lenin_auto.store import Store

REQUESTS = [
    SearchRequest(),
    SearchRequest(category=["frenos"], in_stock=True),
    SearchRequest(brand=["bosch", "ngk"], tier=["diario"], on_sale=False),
    SearchRequest(part_type=["pastillas-freno"], position=["Delantero"], price_min=20, price_max=60),
    SearchRequest(vehicle=VehicleQuery("toyota", "toyota-corolla", 2016, "2ZR-FE"), on_sale=True),
    SearchRequest(vehicle=VehicleQuery("nissan"), tier=["oem", "desempeno"], in_stock=True, price_max=150),
]


def _reference(store: Store, req: SearchRequest):  # type: ignore[no-untyped-def]
    """Filtros y facetas disyuntivas por definición, sin texto (todos los productos son candidatos)."""
    keys = store.catalog.fit_keys(req.vehicle) if req.vehicle else None
    sel = {
        "category": set(req.category),
        "partType": set(req.part_type),
        "brand": set(req.brand),
        "tier": set(req.tier),
        "position": set(req.position),
    }
    counts = {d: Counter() for d in DIMS}
    total = hidden = in_stock = on_sale = 0
    prices = []
    for p in store.inventory:
        values = dict(zip(DIMS, (p.cat_id, p.part_type_id, p.brand_id, p.tier, p.position), strict=True))
        fails = {d for d in DIMS if sel[d] and values[d] not in sel[d]}
        price_ok = (req.price_min is None or p.price >= req.price_min) and (
            req.price_max is None or p.price <= req.price_max
        )
        stock_ok = p.in_stock or not req.in_stock
        sale_ok = p.on_sale or not req.on_sale
        if keys is not None and not p.fits_any(keys):
            hidden += not fails and price_ok and stock_ok and sale_ok
            continue
        total += not fails and price_ok and stock_ok and sale_ok
        for d in DIMS:
            if not (fails - {d}) and price_ok and stock_ok and sale_ok and values[d]:
                counts[d][values[d]] += 1
        if not fails and stock_ok and sale_ok:
            prices.append(p.price)
        in_stock += not fails and price_ok and sale_ok and p.in_stock
        on_sale += not fails and price_ok and stock_ok and p.on_sale
    return total, hidden, in_stock, on_sale, counts, prices


@pytest.mark.parametrize("n", range(len(REQUESTS)))
def test_filtros_y_facetas_iguales_a_la_definicion(store: Store, n: int) -> None:
    req = REQUESTS[n]
    total, hidden, in_stock, on_sale, counts, prices = _reference(store, req)
    r = store.engine.search(req)
    assert (r.total, r.hidden_by_fitment, r.in_stock_count, r.on_sale_count) == (total, hidden, in_stock, on_sale)
    for d in DIMS:
        assert {f.value: f.count for f in r.facets[d] if f.count} == dict(counts[d])
    assert r.price_hist == _naive_histogram(prices)


def _naive_histogram(values: list[float], bins: int = 16):  # type: ignore[no-untyped-def]
    if not values:
        return (0.0, 0.0, [])
    lo, hi = min(values), max(values)
    span = (hi - lo) or 1.0
    hist = [0] * bins
    for v in values:
        hist[min(bins - 1, int((v - lo) / span * bins))] += 1
    return (math.floor(lo), math.ceil(hi), hist)


def test_histograma_por_biseccion() -> None:
    rnd = random.Random(7)
    for _ in range(200):
        values = [round(rnd.uniform(3, 900), 2) for _ in range(rnd.randint(1, 400))]
        if rnd.random() < 0.2:
            values = [values[0]] * len(values)  # todos iguales
        assert _histogram(values) == _naive_histogram(values)


def test_rrf_bit_a_bit_igual_a_la_definicion() -> None:
    rnd = random.Random(11)
    for _ in range(100):
        items = list(range(rnd.randint(1, 300)))
        rankings = []
        for _ in range(rnd.randint(1, 5)):
            r = items[:]
            rnd.shuffle(r)
            rankings.append((r if rnd.random() < 0.8 else r[: len(r) // 2], rnd.choice((0.2, 0.35, 0.5, 1.0, 1.2))))
        expected: dict[int, float] = {}
        for ranking, weight in rankings:
            for rank, item in enumerate(ranking, start=1):
                expected[item] = expected.get(item, 0.0) + weight / (60 + rank)
        assert rrf(rankings) == expected  # igualdad exacta de floats, no aproximada


def test_mmr_incremental_igual_a_la_definicion() -> None:
    rnd = random.Random(3)
    for _ in range(60):
        items = list(range(rnd.randint(2, 80)))
        rel = {i: rnd.random() for i in items}
        attrs = {i: (rnd.randint(0, 4), rnd.randint(0, 2)) for i in items}

        def sim(a: int, b: int, attrs: dict[int, tuple[int, int]] = attrs) -> float:
            return 0.55 * (attrs[a][0] == attrs[b][0]) + 0.3 * (attrs[a][1] == attrs[b][1])

        top = rnd.randint(1, 30)
        pool, chosen = list(items[: top * 3]), []
        lo, hi = min(rel[i] for i in pool), max(rel[i] for i in pool)
        norm = {i: (rel[i] - lo) / ((hi - lo) or 1.0) for i in pool}
        while pool and len(chosen) < top:
            best = max(pool, key=lambda d: 0.5 * norm[d] - 0.5 * max((sim(d, s) for s in chosen), default=0.0))
            chosen.append(best)
            pool.remove(best)
        expected = chosen + [i for i in items if i not in set(chosen)]
        assert mmr(items, rel, sim, top=top) == expected
