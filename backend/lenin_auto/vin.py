"""Decodificador de VIN (ISO 3779 / 49 CFR 565).

Local, sin red:
    WMI (posiciones 1–3)  → fabricante y región
    posición 10           → año modelo (ciclo de 30 años; letras I, O, Q, U, Z y 0 no se usan)
    posición 9            → dígito verificador: Σ valor(c)·peso(i) mod 11 (10 = «X»)
En línea (opcional): la API pública vPIC de la NHTSA completa modelo y cilindrada.
"""

from __future__ import annotations

import json
import re
import urllib.request
from dataclasses import dataclass, replace

from .catalog import Catalog
from .search.text import fold

_WMI: tuple[tuple[str, str], ...] = tuple(
    (prefix, make)
    for make, prefixes in {
        "toyota": "JT MR0 5TD 5TF 4T1 2T1 3TM 9BR 8AJ",
        "nissan": "3N1 3N6 1N4 1N6 JN1 JN8 5N1 VSK MNT 94D",
        "chevrolet": "1G1 1GC 1GN 2G1 3G1 3GN KL1 KL8 9BG 8AG",
        "ford": "1FA 1FT 1FM 3FA 2FM MPB 9BF 8AF WF0",
        "volkswagen": "WVW WVG 3VW 9BW 8AW WV1 WV2",
        "honda": "1HG 2HG JHM 5J6 2HK SHH 93H 19X",
        "hyundai": "KMH KM8 5NP 5NM MAL 9BH",
        "kia": "KNA KND 5XX 3KP",
        "mazda": "JM1 JM3 3MZ 3MV MM0",
        "mitsubishi": "JA3 JA4 JMY MMB MMA ML3",
        "suzuki": "JS2 JS3 TSM MA3",
        "renault": "VF1 93Y 9FB 8A1 UU1",
        "jeep": "1C4 1J4 1J8 3C4 ZAC",
    }.items()
    for prefix in prefixes.split()
)
_REGIONS = (
    ("12345", "Norteamérica"),
    ("67", "Oceanía"),
    ("89", "Sudamérica"),
    ("J", "Japón"),
    ("K", "Corea del Sur"),
    ("L", "China"),
    ("M", "India / Tailandia / Indonesia"),
    ("STUVWXYZ", "Europa"),
    ("ABCDEFGH", "África"),
)
_TRANSLIT = dict(
    zip("ABCDEFGHJKLMNPRSTUVWXYZ", (1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 7, 9, 2, 3, 4, 5, 6, 7, 8, 9), strict=True)
)
_WEIGHTS = (8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2)
_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY"


def clean(vin: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", vin.upper())[:17]


def check_digit(vin: str) -> str:
    total = sum((int(c) if c.isdigit() else _TRANSLIT.get(c, 0)) * w for c, w in zip(vin, _WEIGHTS, strict=True))
    r = total % 11
    return "X" if r == 10 else str(r)


def with_check_digit(vin: str) -> str:
    base = vin.replace("?", "0")
    return base[:8] + check_digit(base) + base[9:]


@dataclass(frozen=True, slots=True)
class VinResult:
    vin: str
    valid: bool
    error: str | None = None
    make_id: str | None = None
    region: str | None = None
    year: int | None = None
    check_ok: bool | None = None
    model_id: str | None = None
    engine: str | None = None
    online: str | None = None
    online_model: str | None = None


def decode(vin: str, current_year: int) -> VinResult:
    v = clean(vin)
    if len(v) != 17:
        return VinResult(v, False, f"El VIN tiene 17 caracteres; llevas {len(v)}.")
    if re.search(r"[IOQ]", v):
        return VinResult(v, False, "Un VIN nunca usa las letras I, O ni Q. Revisa si es un 1 o un 0.")
    make = next((m for p, m in _WMI if v.startswith(p)), None)
    code = v[9]
    year: int | None = (
        2010 + _YEAR_CODES.index(code) if code in _YEAR_CODES else 2000 + int(code) if code in "123456789" else None
    )
    if year and year > current_year + 1:
        year -= 30
    region = next((name for first, name in _REGIONS if v[0] in first), None)
    return VinResult(v, True, None, make, region, year, check_digit(v) == v[8])


def enrich_online(r: VinResult, catalog: Catalog, timeout: float = 4.0) -> VinResult:
    """Completa modelo y motor con vPIC (NHTSA). Si no hay red, devuelve lo local."""
    if not r.valid:
        return r
    url = f"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{r.vin}?format=json"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            row = json.load(resp)["Results"][0]
    except Exception:  # red, TLS o formato: se degrada con elegancia
        return replace(r, online="fail")
    name = fold(str(row.get("Model") or ""))
    year = int(row.get("ModelYear") or 0) or r.year
    make_id = r.make_id or next((m.id for m in catalog.makes if fold(m.name) == fold(str(row.get("Make") or ""))), None)
    model = next(
        (
            m
            for m in catalog.models
            if m.make_id == make_id
            and name
            and (name in fold(m.name) or any(fold(a) == name for a in m.aliases) or fold(m.name).split()[0] in name)
        ),
        None,
    )
    engine = None
    if model and year and catalog.gen_for(model.id, year):
        engines = catalog.engines_for(model.id, year)
        try:
            liters = float(row.get("DisplacementL") or 0)
        except ValueError:
            liters = 0.0
        by_l = [e for e in engines if abs(catalog.engines[e].liters - liters) < 0.06]
        engine = engines[0] if len(engines) == 1 else by_l[0] if len(by_l) == 1 else None
    return replace(
        r,
        make_id=make_id,
        year=year,
        model_id=model.id if model else None,
        engine=engine,
        online="ok",
        online_model=row.get("Model") or None,
    )


SAMPLE_VINS = (
    ("Toyota Corolla 2016", with_check_digit("2T1BURHE?GC741258")),
    ("Honda Civic 2017", with_check_digit("2HGFC2F5?HH502114")),
    ("Nissan Sentra 2019", with_check_digit("3N1AB7AP?KY230871")),
)
