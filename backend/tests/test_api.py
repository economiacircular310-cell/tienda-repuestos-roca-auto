import pytest
from fastapi.testclient import TestClient

from lenin_auto.api import app

VEH = {"make": "toyota", "model": "toyota-corolla", "year": 2016, "engine": "2ZR-FE"}


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c  # type: ignore[misc]


def test_salud_y_meta(client: TestClient) -> None:
    assert client.get("/api/health").json()["status"] == "ok"
    meta = client.get("/api/meta").json()
    assert meta["store"]["name"] == "Lenin Auto Cars"
    assert meta["stats"]["products"] > 20_000 and len(meta["symptoms"]) == 24


def test_busqueda(client: TestClient) -> None:
    r = client.get("/api/search", params={"q": "balatas delanteras hilux 2018", "size": 5}).json()
    assert r["total"] > 0 and {c["kind"] for c in r["chips"]} >= {"vehicle", "partType", "position"}
    item = r["items"][0]
    assert item["fits"] and item["product"]["availability"]["text"] and item["marks"]


def test_busqueda_valida_parametros(client: TestClient) -> None:
    assert client.get("/api/search", params={"size": 1000}).status_code == 422
    assert client.get("/api/search", params={"sort": "otro"}).status_code == 422


def test_ficha_certificado_y_verificacion(client: TestClient) -> None:
    pid = client.get("/api/search", params={"q": "pastillas corolla 2016", "size": 1}).json()["items"][0]["product"][
        "id"
    ]
    d = client.get(f"/api/products/{pid}", params=VEH).json()
    assert d["fitment"]["status"] == "confirmada" and d["certificate"]["code"].startswith("LAC-")
    ok = client.get("/api/verify", params={"token": d["certificate"]["token"]}).json()
    assert ok["valid"] and ok["product"]["id"] == pid
    assert not client.get("/api/verify", params={"token": "a.b"}).json()["valid"]
    assert client.get("/api/products/no-existe").status_code == 404


def test_carrito(client: TestClient) -> None:
    pid = client.get("/api/search", params={"q": "filtro", "size": 1, "stock": True}).json()["items"][0]["product"][
        "id"
    ]
    c = client.post("/api/cart", json={"items": [{"id": pid, "qty": 1}, {"id": "no-existe", "qty": 1}]}).json()
    assert c["missing"] == ["no-existe"] and c["shipments"] and c["total"] >= c["subtotal"]
    assert client.post("/api/cart", json={"items": [{"id": pid, "qty": 0}]}).status_code == 422


def test_servicio_diagnostico_vin_catalogo_inicio(client: TestClient) -> None:
    sp = client.get("/api/service-plan", params={**VEH, "km": 40000, "budget": 150}).json()
    assert sp["km"] == 40000 and sp["budget"]["total"] <= 151
    assert client.get("/api/service-plan", params={"km": 40000}).status_code == 422
    dx = client.get("/api/diagnosis", params={"symptoms": "ruido-frenar,vibra-frenar", "year": 2016}).json()
    assert dx["causes"][0]["part_type_id"] == "disco-freno"
    assert client.get("/api/vin/2T1BURHE3GC741258").json()["year"] == 2016
    cat = client.get("/api/catalog", params={"path": "toyota/2016/toyota-corolla/2ZR-FE/frenos/pastillas-freno"}).json()
    assert cat["ready"] and len(cat["columns"]) == 6 and cat["listing"]
    home = client.get("/api/home", params=VEH).json()
    assert home["category_counts"]["frenos"] > 0 and home["service"]["lines"]
