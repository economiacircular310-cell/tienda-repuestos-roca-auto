"""Confianza de compatibilidad: no solo «sí/no», también cuán seguros estamos y por qué."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ..catalog import Catalog, VehicleQuery
from ..inventory import Product

Status = Literal["confirmada", "condicional", "universal", "no", "sin-vehiculo"]


@dataclass(frozen=True, slots=True)
class Fitment:
    status: Status
    confidence: float
    reason: str


def assess(p: Product, v: VehicleQuery | None, catalog: Catalog) -> Fitment:
    if v is None or v.empty:
        return Fitment("sin-vehiculo", 0.0, "Elige tu vehículo para confirmar la compatibilidad.")
    if p.fit == "*":
        return Fitment("universal", 0.7, "Pieza universal: confirma la especificación en el manual de tu vehículo.")
    keys = catalog.fit_keys(v)
    if p.fit not in keys:
        return Fitment("no", 0.0, "No corresponde a este vehículo.")
    kind, key = p.fit[0], p.fit[2:]
    if kind == "g":
        if v.year:
            return Fitment("confirmada", 1.0, f"Coincide la generación {catalog.gen_by_id[key].code} de tu vehículo.")
        return Fitment("condicional", 0.8, "Sirve para algunos años de tu modelo: indica el año.")
    engine = catalog.engines[key]
    if v.engine == key:
        return Fitment("confirmada", 1.0, f"Coincide el motor {engine.label()}.")
    possible = catalog.engines_for(v.model_id, v.year) if v.model_id and v.year else []
    if possible == [key]:
        return Fitment("confirmada", 1.0, f"Tu vehículo solo se fabricó con el motor {engine.label()}.")
    share = 1 / max(1, len(possible)) if possible else 0.5
    return Fitment(
        "condicional", round(share, 2), f"Sirve si tu motor es {engine.label()}. Indica el motor para confirmar."
    )
