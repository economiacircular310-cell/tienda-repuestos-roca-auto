"""Texto en español latinoamericano: acentos, plurales, errores de tipeo y números de parte."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache

from ..catalog import load_json

STOPWORDS: frozenset[str] = frozenset(load_json("stopwords.json"))
_TOKEN_RE = re.compile(r"[^\W_]+(?:[.,]\d+)?")
_INDEX_RE = re.compile(r"[a-z0-9]+(?:\.\d+)?")
_JOINED_RE = re.compile(r"[a-z0-9]+(?:[-/][a-z0-9]+)+")
_NOT_ALNUM = re.compile(r"[^A-Z0-9]")


@lru_cache(maxsize=65_536)
def fold(text: str) -> str:
    """Minúsculas sin diacríticos. Conserva la longitud de caracteres precompuestos (á → a)."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


@lru_cache(maxsize=65_536)
def stem(term: str) -> str:
    """Singulariza con reglas simples y predecibles; la misma regla indexa y busca."""
    if len(term) <= 3 or any(ch.isdigit() for ch in term):
        return term
    if term.endswith("ces"):
        return term[:-3] + "z"
    if len(term) > 4 and term[-2:] == "es" and term[-3] in "rlndj":
        return term[:-2]
    if term.endswith("s") and not term.endswith("ss"):
        return term[:-1]
    return term


@dataclass(frozen=True, slots=True)
class Token:
    raw: str
    f: str  # plegado (sin acentos, minúsculas)
    s: str  # lema (singular)
    start: int
    end: int

    @property
    def is_stop(self) -> bool:
        return self.f in STOPWORDS


def tokenize(text: str) -> list[Token]:
    out: list[Token] = []
    for m in _TOKEN_RE.finditer(text):
        f = fold(m.group()).replace(",", ".")
        out.append(Token(m.group(), f, stem(f), m.start(), m.end()))
    return out


def index_terms(text: str) -> list[str]:
    """Términos del índice: separa 'x-trail' y además indexa la forma unida 'xtrail'."""
    folded = fold(text)
    parts = _INDEX_RE.findall(folded)
    joined = [j.replace("-", "").replace("/", "") for j in _JOINED_RE.findall(folded)]
    return [stem(t) for t in (*parts, *joined) if t not in STOPWORDS]


def norm_pn(text: str) -> str:
    """'P 83 140', 'p83-140' y 'P83140' son el mismo número de parte."""
    return _NOT_ALNUM.sub("", text.upper())


def damerau(a: str, b: str, limit: int = 2) -> int:
    """Distancia de Damerau-Levenshtein (alineamiento óptimo) con corte temprano en ``limit``."""
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if abs(la - lb) > limit:
        return limit + 1
    prev2: list[int] = []
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        row_min = i
        ai = a[i - 1]
        for j in range(1, lb + 1):
            cost = 0 if ai == b[j - 1] else 1
            v = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if i > 1 and j > 1 and ai == b[j - 2] and a[i - 2] == b[j - 1]:
                v = min(v, prev2[j - 2] + 1)
            cur[j] = v
            row_min = min(row_min, v)
        if row_min > limit:
            return limit + 1
        prev2, prev = prev, cur
    return prev[lb]


def typo_budget(length: int) -> int:
    """Errores tolerados según la longitud de la palabra (1 desde 5 letras, 2 desde 8)."""
    return 2 if length >= 8 else 1 if length >= 5 else 0


def looks_like_pn(key: str) -> bool:
    """¿Parece número de parte? Letras y dígitos o 5+ dígitos; nunca un año."""
    if len(key) < 3 or re.fullmatch(r"(19|20)\d\d", key):
        return False
    digits = sum(ch.isdigit() for ch in key)
    if not digits:
        return False
    return digits >= 4 or (digits >= 2 and any(ch.isalpha() for ch in key) and len(key) >= 4)
