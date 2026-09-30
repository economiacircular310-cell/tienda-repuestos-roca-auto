import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from lenin_auto.security import RateLimitMiddleware, SecurityHeadersMiddleware, TokenBucket


def test_token_bucket_rafaga_y_recarga() -> None:
    b = TokenBucket(capacity=3, rate=1.0)
    assert [b.take("ip", now=0).allowed for _ in range(4)] == [True, True, True, False]
    denied = b.take("ip", now=0)
    assert denied.retry_after == pytest.approx(1.0)
    assert b.take("ip", now=1.0).allowed  # un segundo después hay una ficha nueva
    assert b.take("otra-ip", now=1.0).allowed  # cada cliente tiene su cubeta


def test_token_bucket_memoria_acotada() -> None:
    b = TokenBucket(capacity=1, rate=1.0, max_keys=2)
    for key in ("a", "b", "c"):
        b.take(key, now=0)
    assert len(b._buckets) == 2


@pytest.fixture
def tiny() -> TestClient:
    app = FastAPI()

    @app.get("/api/ping")
    def ping() -> dict[str, str]:
        return {"ok": "sí"}

    @app.get("/pagina")
    def page() -> dict[str, str]:
        return {"ok": "sí"}

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware, capacity=2, rate=0.001)
    return TestClient(app)


def test_middleware_limita_y_explica(tiny: TestClient) -> None:
    ok = tiny.get("/api/ping")
    assert ok.status_code == 200 and ok.headers["ratelimit-limit"] == "2"
    tiny.get("/api/ping")
    blocked = tiny.get("/api/ping")
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0
    assert "Demasiadas" in blocked.json()["detail"]
    assert tiny.get("/pagina").status_code == 200  # fuera de /api/ no se limita


def test_cabeceras_de_seguridad(tiny: TestClient) -> None:
    h = tiny.get("/pagina").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert "default-src 'self'" in h["content-security-policy"]
    assert "frame-ancestors 'none'" in h["content-security-policy"]


def test_ip_detras_de_proxy_no_se_puede_falsear() -> None:
    from lenin_auto.security import _client_key

    scope = {"client": ("10.0.0.2", 5000), "headers": [(b"x-forwarded-for", b"1.2.3.4, 203.0.113.9")]}
    assert _client_key(scope, trust_proxy=True) == "203.0.113.9"  # la que agregó el proxy
    assert _client_key(scope, trust_proxy=False) == "10.0.0.2"
