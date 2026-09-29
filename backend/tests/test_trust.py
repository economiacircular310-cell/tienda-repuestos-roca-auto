from datetime import UTC, datetime

from lenin_auto.catalog import VehicleQuery
from lenin_auto.config import settings
from lenin_auto.logistics.shipping import Line, plan_shipments
from lenin_auto.store import Store
from lenin_auto.trust import certificate
from lenin_auto.trust.fitment import assess
from lenin_auto.trust.ratings import bayesian_average, wilson_lower_bound
from lenin_auto.vin import SAMPLE_VINS, check_digit, decode


def test_promedio_bayesiano_desconfia_de_pocas_resenas() -> None:
    few = bayesian_average(5.0, 2, 4.2, 25)
    many = bayesian_average(4.7, 900, 4.2, 25)
    assert many > few


def test_wilson() -> None:
    assert wilson_lower_bound(9, 10) < wilson_lower_bound(90, 100) < 0.9
    assert wilson_lower_bound(0, 0) == 0


def test_un_mejor_valor_por_grupo(store: Store) -> None:
    groups = {store.inventory.by_id[i].group_key for i in store.values.best_value}
    assert len(groups) == len(store.values.best_value)


def test_confianza_de_marca(store: Store) -> None:
    t = store.brand_trust
    assert all(0 <= b.score <= 100 for b in t.values())
    assert t["denso"].oem_supplier and not t["lac-value"].oem_supplier


def test_compatibilidad_con_confianza(store: Store) -> None:
    p = next(x for x in store.inventory if x.fit == "e:2ZR-FE")
    c = store.catalog
    assert assess(p, VehicleQuery("toyota", "toyota-corolla", 2016, "2ZR-FE"), c).status == "confirmada"
    assert assess(p, VehicleQuery("toyota", "toyota-corolla", 2016), c).status == "condicional"  # 1ZR o 2ZR
    assert assess(p, VehicleQuery("nissan", "nissan-versa", 2016), c).status == "no"
    assert assess(p, None, c).status == "sin-vehiculo"


def test_certificado_hmac() -> None:
    when = datetime(2026, 9, 29, tzinfo=UTC)
    cert = certificate.issue(settings.secret, "bosch-x", "0 986", {"model": "toyota-corolla", "year": 2016}, when)
    assert cert.code.startswith("LAC-")
    ok = certificate.verify(settings.secret, cert.token)
    assert ok and ok.payload["p"] == "bosch-x" and ok.payload["iat"] == "2026-09-29"
    assert certificate.verify(settings.secret, cert.token[:-2] + "AA") is None
    assert certificate.verify(b"otra-clave", cert.token) is None
    assert certificate.verify(settings.secret, "basura") is None


def test_envios_minimos(store: Store) -> None:
    base = store.inventory.products[0]
    mk = lambda stock: base.__class__(**{**{s: getattr(base, s) for s in base.__slots__}, "stock": stock})  # noqa: E731
    whs = store.catalog.warehouses
    one = plan_shipments([Line(mk((2, 5, 0)), 1), Line(mk((0, 3, 1)), 2)], whs)
    assert len(one.shipments) == 1 and one.shipments[0].warehouse.id == whs[1].id
    two = plan_shipments([Line(mk((3, 0, 0)), 1), Line(mk((0, 0, 4)), 1), Line(mk((0, 0, 0)), 1)], whs)
    assert len(two.shipments) == 2 and len(two.backorder) == 1
    split = plan_shipments([Line(mk((2, 2, 0)), 3)], whs)
    assert sum(x.qty for s in split.shipments for x in s.items) == 3


def test_vin() -> None:
    for _, vin in SAMPLE_VINS:
        r = decode(vin, 2026)
        assert r.valid and r.check_ok and r.make_id in {"toyota", "honda", "nissan"}
    assert decode(SAMPLE_VINS[0][1], 2026).year == 2016
    assert not decode("ABC", 2026).valid
    assert "I, O ni Q" in (decode("1HGCM82633A00435O", 2026).error or "")
    assert check_digit("1M8GDM9AXKP042788") == "X"
