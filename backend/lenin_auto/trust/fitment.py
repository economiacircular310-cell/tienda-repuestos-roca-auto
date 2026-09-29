"""Confianza de compatibilidad: no solo «sí/no», también cuán seguros estamos y por qué.

El vehículo del cliente (completo o parcial) se expande a sus configuraciones exactas
(generación, año, motor). La pieza está *confirmada* solo si sirve en todas; si sirve en
algunas, es *condicional* y la confianza es la proporción que cubre, con la razón concreta
de lo que falta saber (año, motor o generación).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ..catalog import Catalog, Config, VehicleQuery
from ..inventory import Product

Status = Literal["confirmada", "condicional", "universal", "no", "sin-vehiculo"]


@dataclass(frozen=True, slots=True)
class Fitment:
    status: Status
    confidence: float
    reason: str


def year_ranges(years: set[int]) -> str:
    """{2014, 2015, 2016, 2019} → «2014–2016 y 2019»."""
    runs: list[list[int]] = []
    for y in sorted(years):
        if runs and y == runs[-1][-1] + 1:
            runs[-1].append(y)
        else:
            runs.append([y])
    parts = [f"{r[0]}–{r[-1]}" if len(r) > 1 else str(r[0]) for r in runs]
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} y {parts[-1]}"


def _confirmed_reason(p: Product, fitting: list[Config], v: VehicleQuery, catalog: Catalog) -> str:
    cfg = fitting[0]
    kinds = {k.split(":", 1)[0] for k in cfg.keys if k in p.fits}
    if "g" in kinds:
        return f"Coincide la generación {cfg.gen.code} de tu vehículo."
    if "y" in kinds:
        return f"Coincide tu {catalog.model_by_id[cfg.gen.model_id].name} {cfg.gen.code} de {cfg.year}."
    label = catalog.engines[cfg.engine].label()
    if v.engine:
        return f"Coincide el motor {label}."
    return f"Tu vehículo solo se fabricó con el motor {label}."


def _conditional_reason(fitting: list[Config], v: VehicleQuery, catalog: Catalog) -> str:
    if not v.model_id:
        models = sorted({catalog.model_by_id[c.gen.model_id].name for c in fitting})
        if len(models) == 1:
            return f"Sirve solo en el {models[0]}: elige tu modelo y año para confirmar."
        return f"Sirve en algunos modelos ({', '.join(models[:4])}{'…' if len(models) > 4 else ''}): elige el tuyo."
    if not v.year:
        return f"Sirve en tu modelo en {year_ranges({c.year for c in fitting})}: indica el año para confirmar."
    engines = list(dict.fromkeys(c.engine for c in fitting))
    all_engines = {e for g in catalog.model_by_id[v.model_id].gens if g.covers(v.year) for e in g.engines}
    if not v.engine and len(engines) < len(all_engines):
        labels = " o ".join(catalog.engines[e].label() for e in engines)
        return f"Sirve si tu motor es {labels}. Indica el motor para confirmar."
    codes = " / ".join(dict.fromkeys(c.gen.code for c in fitting))
    return f"En {v.year} se vendieron dos generaciones; sirve en la {codes}. Revisa la de tu vehículo."


def assess(p: Product, v: VehicleQuery | None, catalog: Catalog) -> Fitment:
    if v is None or v.empty:
        return Fitment("sin-vehiculo", 0.0, "Elige tu vehículo para confirmar la compatibilidad.")
    if p.universal:
        return Fitment("universal", 0.7, "Pieza universal: confirma la especificación en el manual de tu vehículo.")
    configs = catalog.configs(v)
    fitting = [cfg for cfg in configs if not p.fits.isdisjoint(cfg.keys)]
    if not fitting:
        return Fitment("no", 0.0, "No corresponde a este vehículo.")
    if len(fitting) == len(configs):
        return Fitment("confirmada", 1.0, _confirmed_reason(p, fitting, v, catalog))
    return Fitment("condicional", round(len(fitting) / len(configs), 2), _conditional_reason(fitting, v, catalog))
