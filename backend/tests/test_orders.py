from datetime import date

import pytest
from fastapi.testclient import TestClient

from lenin_auto.api import app
from lenin_auto.catalog import VehicleQuery
from lenin_auto.orders import (
    ALPHABET,
    OrderBook,
    OrderError,
    add_business_days,
    luhn_valid,
    new_order_code,
    normalize_code,
)
from lenin_auto.schemas import CustomerIn
from lenin_auto.search.engine import SearchRequest
from lenin_auto.store import Store

CLIENTE = CustomerIn(name="Lenin Pérez", email="Lenin@Correo.com", phone="+57 300 000 0000", city="Bogotá")
COROLLA = VehicleQuery("toyota", "toyota-corolla", 2016, "2ZR-FE")


def test_codigo_detecta_errores_de_tipeo() -> None:
    for _ in range(300):
        body = new_order_code().replace("LAC-", "").replace("-", "")
        assert luhn_valid(body)
        for i in range(len(body)):  # cualquier carácter cambiado, en cualquier posición
            for c in ALPHABET:
                if c != body[i]:
                    assert not luhn_valid(body[:i] + c + body[i + 1 :])
        for j in range(len(body) - 1):  # transposiciones de vecinos
            a, b = body[j], body[j + 1]
            if a != b and {a, b} != {"0", "Z"}:  # única excepción teórica de Luhn mod N (valores 0 y N−1)
                assert not luhn_valid(body[:j] + b + a + body[j + 2 :])


def test_codigo_tolerante_al_dictado() -> None:
    code = new_order_code()
    messy = code.lower().replace("-", " ").replace("0", "o").replace("1", "l")
    assert normalize_code(messy) == code
    assert normalize_code("LAC-XXXX-XXXX-X") is None


def test_dias_habiles_saltan_domingo() -> None:
    saturday = date(2026, 10, 3)
    assert add_business_days(saturday, 1) == date(2026, 10, 5)


def test_pedido_con_certificados_idempotente_y_privado(store: Store) -> None:
    pads = store.engine.search(SearchRequest(q="pastillas delanteras", vehicle=COROLLA, size=1)).hits[0].product
    oil = next(p for p in store.inventory if p.part_type_id == "aceite-motor" and p.in_stock)
    items = [(pads.id, 1), (oil.id, 2)]
    first = store.place_order(CLIENTE, items, COROLLA, idem_key="intento-1")
    again = store.place_order(CLIENTE, items, COROLLA, idem_key="intento-1")
    assert first.code == again.code
    assert first.status == "recibido" and first.events[0].note == "Pedido registrado"
    by_id = {line.product_id: line for line in first.lines}
    assert by_id[pads.id].certificate is not None  # compatibilidad confirmada → certificado
    assert by_id[oil.id].certificate is None and by_id[oil.id].fitment == "universal"
    assert first.total == pytest.approx(first.subtotal + first.shipping)
    assert store.orders.get(first.code, "lenin@correo.com") is not None
    assert store.orders.get(first.code, "otro@correo.com") is None


def test_maquina_de_estados(store: Store) -> None:
    oil = next(p for p in store.inventory if p.part_type_id == "aceite-motor")
    o = store.place_order(CLIENTE, [(oil.id, 1)], None)
    with pytest.raises(OrderError):
        store.orders.advance(o.code, "entregado")
    store.orders.advance(o.code, "preparando")
    done = store.orders.advance(o.code, "enviado", "Guía 123")
    assert [e.status for e in store.order_out(done).events] == ["recibido", "preparando", "enviado"]


def test_validacion_de_cliente() -> None:
    with pytest.raises(OrderError):
        OrderBook.validate_customer({"name": "A", "email": "x@y.com"})
    with pytest.raises(OrderError):
        OrderBook.validate_customer({"name": "Ana", "email": "sin-arroba"})


def test_api_de_pedidos() -> None:
    with TestClient(app) as c:
        pid = c.get("/api/search", params={"q": "filtro de aceite", "size": 1, "stock": True}).json()["items"][0][
            "product"
        ]["id"]
        body = {"customer": {"name": "Ana Gómez", "email": "ana@correo.com"}, "items": [{"id": pid, "qty": 1}]}
        r = c.post("/api/orders", json=body, headers={"Idempotency-Key": "k-1"})
        assert r.status_code == 201
        code = r.json()["code"]
        assert c.post("/api/orders", json=body, headers={"Idempotency-Key": "k-1"}).json()["code"] == code
        assert c.post("/api/orders/lookup", json={"code": code.lower(), "email": "ANA@correo.com"}).status_code == 200
        assert c.post("/api/orders/lookup", json={"code": code, "email": "otra@correo.com"}).status_code == 404
        bad = c.post("/api/orders", json={**body, "customer": {"name": "Ana", "email": "no"}})
        assert bad.status_code == 422 and "correo" in bad.json()["detail"]
        assert c.post("/api/orders", json={**body, "items": []}).status_code == 422
