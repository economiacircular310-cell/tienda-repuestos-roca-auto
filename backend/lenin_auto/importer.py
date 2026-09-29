"""Importador de inventario real: la planilla de tu ERP o proveedor, tal como viene.

Lee la planilla como la leería una persona del mostrador:

Formato
    Detecta el separador (``,`` ``;`` tabulador ``|``) por consistencia de columnas, el BOM
    de Excel y la codificación (UTF-8 o Windows-1252). Precios «$1.234,50», «1,234.50» o
    «45,9»; si un número es ambiguo («1.234») lo dice en el reporte.
Encabezados
    En español o inglés, con o sin tildes, abreviados o con un error leve: «Nº de parte»,
    «SKU», «part_number», «Precio venta», «Existencias Norte», «Aplicación»…
Marca
    Por nombre, alias o con errores de tipeo (Damerau-Levenshtein). Una marca desconocida
    se da de alta y queda en el reporte.
Tipo de pieza, posición y nivel
    Con el mismo intérprete del buscador: sinónimos regionales («balatas», «bujes»,
    «amortiguadores»), corrección de errores y frases como «delanteras» o «de agencia».
Aplicación (vehículos)
    «Toyota Corolla 2014-2019; Yaris 1.5 2012+; Hilux diésel hasta 2015; Motor 2ZR-FE».
    Entiende modelo, generación, tramos de años (2014-19, 2016+, «desde», «hasta»),
    cilindrada, código de motor y combustible, y lo traduce a la representación exacta más
    compacta (ver ``catalog``). Lo que el proveedor no declara no se certifica: una pieza
    para «Corolla 2014-2016» no le aparece confirmada a un Corolla 2018.

Cada fila produce un producto o un error con su causa. Las decisiones que tomó el
importador (una marca corregida, un motor supuesto) quedan como avisos para revisarlas.
"""

from __future__ import annotations

import csv
import io
import re
import time
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import IO, Any, Literal

from .catalog import (
    TIER_ORDER,
    UNIVERSAL,
    Brand,
    Catalog,
    Generation,
    Model,
    PartType,
    Tier,
    engine_key,
    gen_engine_key,
    gen_key,
    load_catalog,
    load_json,
    year_engine_key,
    year_key,
)
from .config import settings
from .inventory import Inventory, Product, make_product, save_snapshot
from .search.parser import QueryParser
from .search.text import STOPWORDS, damerau, fold, norm_pn, typo_budget
from .trust.fitment import year_ranges
from .workshop.diagnosis import Diagnostician

Level = Literal["error", "aviso"]
Field = Literal[
    "part_number",
    "brand",
    "part_type",
    "title",
    "price",
    "list_price",
    "closeout",
    "tier",
    "position",
    "variant",
    "stock",
    "warehouse",
    "fitment",
    "oem",
    "xref",
    "specs",
    "warranty",
    "rating",
    "reviews",
    "origin",
]

# Encabezados reconocidos (se comparan sin tildes, sin signos y sin «de/del/nº/número»)
FIELDS: dict[Field, tuple[str, ...]] = {
    "part_number": (
        "parte", "numero de parte", "part number", "part", "pn", "mpn", "sku", "referencia", "ref", "codigo",
        "codigo parte", "codigo fabricante", "codigo producto", "codigo articulo", "articulo", "item",
    ),
    "brand": ("marca", "fabricante", "brand", "manufacturer", "make brand"),
    "part_type": ("tipo", "tipo pieza", "pieza", "producto", "familia", "linea", "subcategoria", "part type", "type"),
    "title": ("titulo", "descripcion", "nombre", "detalle", "title", "description", "name"),
    "price": ("precio", "precio venta", "precio unitario", "pvp", "valor", "price", "unit price", "sale price"),
    "list_price": ("precio lista", "precio antes", "precio anterior", "precio regular", "list price", "msrp", "was"),
    "closeout": ("liquidacion", "remate", "outlet", "closeout", "clearance"),
    "tier": ("nivel", "calidad", "gama", "tier", "grade", "quality"),
    "position": ("posicion", "ubicacion", "lado", "position", "side"),
    "variant": ("variante", "especificacion", "viscosidad", "medida", "variant", "spec"),
    "stock": ("stock", "existencias", "existencia", "cantidad", "inventario", "disponible", "unidades", "qty"),
    "warehouse": ("almacen", "bodega", "sucursal", "warehouse"),
    "fitment": (
        "aplicacion", "aplicaciones", "compatibilidad", "vehiculo", "vehiculos", "modelos", "fitment", "application",
        "applications", "vehicles",
    ),
    "oem": ("oem", "oe", "codigo oem", "numero oem", "original", "oem number"),
    "xref": (
        "equivalencias", "equivalentes", "referencia cruzada", "referencias cruzadas", "cruce", "intercambio",
        "cross reference", "xref", "interchange",
    ),
    "specs": ("caracteristicas", "especificaciones", "atributos", "ficha tecnica", "specs", "attributes"),
    "warranty": ("garantia", "warranty"),
    "rating": ("calificacion", "valoracion", "estrellas", "rating", "stars"),
    "reviews": ("resenas", "opiniones", "reviews", "resenas totales"),
    "origin": ("origen", "pais", "origen marca", "origin", "country"),
}  # fmt: skip
REQUIRED: tuple[Field, ...] = ("part_number", "brand", "price")
_FILLER = frozenset({"de", "del", "la", "el", "los", "las", "en", "of", "the", "n", "no", "nro", "num", "numero"})
_DERIVED_SPECS = frozenset({"posicion", "especificacion", "origen de la marca", "garantia"})
_TRUE = frozenset({"si", "s", "yes", "y", "true", "1", "x", "verdadero"})
_FALSE = frozenset({"", "no", "n", "false", "0", "falso", "-"})
_OUT_OF_STOCK = frozenset({"agotado", "sin stock", "sin existencias", "no", "-", "0"})
_UNIVERSAL_WORDS = frozenset(
    {"*", "universal", "todos", "todas", "generico", "cualquier vehiculo", "todos los vehiculos"}
)


def _hkey(text: str) -> str:
    """Encabezado normalizado: «Nº de Parte» → «parte»."""
    words = re.sub(r"[^a-z0-9]+", " ", fold(text)).split()
    return " ".join(w for w in words if w not in _FILLER) or " ".join(words)


def _alnum(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", fold(text))


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", fold(text)).strip("-") or "marca"


# ---------------------------------------------------------------------- lectura de valores


def parse_number(raw: str) -> tuple[float | None, str]:
    """«$1.234,50» → 1234.5 · «1,234.50» → 1234.5 · «45,9» → 45.9. Devuelve (valor, aviso)."""
    s = re.sub(r"[^\d.,\-]", "", raw.strip())
    if not any(ch.isdigit() for ch in s):
        return None, ""
    negative = s.startswith("-")
    s = s.replace("-", "")
    note = ""
    if "," in s and "." in s:
        dec = "," if s.rfind(",") > s.rfind(".") else "."
        s = s.replace("." if dec == "," else ",", "").replace(dec, ".")
    elif "," in s or "." in s:
        sep = "," if "," in s else "."
        head, *groups = s.split(sep)
        if len(groups) > 1 or (len(groups[0]) == 3 and head not in ("", "0")):
            s = head + "".join(groups)
            if len(groups) == 1:
                note = f"«{raw.strip()}» se leyó como {int(s)} (el «{sep}» se tomó como separador de miles)"
        else:
            s = f"{head or '0'}.{groups[0]}"
    value = float(s)
    return (-value if negative else value), note


def parse_bool(raw: str) -> bool | None:
    f = fold(raw).strip()
    return True if f in _TRUE else False if f in _FALSE else None


def parse_warranty(raw: str) -> str | None:
    """«24 meses» → «2 años» · «18 m» → «18 meses» · «vitalicia» → «De por vida»."""
    f = fold(raw).strip()
    if any(w in f for w in ("vida", "vitalicia", "lifetime")):
        return "De por vida"
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*([a-z]*)", f)
    if not m:
        return None
    n = float(m.group(1).replace(",", "."))
    unit = m.group(2)
    months = unit.startswith(("mes", "month")) or unit == "m"
    if months and n % 12:
        return f"{n:g} meses"
    years = int(n / 12 if months else n)
    if years <= 0 or (unit and not months and not unit.startswith(("ano", "year", "yr", "a"))):
        return None
    return f"{years} año" if years == 1 else f"{years} años"


def split_list(raw: str) -> tuple[str, ...]:
    return tuple(dict.fromkeys(x.strip() for x in re.split(r"[;|,\n]+", raw) if x.strip()))


# ---------------------------------------------------------------------- lectura del archivo


def decode(raw: bytes) -> tuple[str, str]:
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc), "UTF-8" if enc == "utf-8-sig" else "Windows-1252"
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1"), "Latin-1"


def sniff_delimiter(text: str) -> str:
    """El separador que da el mismo número de columnas (>1) en más líneas."""
    lines = [ln for ln in text.splitlines()[:60] if ln.strip()]
    best, best_score = ",", -1.0
    for d in (",", ";", "\t", "|"):
        counts = [len(r) for r in csv.reader(lines, delimiter=d)]
        if not counts:
            continue
        mode, freq = Counter(counts).most_common(1)[0]
        score = (freq / len(counts)) * (mode > 1) * (1 + min(mode, 30) / 100)
        if score > best_score:
            best, best_score = d, score
    return best


# ---------------------------------------------------------------------- aplicación → claves

_Y = r"(19[89]\d|20[0-3]\d)"
_YEAR_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(rf"(?<![\d.,]){_Y}\s*(?:-|–|—|/|\ba\b|\bal\b|\bhasta\b|\bto\b)\s*{_Y}(?![\d.,])"), "range"),
    (re.compile(rf"(?<![\d.,]){_Y}\s*(?:-|–|—)\s*(\d{{2}})(?![\d.,])"), "range2"),
    (re.compile(rf"(?<![\d.,]){_Y}\s*(?:\+|en adelante|y posteriores|o posterior|onwards|and up)"), "from"),
    (re.compile(rf"\b(?:desde|a partir de|from)\s*{_Y}(?![\d.,])"), "from"),
    (re.compile(rf"\b(?:hasta|until|up to)\s*{_Y}(?![\d.,])"), "to"),
    (re.compile(rf"\bantes de\s*{_Y}(?![\d.,])"), "before"),
    (re.compile(r"(?<![\w.,])(\d{2})\s*(?:-|–|—)\s*(\d{2})(?![\w.,])"), "short"),
    (re.compile(rf"(?<![\d.,]){_Y}(?![\d.,])"), "single"),
)
_LITERS = re.compile(r"(?<![\w.,])(\d)[.,](\d)(?![\d.,])")
_CC = re.compile(r"(?<!\d)(\d{3,4})\s*cc\b")
_NOISE = re.compile(
    r"\b(motor|motores|modelo|modelos|ano|anos|version|versiones|gen|generacion|todos|todas|los|las|cc|l|lt|lts"
    r"|litro|litros|para|con|y)\b"
)


def _mask(text: str, a: int, b: int) -> str:
    return text[:a] + " " * (b - a) + text[b:]


@dataclass(frozen=True, slots=True)
class Application:
    keys: frozenset[str] = frozenset()
    notes: tuple[str, ...] = ()
    error: str = ""
    engine_note: str = ""  # aviso si la pieza es de motor y no se indicó cuál


class FitmentResolver:
    """Traduce el texto de aplicación de un proveedor a claves de compatibilidad exactas."""

    def __init__(self, catalog: Catalog, parser: QueryParser) -> None:
        self.c = catalog
        self.parser = parser
        self._cache: dict[str, Application] = {}
        pats = []
        for code in sorted(catalog.engines, key=len, reverse=True):
            parts = re.findall(r"[a-z0-9]+", fold(code))
            pats.append(
                (code, re.compile(r"(?<![a-z0-9])" + r"[\s\-_./]*".join(map(re.escape, parts)) + r"(?![a-z0-9])"))
            )
        self._engine_patterns = pats

    def resolve(self, text: str, pt: PartType) -> Application:
        t = " ".join(text.split())
        if pt.basis == "universal":
            ignored = t and fold(t) not in _UNIVERSAL_WORDS
            return Application(frozenset({UNIVERSAL}), ("pieza universal: se ignoró la aplicación",) if ignored else ())
        if not t:
            return Application(error="falta la aplicación: sin vehículos nadie puede confirmar que le sirve")
        if fold(t) in _UNIVERSAL_WORDS:
            return Application(
                frozenset({UNIVERSAL}), (f"«{pt.name}» suele depender del vehículo y se publicó universal",)
            )
        keys: set[str] = set()
        notes: list[str] = []
        errors: list[str] = []
        for part in re.split(r"[;|\n]+|,(?!\s*\d)", t):
            if not part.strip():
                continue
            app = self._cache.get(part.strip())
            if app is None:
                app = self._cache[part.strip()] = self._application(part.strip())
            if app.error:
                errors.append(app.error)
                continue
            keys |= app.keys
            notes.extend(app.notes)
            if app.engine_note and pt.basis == "engine":
                notes.append(app.engine_note)
        if not keys:
            return Application(error="; ".join(errors))
        notes = [f"se omitió una aplicación: {e}" for e in errors] + notes
        return Application(frozenset(keys), tuple(dict.fromkeys(notes)))

    def _application(self, raw: str) -> Application:
        c = self.c
        text = fold(raw)
        notes: list[str] = []

        engines: list[str] = []
        for code, pat in self._engine_patterns:
            for m in pat.finditer(text):
                engines.append(code)
                text = _mask(text, m.start(), m.end())

        years: set[int] | None = None
        for pat, kind in _YEAR_PATTERNS:
            for m in pat.finditer(text):
                a = int(m.group(1))
                if kind == "short":
                    lo, hi = (2000 + a if a < 40 else 1900 + a), int(m.group(2))
                    hi = 2000 + hi if hi < 40 else 1900 + hi
                    if not (c.min_year - 30 <= lo <= hi <= c.max_year + 1):
                        continue
                    span = range(lo, hi + 1)
                elif kind in ("range", "range2"):
                    b = int(m.group(2))
                    b = b if kind == "range" else (a // 100) * 100 + b
                    if b < a:
                        notes.append(f"el tramo {a}-{b} estaba al revés")
                        a, b = b, a
                    span = range(a, b + 1)
                elif kind == "from":
                    span = range(a, c.max_year + 1)
                elif kind == "to":
                    span = range(c.min_year, a + 1)
                elif kind == "before":
                    span = range(c.min_year, a)
                else:
                    span = range(a, a + 1)
                years = (years or set()) | set(span)
                text = _mask(text, m.start(), m.end())

        liters: float | None = None
        for m in _LITERS.finditer(text):
            liters = float(f"{m.group(1)}.{m.group(2)}")
            text = _mask(text, m.start(), m.end())
        for m in _CC.finditer(text):
            liters = round(int(m.group(1)) / 1000, 1)
            text = _mask(text, m.start(), m.end())
        if liters is not None and engines:
            if any(abs(c.engines[e].liters - liters) >= 0.05 for e in engines):
                notes.append(f"la cilindrada {liters:.1f} L no coincide con el motor indicado: manda el motor")
            liters = None

        parsed = self.parser.parse(_NOISE.sub(" ", text))
        v = parsed.vehicle
        make_id, model_id, fuel = (v.make_id, v.model_id, v.fuel) if v else (None, None, None)
        if v and v.engine and not engines:
            engines.append(v.engine)
        ignored = [ch.label for ch in parsed.chips if ch.kind not in ("vehicle", "engine", "fuel") and not ch.corrected]

        model = c.model_by_id.get(model_id or "")
        codes: set[str] = set()
        leftovers = [t.raw for t in parsed.text_tokens]
        if model:
            for g in model.gens:
                short = g.code.isalpha() and len(g.code) <= 3
                flags = 0 if short else re.I
                if re.search(rf"(?<![A-Za-z0-9]){re.escape(g.code)}(?![A-Za-z0-9])", raw, flags) and not (
                    short and raw.isupper() and fold(g.code) in STOPWORDS
                ):
                    codes.add(g.code)
            leftovers = [w for w in leftovers if w.upper() not in codes]
        for written, understood in parsed.corrections:
            if written.upper() in codes:  # «ONIX1» es la generación, no un error al escribir «Onix»
                continue
            kind = next((ch.kind for ch in parsed.chips if ch.corrected and ch.label == understood), "")
            if kind in ("vehicle", "engine", "fuel", ""):
                notes.append(f"«{written}» se interpretó como {understood}")
            else:
                ignored.append(f"«{written}»")
        ignored += [f"«{w}»" for w in leftovers]
        if ignored:
            notes.append(f"se ignoró {', '.join(ignored)} (no describe un vehículo)")

        # vehículo(s) candidatos
        if model:
            gens: list[Generation] = list(model.gens)
            name = model.name
        elif engines:
            if not (make_id or years or fuel):
                return Application(frozenset(engine_key(e) for e in engines), tuple(notes))
            gens = [
                g
                for e in engines
                for g in c.gens_by_engine[e]
                if not make_id or c.model_by_id[g.model_id].make_id == make_id
            ]
            name = " / ".join(engines)
        elif make_id:
            return Application(
                error=f"solo se reconoció la marca {c.make_by_id[make_id].name} en «{raw}»: falta el modelo"
            )
        else:
            return Application(error=f"no se reconoció ningún vehículo en «{raw}»")

        selected: list[tuple[Generation, list[int], list[str]]] = []
        for g in dict.fromkeys(gens):
            if codes and g.code not in codes:
                continue
            ys = [y for y in range(g.start, g.end + 1) if years is None or y in years]
            es = [
                e
                for e in g.engines
                if (not engines or e in engines)
                and (liters is None or abs(c.engines[e].liters - liters) < 0.05)
                and (fuel is None or c.engines[e].fuel == fuel)
            ]
            if ys and es:
                selected.append((g, ys, es))
        if not selected:
            return Application(error=self._explain_miss(raw, name, model, years, engines, liters, fuel))

        keys: set[str] = set()
        for g, ys, es in selected:
            full_years = len(ys) == g.end - g.start + 1
            all_engines = len(es) == len(g.engines)
            if full_years and all_engines:
                keys.add(gen_key(g.id))
            elif full_years:
                keys.update(gen_engine_key(g.id, e) for e in es)
            elif all_engines:
                keys.update(year_key(g.id, y) for y in ys)
            else:
                keys.update(year_engine_key(g.id, y, e) for y in ys for e in es)

        if model and not codes:
            if years is None and len(selected) > 1:
                covered = f"{min(g.start for g, _, _ in selected)}–{max(g.end for g, _, _ in selected)}"
                notes.append(f"sin años: se aplicó a todas las generaciones del {name} ({covered})")
            if years:
                for y in sorted(years):
                    both = [g.code for g, ys, _ in selected if y in ys]
                    if len(both) > 1:
                        notes.append(
                            f"{y}: el {name} tuvo dos generaciones ({' y '.join(both)}); se incluyeron ambas. "
                            "Escribe la generación para precisar"
                        )
        engine_note = ""
        if not engines and liters is None and any(len(es) > 1 for _, _, es in selected):
            labels = sorted({c.engines[e].label(False) for _, _, es in selected for e in es})
            engine_note = f"sin motor indicado: se aplicó a todos los motores del {name} ({', '.join(labels)})"
        return Application(frozenset(keys), tuple(notes), engine_note=engine_note)

    def _explain_miss(
        self,
        raw: str,
        name: str,
        model: Model | None,
        years: set[int] | None,
        engines: list[str],
        liters: float | None,
        fuel: str | None,
    ) -> str:
        conds = []
        if years:
            conds.append(f"en {year_ranges(years)}")
        if engines:
            conds.append(f"con motor {' / '.join(engines)}")
        if liters is not None:
            conds.append(f"con motor {liters:.1f} L")
        if fuel:
            conds.append(fuel.lower())
        known = ""
        if model:
            known = f" (en el catálogo: {', '.join(f'{g.code} {g.start}–{g.end}' for g in model.gens)})"
        return f"el catálogo no tiene {name} {' '.join(conds)}{known}"


# ---------------------------------------------------------------------- importador


@dataclass(frozen=True, slots=True)
class Issue:
    row: int  # número de línea en la planilla (el encabezado es la 1)
    column: str
    level: Level
    message: str
    value: str = ""


@dataclass(slots=True)
class ImportReport:
    source: str
    encoding: str
    delimiter: str
    rows: int
    products: list[Product]
    new_brands: list[Brand]
    issues: list[Issue]
    columns: dict[str, str]  # campo → encabezado original
    ignored_columns: list[str]
    took_ms: float = 0.0

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "aviso"]

    @property
    def skipped_rows(self) -> int:
        return len({i.row for i in self.errors})

    def save(self, path: str | Path) -> None:
        save_snapshot(path, self.products, self.new_brands, self.source)

    def issues_csv(self, out: IO[str]) -> None:
        w = csv.writer(out)
        w.writerow(["fila", "columna", "nivel", "mensaje", "valor"])
        w.writerows((i.row, i.column, i.level, i.message, i.value) for i in self.issues)

    def summary(self) -> dict[str, Any]:
        grouped = Counter((i.level, i.column, i.message) for i in self.issues)
        return {
            "source": self.source,
            "encoding": self.encoding,
            "delimiter": {"\t": "tab"}.get(self.delimiter, self.delimiter),
            "rows": self.rows,
            "imported": len(self.products),
            "skipped_rows": self.skipped_rows,
            "errors": len(self.errors),
            "warnings": len(self.warnings),
            "new_brands": [b.name for b in self.new_brands],
            "columns": self.columns,
            "ignored_columns": self.ignored_columns,
            "part_types": dict(Counter(p.part_type_id for p in self.products).most_common()),
            "universal": sum(p.universal for p in self.products),
            "top_issues": [
                {"level": lv, "column": col, "message": msg, "count": n}
                for (lv, col, msg), n in grouped.most_common(12)
            ],
            "took_ms": round(self.took_ms, 1),
        }


class ImportFailed(ValueError):
    """La planilla no se puede importar (faltan columnas obligatorias, está vacía…)."""


@dataclass(slots=True)
class _Row:
    n: int
    cells: dict[Field, str]
    stock_by_wh: dict[int, str]
    issues: list[Issue] = field(default_factory=list)
    headers: dict[str, str] = field(default_factory=dict)

    def get(self, f: Field) -> str:
        return self.cells.get(f, "").strip()

    def add(self, level: Level, f: str, message: str, value: str = "") -> None:
        """Registra un problema con el nombre de columna tal como viene en la planilla."""
        self.issues.append(Issue(self.n, self.headers.get(f, f), level, message, value))


class Importer:
    def __init__(self, catalog: Catalog | None = None) -> None:
        c = self.c = catalog or load_catalog()
        self.parser = QueryParser(c, Diagnostician(c, settings.km_per_year))
        self.fitment = FitmentResolver(c, self.parser)
        lex = load_json("lexicon.json")
        self._headers: dict[str, Field] = {_hkey(s): f for f, syns in FIELDS.items() for s in syns}
        self._brands: dict[str, Brand] = {}
        for b in c.brands:
            for alias in (b.id, b.name, *lex["brand_aliases"].get(b.id, ())):
                self._brands.setdefault(_alnum(alias), b)
        self._tiers: dict[str, Tier] = {}
        for t in c.tiers:
            for word in (t.id, t.name, t.short, *lex["tiers"].get(t.id, ())):
                self._tiers.setdefault(_alnum(word), t.id)
        self._positions: dict[str, str] = {_alnum(w): p for p, words in lex["positions"].items() for w in (p, *words)}
        self._types = {_alnum(x): pt.id for pt in c.part_types for x in (pt.id, pt.name)}
        self._pt_cache: dict[str, tuple[str | None, list[str], list[str]]] = {}

    # ---- encabezados

    def map_headers(self, header: list[str]) -> tuple[dict[int, Field], dict[int, int], list[str]]:
        """Columna → campo, columna → almacén (existencias por almacén) y columnas ignoradas."""
        wh_words = {_alnum(w.id): i for i, w in enumerate(self.c.warehouses)}
        wh_words |= {_alnum(re.sub(r"(?i)almac[eé]n", "", w.name)): i for i, w in enumerate(self.c.warehouses)}
        fields: dict[int, Field] = {}
        stock_cols: dict[int, int] = {}
        ignored: list[str] = []
        taken: set[Field] = set()
        for col, name in enumerate(header):
            key = _hkey(name)
            words = key.split()
            if len(words) >= 2 and self._headers.get(words[0]) == "stock":
                wh = _alnum(" ".join(w for w in words[1:] if w not in ("almacen", "bodega")))
                if wh in wh_words:
                    stock_cols[col] = wh_words[wh]
                    continue
            f = self._headers.get(key)
            if f is None and len(key) >= 4:
                budget = max(1, typo_budget(len(key)))
                best = min(((damerau(key, k, budget), k) for k in self._headers), default=(budget + 1, ""))
                f = self._headers[best[1]] if best[0] <= budget else None
            if f is None or f in taken:
                if name.strip():
                    ignored.append(name.strip())
                continue
            fields[col] = f
            taken.add(f)
        return fields, stock_cols, ignored

    # ---- resolución de cada campo

    def _brand(self, row: _Row, new: dict[str, Brand]) -> Brand | None:
        raw = " ".join(row.get("brand").split())
        if not raw:
            row.add("error", "brand", "falta la marca")
            return None
        key = _alnum(raw)
        found = self._brands.get(key) or new.get(key)
        if found:
            return found
        # errores de tipeo; en nombres cortos («NKG») solo dos letras vecinas intercambiadas
        budget = typo_budget(len(key)) or (1 if len(key) >= 3 else 0)
        if budget:
            known = self._brands | new
            scored = sorted(
                (d, k)
                for k in known
                if (d := damerau(key, k, budget)) <= budget and (typo_budget(len(key)) or sorted(k) == sorted(key))
            )
            best = [k for d, k in scored if d == scored[0][0]]
            if best and len({known[k].id for k in best}) == 1:
                b = known[best[0]]
                row.add("aviso", "brand", f"«{raw}» se interpretó como {b.name}", raw)
                return b
        taken = {b.id for b in self.c.brands} | {b.id for b in new.values()}
        bid, k = _slug(raw), 2
        while bid in taken:
            bid, k = f"{_slug(raw)}-{k}", k + 1
        origin = " ".join(row.get("origin").split()) or "Sin dato"
        b = new[key] = Brand(bid, raw, origin, (), (), (), (), "")
        row.add("aviso", "brand", f"marca nueva: {raw}", raw)
        return b

    def _read_type(self, text: str) -> tuple[str | None, list[str], list[str]]:
        """Texto → (tipo de pieza, avisos, posiciones mencionadas). Memorizado: se repite mucho."""
        cached = self._pt_cache.get(text)
        if cached is None:
            exact = self._types.get(_alnum(text))
            parsed = self.parser.parse(text)
            chips = [ch for ch in parsed.chips if ch.kind == "partType"]
            sure = [self._types[_alnum(ch.label)] for ch in chips if not ch.corrected]
            guessed = [self._types[_alnum(ch.label)] for ch in chips if ch.corrected]
            # una corrección de tipeo solo cuenta si el texto no nombra ya una pieza con claridad:
            # «Discos de freno ventilados» no es un electroventilador
            pt_id = exact or next(iter(sure or guessed), None)
            notes = []
            if not exact and not sure and guessed:
                notes = [f"«{w}» se interpretó como {u}" for w, u in parsed.corrections if _alnum(u) in self._types]
            if not exact and len(sure) > 1:
                names = ", ".join(self.c.part_type_by_id[x].name for x in sure)
                notes.append(f"menciona varios tipos ({names}): se usó el primero")
            if pt_id is None:
                cats = [self.c.category_by_id[x].name for x in parsed.categories]
                notes.append(
                    f"«{text}» es la categoría {cats[0]}: falta el tipo de pieza"
                    if cats
                    else "tipo de pieza no reconocido"
                )
            cached = self._pt_cache[text] = (pt_id, notes, parsed.positions)
        return cached

    def _part_type(self, row: _Row) -> tuple[PartType | None, list[str]]:
        """Tipo de pieza desde «tipo» o, si no se entiende, desde el título; más las posiciones del título."""
        title_positions = self._read_type(row.get("title"))[2] if row.get("title") else []
        failed: list[tuple[str, str, str]] = []
        sources: tuple[Field, ...] = ("part_type", "title")
        for f in sources:
            text = row.get(f)
            if not text:
                continue
            pt_id, notes, _ = self._read_type(text)
            if pt_id:
                for note in notes:
                    row.add("aviso", f, note, text)
                for g, t, why in failed:
                    row.add("aviso", g, f"{why}: se tomó del título", t)
                return self.c.part_type_by_id[pt_id], title_positions
            failed.append((f, text, notes[-1]))
        if not failed:
            row.add("error", "part_type", "falta el tipo de pieza (o un título que lo diga)")
        else:
            column, text, why = failed[0]
            row.add("error", column, why, text)
        return None, []

    def _tier(self, row: _Row, brand: Brand) -> Tier:
        raw = row.get("tier")
        if raw:
            found = self._tiers.get(_alnum(raw)) or next(
                (t for t in TIER_ORDER if t in self.parser.parse(raw).tiers), None
            )
            if found:
                return found
            row.add("aviso", "tier", "nivel no reconocido: se usó el de la marca", raw)
        tier: Tier = "diario" if not brand.tiers or "diario" in brand.tiers else brand.tiers[0]
        if not raw:
            row.add("aviso", "tier", f"sin nivel: se asumió «{self.c.tier_by_id[tier].name}»")
        return tier

    def _position_words(self, text: str) -> frozenset[str]:
        """«izquierda delantera» y «Delantero izquierdo» → {Delantero, Izquierdo}: el orden y el género no importan."""
        words = re.split(r"[^a-z0-9]+", fold(text))
        return frozenset(self._positions.get(w, w) for w in words if w and w not in STOPWORDS)

    def _position(self, row: _Row, pt: PartType, from_title: list[str]) -> str | None:
        raw = row.get("position")
        wanted = self._position_words(raw) if raw else frozenset(from_title)
        if wanted and pt.positions:
            exact = [p for p in pt.positions if self._position_words(p) == wanted]
            partial = [p for p in pt.positions if self._position_words(p) <= wanted]
            if exact or len(partial) == 1:
                return (exact or partial)[0]
        if raw and not pt.positions:
            row.add("aviso", "position", f"«{pt.name}» no usa posición: se ignoró", raw)
        elif raw:
            row.add("aviso", "position", f"posición no válida para {pt.name} ({' / '.join(pt.positions)})", raw)
        elif pt.positions:
            row.add("aviso", "position", f"sin posición ({' / '.join(pt.positions)})")
        return None

    def _variant(self, row: _Row, pt: PartType) -> str | None:
        raw = " ".join(row.get("variant").split())
        if pt.variants:
            haystack = _alnum(raw) if raw else _alnum(f"{row.get('title')} {row.get('specs')}")
            hits = [v for v in sorted(pt.variants, key=len, reverse=True) if _alnum(v) in haystack]
            if hits:
                return hits[0]
            if raw:
                row.add("aviso", "variant", f"especificación fuera del catálogo de {pt.name}: se creó «{raw}»", raw)
                return raw
            row.add("aviso", "variant", f"sin especificación ({', '.join(pt.variants)})")
            return None
        return raw or None

    def _money(self, row: _Row, f: Field, required: bool) -> float | None:
        raw = row.get(f)
        value, note = parse_number(raw) if raw else (None, "")
        if note:
            row.add("aviso", f, note, raw)
        if value is None:
            if required:
                row.add("error", f, "precio no válido" if raw else "falta el precio", raw)
            elif raw:
                row.add("aviso", f, "no es un precio: se ignoró", raw)
            return None
        if value <= 0 or value > 1_000_000:
            row.add("error" if required else "aviso", f, "precio fuera de rango", raw)
            return None
        return round(value, 2)

    def _stock(self, row: _Row) -> tuple[int, ...]:
        stock = [0] * len(self.c.warehouses)

        def qty(raw: str, column: Field | str) -> int:
            if fold(raw).strip() in _OUT_OF_STOCK or not raw.strip():
                return 0
            value, note = parse_number(raw)
            if value is None or value < 0:
                row.add("aviso", column, "existencias no válidas: se tomó 0", raw)
                return 0
            if note:
                row.add("aviso", column, note, raw)
            return int(value)

        if row.stock_by_wh:
            for wh, raw in row.stock_by_wh.items():
                stock[wh] += qty(raw, f"stock {self.c.warehouses[wh].id}")
        if row.get("stock"):
            wh = 0
            where = row.get("warehouse")
            if where:
                key = _alnum(re.sub(r"(?i)almac[eé]n|bodega", "", where))
                matches = [i for i, w in enumerate(self.c.warehouses) if key in (_alnum(w.id), _alnum(w.name))]
                if matches:
                    wh = matches[0]
                else:
                    row.add("aviso", "warehouse", f"almacén desconocido: se usó {self.c.warehouses[0].name}", where)
            stock[wh] += qty(row.get("stock"), "stock")
        return tuple(stock)

    def _specs(self, row: _Row) -> list[tuple[str, str]]:
        """«Material: Cerámica; Sensor de desgaste = Sí» → pares (las derivadas se recalculan)."""
        out: list[tuple[str, str]] = []
        for chunk in re.split(r"[;|\n]+", row.get("specs")):
            if not chunk.strip():
                continue
            m = re.match(r"\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$", chunk)
            if not m:
                row.add("aviso", "specs", "característica sin «nombre: valor»: se ignoró", chunk.strip())
                continue
            if fold(m.group(1)) not in _DERIVED_SPECS:
                out.append((m.group(1), m.group(2)))
        return out

    # ---- orquestación

    def run(self, data: bytes | str, source: str = "") -> ImportReport:
        t0 = time.perf_counter()
        text, encoding = decode(data) if isinstance(data, bytes) else (data.lstrip("﻿"), "texto")
        if not text.strip():
            raise ImportFailed("La planilla está vacía.")
        delimiter = sniff_delimiter(text)
        table = [r for r in csv.reader(io.StringIO(text), delimiter=delimiter)]
        start = next((i for i, r in enumerate(table) if any(c.strip() for c in r)), None)
        if start is None:
            raise ImportFailed("La planilla está vacía.")
        header = table[start]
        fields, stock_cols, ignored = self.map_headers(header)
        present = set(fields.values())
        missing = [f for f in REQUIRED if f not in present]
        if not ({"part_type", "title"} & present):
            missing.append("part_type")
        if missing:
            names = {
                "part_number": "número de parte",
                "brand": "marca",
                "price": "precio",
                "part_type": "tipo de pieza",
            }
            raise ImportFailed(
                f"Faltan columnas obligatorias: {', '.join(names[m] for m in missing)}. "
                f"Encabezados leídos: {', '.join(h for h in header if h.strip())}"
            )
        headers: dict[str, str] = {f: header[col].strip() for col, f in fields.items()}

        new_brands: dict[str, Brand] = {}
        issues: list[Issue] = []
        records: list[dict[str, Any]] = []
        seen: dict[str, int] = {}
        rows = 0
        for offset, cells in enumerate(table[start + 1 :], start=start + 2):
            if not any(c.strip() for c in cells):
                continue
            rows += 1
            row = _Row(
                offset,
                {f: cells[col] if col < len(cells) else "" for col, f in fields.items()},
                {wh: cells[col] for col, wh in stock_cols.items() if col < len(cells)},
                headers=headers,
            )
            rec = self._record(row, new_brands, seen)
            issues.extend(row.issues)
            if rec is not None:
                records.append(rec)

        # las marcas nuevas heredan niveles y categorías de lo que se importó
        by_brand: dict[str, list[dict[str, Any]]] = {}
        for rec in records:
            by_brand.setdefault(rec["brand_id"], []).append(rec)
        finished: list[Brand] = []
        for b in new_brands.values():
            recs = by_brand.get(b.id, [])
            if not recs:
                continue
            tiers = tuple(t for t in TIER_ORDER if any(r["tier"] == t for r in recs))
            types = tuple(dict.fromkeys(r["part_type_id"] for r in recs))
            cats = tuple(dict.fromkeys(self.c.part_type_by_id[t].cat for t in types))
            finished.append(replace(b, tiers=tiers, types=types, cats=cats))
        products = [make_product(i, rec, self.c) for i, rec in enumerate(records)]
        return ImportReport(
            source=source,
            encoding=encoding,
            delimiter=delimiter,
            rows=rows,
            products=products,
            new_brands=finished,
            issues=issues,
            columns={f: header[col].strip() for col, f in fields.items()}
            | {f"stock {self.c.warehouses[wh].id}": header[col].strip() for col, wh in stock_cols.items()},
            ignored_columns=ignored,
            took_ms=(time.perf_counter() - t0) * 1000,
        )

    def _record(self, row: _Row, new_brands: dict[str, Brand], seen: dict[str, int]) -> dict[str, Any] | None:
        pn = " ".join(row.get("part_number").split())
        if not norm_pn(pn):
            row.add("error", "part_number", "falta el número de parte" if not pn else "número de parte no válido", pn)
        brand = self._brand(row, new_brands)
        pt, title_positions = self._part_type(row)
        price = self._money(row, "price", required=True)
        if brand is None or pt is None or price is None or not norm_pn(pn):
            return None
        pid = f"{brand.id}-{norm_pn(pn).lower()}"
        if pid in seen:
            row.add("error", "part_number", f"repetido: {brand.name} {pn} ya está en la fila {seen[pid]}", pn)
            return None

        app = self.fitment.resolve(row.get("fitment"), pt)
        if app.error:
            row.add("error", "fitment", app.error, row.get("fitment"))
            return None
        for note in app.notes:
            row.add("aviso", "fitment", note, row.get("fitment"))
        seen[pid] = row.n

        tier = self._tier(row, brand)
        position = self._position(row, pt, title_positions)
        variant = self._variant(row, pt)
        list_price = self._money(row, "list_price", required=False)
        if list_price is not None and list_price <= price:
            row.add(
                "aviso",
                "list_price",
                "el precio de lista no es mayor que el de venta: se ignoró",
                row.get("list_price"),
            )
            list_price = None
        closeout = parse_bool(row.get("closeout"))
        if closeout is None:
            row.add("aviso", "closeout", "se esperaba sí/no: se tomó «no»", row.get("closeout"))
            closeout = False

        rating, reviews = 0.0, 0
        if row.get("rating"):
            r, _ = parse_number(row.get("rating"))
            if r is not None and 0 <= r <= 5:
                rating = round(r, 1)
            else:
                row.add("aviso", "rating", "calificación fuera de 0–5: se ignoró", row.get("rating"))
        if row.get("reviews"):
            n, _ = parse_number(row.get("reviews"))
            reviews = int(n) if n is not None and n >= 0 else 0
        if rating and not reviews:
            row.add("aviso", "rating", "calificación sin número de reseñas que la respalde: no se publica")
            rating = 0.0

        warranty = self.c.tier_by_id[tier].warranty
        if row.get("warranty"):
            w = parse_warranty(row.get("warranty"))
            if w:
                warranty = w
            else:
                row.add(
                    "aviso",
                    "warranty",
                    f"garantía no reconocida: se usó la del nivel ({warranty})",
                    row.get("warranty"),
                )

        specs = self._specs(row)
        if position:
            specs.insert(0, ("Posición", position))
        if variant:
            specs.insert(1 if position else 0, ("Especificación", variant))
        specs += [("Origen de la marca", brand.origin), ("Garantía", warranty)]
        title = " ".join(row.get("title").split())
        if not title:
            lead = next((v for k, v in specs if pt.specs and k == pt.specs[0].k), None)
            title = f"{pt.name}{' ' + variant if variant else ''}{' · ' + lead if lead else ''}"
        return {
            "part_number": pn,
            "brand_id": brand.id,
            "part_type_id": pt.id,
            "tier": tier,
            "position": position,
            "variant": variant,
            "title": title,
            "price": price,
            "list_price": list_price,
            "closeout": closeout,
            "stock": list(self._stock(row)),
            "rating": rating,
            "reviews": reviews,
            "fits": sorted(app.keys),
            "oem": list(split_list(row.get("oem"))),
            "xref": list(split_list(row.get("xref"))),
            "specs": [list(kv) for kv in specs],
            "warranty": warranty,
        }


def import_file(path: str | Path, catalog: Catalog | None = None) -> ImportReport:
    p = Path(path)
    return Importer(catalog).run(p.read_bytes(), source=p.name)


# ---------------------------------------------------------------------- exportación

EXPORT_HEADER = [
    "numero_parte", "marca", "tipo", "titulo", "nivel", "posicion", "variante", "precio", "precio_lista",
    "liquidacion", "calificacion", "resenas", "garantia", "aplicacion", "oem", "equivalencias", "caracteristicas",
]  # fmt: skip


def describe_fits(fits: Iterable[str], catalog: Catalog) -> str:
    """Claves → texto de aplicación legible que el importador vuelve a traducir a las mismas claves."""
    c = catalog
    out: list[str] = []
    runs: dict[tuple[str, str], set[int]] = {}
    for key in sorted(fits):
        kind, _, rest = key.partition(":")
        if kind == "*" or key == UNIVERSAL:
            return "Universal"
        if kind == "e":
            out.append(f"Motor {rest}")
            continue
        gid = rest.split(":", 1)[0]
        g = c.gen_by_id.get(gid)
        if g is None:
            continue
        if kind == "g":
            out.append(f"{_gen_label(g, c)} {g.start}-{g.end}")
        elif kind == "ge":
            out.append(f"{_gen_label(g, c)} {g.start}-{g.end} {rest.split(':', 1)[1]}")
        elif kind == "y":
            runs.setdefault((gid, ""), set()).add(int(rest.rsplit(":", 1)[1]))
        elif kind == "ye":
            _, y, code = rest.split(":", 2)
            runs.setdefault((gid, code), set()).add(int(y))
    for (gid, code), ys in runs.items():
        g = c.gen_by_id[gid]
        for r in year_ranges(ys).replace(" y ", ", ").split(", "):
            out.append(f"{_gen_label(g, c)} {r.replace('–', '-')}{' ' + code if code else ''}")
    return "; ".join(out)


def _gen_label(g: Generation, c: Catalog) -> str:
    m = c.model_by_id[g.model_id]
    return f"{c.make_by_id[m.make_id].name} {m.name} {g.code}"


def export_csv(inventory: Inventory, out: IO[str], limit: int | None = None, delimiter: str = ",") -> int:
    c = inventory.catalog
    w = csv.writer(out, delimiter=delimiter)
    w.writerow([*EXPORT_HEADER[:10], *(f"stock_{wh.id}" for wh in c.warehouses), *EXPORT_HEADER[10:]])
    n = 0
    for p in inventory.products[:limit]:
        specs = "; ".join(f"{k}: {v}" for k, v in p.specs if fold(k) not in _DERIVED_SPECS)
        w.writerow(
            [
                p.part_number,
                c.brand_by_id[p.brand_id].name,
                c.part_type_by_id[p.part_type_id].name,
                p.title,
                c.tier_by_id[p.tier].name,
                p.position or "",
                p.variant or "",
                f"{p.price:.2f}",
                f"{p.list_price:.2f}" if p.list_price else "",
                "sí" if p.closeout else "",
                *p.stock,
                f"{p.rating:g}" if p.reviews else "",
                p.reviews or "",
                p.warranty,
                describe_fits(p.fits, c),
                "; ".join(p.oem),
                "; ".join(p.xref),
                specs,
            ]
        )
        n += 1
    return n
