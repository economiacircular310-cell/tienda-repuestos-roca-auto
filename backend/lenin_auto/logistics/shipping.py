"""Consolidación de envíos como cobertura de conjuntos (set cover) exacta.

Con W almacenes hay 2^W − 1 combinaciones; se recorren todas en orden lexicográfico de
objetivos (menos paquetes → menor plazo máximo → menor suma de plazos). Con 3 almacenes
son 7 casos: exacto e instantáneo. Para decenas de almacenes se cambiaría por la
heurística voraz de Chvátal (aproximación ln n), manteniendo la misma interfaz.

Cada línea va al almacén elegido con más existencias; si ninguno alcanza solo, se reparte.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

from ..catalog import Warehouse
from ..inventory import Product


@dataclass(frozen=True, slots=True)
class Line:
    product: Product
    qty: int


@dataclass(frozen=True, slots=True)
class Shipment:
    warehouse: Warehouse
    items: tuple[Line, ...]


@dataclass(frozen=True, slots=True)
class ShipmentPlan:
    shipments: tuple[Shipment, ...]
    backorder: tuple[Line, ...]
    eta: tuple[int, int] | None


def plan_shipments(lines: list[Line], warehouses: tuple[Warehouse, ...]) -> ShipmentPlan:
    backorder = tuple(line for line in lines if line.product.stock_total < line.qty)
    shippable = [line for line in lines if line not in backorder]
    if not shippable:
        return ShipmentPlan((), backorder, None)

    idx = range(len(warehouses))
    subsets = (s for k in range(1, len(warehouses) + 1) for s in combinations(idx, k))
    feasible = (s for s in subsets if all(sum(line.product.stock[i] for i in s) >= line.qty for line in shippable))
    chosen = min(
        feasible,
        key=lambda s: (len(s), max(warehouses[i].eta[1] for i in s), sum(warehouses[i].eta[1] for i in s)),
    )

    per: dict[int, list[Line]] = {i: [] for i in chosen}
    for line in shippable:
        ranked = sorted(chosen, key=lambda i: -line.product.stock[i])
        single = next((i for i in ranked if line.product.stock[i] >= line.qty), None)
        if single is not None:
            per[single].append(line)
            continue
        left = line.qty
        for i in ranked:
            take = min(left, line.product.stock[i])
            if take:
                per[i].append(Line(line.product, take))
                left -= take
            if not left:
                break
    shipments = tuple(Shipment(warehouses[i], tuple(items)) for i, items in sorted(per.items()) if items)
    eta = (max(s.warehouse.eta[0] for s in shipments), max(s.warehouse.eta[1] for s in shipments))
    return ShipmentPlan(shipments, backorder, eta)
