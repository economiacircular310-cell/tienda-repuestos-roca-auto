"""Clave fonética para el español de Latinoamérica.

Dos palabras que suenan igual producen la misma clave, así que «balbula» encuentra
«válvula», «amortiwador» encuentra «amortiguador» y «bugia» encuentra «bujía».
Se aplica después de plegar acentos; reglas en orden:

    qu+e/i → k        gu+e/i → g (dura)    gü → gu           w → gu
    c+e/i → s         z → s                c → k             q → k        x → ks
    g+e/i → j (jota)  ll → y               y final → i       v → b
    h muda (salvo en ch → x)               n+b/p → m         letras dobles → una
"""

from __future__ import annotations

import re
from functools import lru_cache

from .text import fold

_RULES: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(p), r)
    for p, r in (
        (r"ch", "X"),
        (r"qu(?=[ei])", "k"),
        (r"gu(?=[ei])", "G"),
        (r"w", "gu"),
        (r"c(?=[ei])", "s"),
        (r"g(?=[ei])", "j"),
        (r"g", "G"),
        (r"z", "s"),
        (r"c", "k"),
        (r"q", "k"),
        (r"x", "ks"),
        (r"ll", "y"),
        (r"y$", "i"),
        (r"v", "b"),
        (r"h", ""),
        (r"n(?=[bp])", "m"),
        (r"(.)\1+", r"\1"),
    )
)


@lru_cache(maxsize=65_536)
def phonetic_key(word: str) -> str:
    key = fold(word)
    for pattern, repl in _RULES:
        key = pattern.sub(repl, key)
    return key.lower()
