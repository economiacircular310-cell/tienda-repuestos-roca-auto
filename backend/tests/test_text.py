import pytest

from lenin_auto.search.phonetic import phonetic_key
from lenin_auto.search.symspell import SymSpell
from lenin_auto.search.text import damerau, fold, index_terms, looks_like_pn, norm_pn, stem


def test_fold_y_stem() -> None:
    assert fold("Bujía Ñandú") == "bujia nandu"
    assert [stem(w) for w in ("pastillas", "amortiguadores", "luces", "discos", "5w30")] == [
        "pastilla",
        "amortiguador",
        "luz",
        "disco",
        "5w30",
    ]


def test_index_terms_une_guiones() -> None:
    assert {"x", "trail", "xtrail", "5w", "30", "5w30"} <= set(index_terms("X-Trail 5W-30"))


@pytest.mark.parametrize(
    ("a", "b", "d"), [("corrola", "corolla", 2), ("toyta", "toyota", 1), ("abc", "abc", 0), ("ab", "ba", 1)]
)
def test_damerau(a: str, b: str, d: int) -> None:
    assert damerau(a, b) == d


def test_numeros_de_parte() -> None:
    assert norm_pn("p 83-140") == "P83140"
    assert looks_like_pn("P83140") and looks_like_pn("0986") and not looks_like_pn("2016") and not looks_like_pn("h4")


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("balbula", "válvula"),
        ("amortiwador", "amortiguador"),
        ("bugia", "bujía"),
        ("yanta", "llanta"),
        ("enbrague", "embrague"),
    ],
)
def test_fonetica_iguala_homofonos(a: str, b: str) -> None:
    assert phonetic_key(a) == phonetic_key(b)


def test_fonetica_distingue_g_suave() -> None:
    assert phonetic_key("guerra") != phonetic_key("gera")


def test_symspell() -> None:
    s = SymSpell()
    for w, n in (("amortiguador", 50), ("corolla", 30), ("filtro", 100)):
        s.add(w, n)
    assert s.lookup("amortiguadr")[0].term == "amortiguador"
    assert s.lookup("filtor")[0].term == "filtro"
    assert s.lookup("xyzxyz") == []
