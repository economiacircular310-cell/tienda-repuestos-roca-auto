from lenin_auto.catalog import VehicleQuery
from lenin_auto.search.engine import SearchRequest
from lenin_auto.search.text import norm_pn
from lenin_auto.store import Store


def q(store: Store, text: str, **kw):  # type: ignore[no-untyped-def]
    return store.engine.search(SearchRequest(q=text, **kw))


def test_parser_entiende_la_frase_completa(store: Store) -> None:
    r = store.engine.parser.parse("pastillas delanteras corolla 2016 menos de 60")
    assert r.part_types == ["pastillas-freno"]
    assert r.positions == ["Delantero"]
    assert r.vehicle == VehicleQuery("toyota", "toyota-corolla", 2016)
    assert r.price_max == 60 and r.text == ""


def test_sinonimos_regionales(store: Store) -> None:
    p = store.engine.parser
    assert p.parse("balatas").part_types == ["pastillas-freno"]
    assert p.parse("mofle").part_types == ["silenciador"]
    assert p.parse("croche").part_types == ["kit-embrague"]
    assert p.parse("filtro de aire acondicionado").part_types == ["filtro-cabina"]
    assert p.parse("filtro de aire").part_types == ["filtro-aire"]


def test_corrige_marca_y_modelo(store: Store) -> None:
    r = store.engine.parser.parse("toyta corrola")
    assert r.vehicle and r.vehicle.model_id == "toyota-corolla"
    assert len(r.corrections) == 2


def test_motor_por_cilindrada_y_codigo(store: Store) -> None:
    p = store.engine.parser
    assert p.parse("hilux 2018 2.8").vehicle.engine == "1GD-FTV"  # type: ignore[union-attr]
    assert p.parse("bomba de agua 2zr-fe").vehicle.engine == "2ZR-FE"  # type: ignore[union-attr]


def test_quitar_chip(store: Store) -> None:
    r = store.engine.parser.parse("pastillas corolla 2016")
    vehicle_chip = next(c for c in r.chips if c.kind == "vehicle")
    assert vehicle_chip.without == "pastillas"


def test_compatibilidad_por_consulta(store: Store) -> None:
    r = q(store, "pastillas delanteras corolla 2016", size=100)
    assert r.total > 1 and r.vehicle_source == "query"
    assert all(h.product.fits == {"g:toyota-corolla-e170"} and h.product.position == "Delantero" for h in r.hits)


def test_compatibilidad_por_garaje(store: Store) -> None:
    r = q(store, "filtro de aceite", vehicle=VehicleQuery("nissan", "nissan-versa", 2018, "HR16DE"))
    assert r.total > 0 and all(h.product.fits == {"e:HR16DE"} for h in r.hits)
    assert r.vehicle_source == "garage" and r.hidden_by_fitment > 100


def test_numero_de_parte_en_cualquier_formato(store: Store) -> None:
    p = next(x for x in store.inventory if " " in x.part_number)
    r = q(store, p.part_number.replace(" ", "-").lower())
    assert r.pn_match and r.pn_match[0] == "pn" and r.hits[0].product.id == p.id


def test_oem_devuelve_equivalentes(store: Store) -> None:
    p = next(x for x in store.inventory if x.oem and x.fit_id.startswith("g:"))
    r = q(store, p.oem[0], size=50)
    equivalents = [x for x in store.inventory if p.oem[0] in x.oem]
    assert r.pn_match and r.pn_match[0] == "oem" and r.total == len(equivalents) > 1


def test_numero_parcial(store: Store) -> None:
    p = next(x for x in store.inventory if x.brand_id == "brembo")
    r = q(store, norm_pn(p.part_number)[:5], size=300)
    assert any(h.product.id == p.id for h in r.hits)


def test_ortografia_y_fonetica(store: Store) -> None:
    assert q(store, "amortiguadr").hits[0].product.part_type_id == "amortiguador"
    r = q(store, "balbula")
    assert r.total > 0 and r.corrections[0][2] == "fonética"


def test_facetas_disyuntivas(store: Store) -> None:
    r = store.engine.search(SearchRequest(q="pastillas", brand=["bosch"]))
    brands = r.facets["brand"]
    assert brands[0].value == "bosch" and brands[0].selected
    assert sum(1 for f in brands if f.count > 0) > 3
    assert all(h.product.brand_id == "bosch" for h in r.hits)


def test_precio_y_orden(store: Store) -> None:
    r = store.engine.search(SearchRequest(q="bujia", price_max=10, sort="precio-asc", size=50))
    prices = [h.product.price for h in r.hits]
    assert prices and all(x <= 10 for x in prices) and prices == sorted(prices)


def test_primera_pagina_diversificada(store: Store) -> None:
    r = q(store, "pastillas", size=12)
    assert len({h.product.brand_id for h in r.hits}) >= 6
    assert len({h.product.tier for h in r.hits}) >= 3


def test_autocompletado(store: Store) -> None:
    assert store.engine.suggest("amortig")[0] == "amortiguador"
    assert store.engine.suggest("corolla pastil")[0].startswith("corolla pastillas")


def test_latencia(store: Store) -> None:
    assert store.engine.benchmark(rounds=1) < 150
