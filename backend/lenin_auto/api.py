"""API HTTP de Lenin Auto Cars (FastAPI). Documentación interactiva en /api/docs.

Ejecutar:  uvicorn lenin_auto.api:app  ·  o  python -m lenin_auto servir
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from . import __version__
from .catalog import VehicleQuery
from .config import settings
from .orders import OrderError
from .schemas import (
    CartIn,
    CartOut,
    CatalogOut,
    DiagnosisOut,
    HomeOut,
    OrderIn,
    OrderLookupIn,
    OrderOut,
    ProductDetailOut,
    SearchOut,
    ServicePlanOut,
    StatsOut,
    VerifyOut,
    VinOut,
)
from .search.engine import SearchRequest, Sort
from .security import RateLimitMiddleware, SecurityHeadersMiddleware
from .store import Store, get_store
from .vin import SAMPLE_VINS
from .workshop.maintenance import Pack


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_store()  # índices y modelos listos antes de la primera petición
    yield


app = FastAPI(
    title="Lenin Auto Cars API",
    version=__version__,
    description="Catálogo, búsqueda en lenguaje natural, diagnóstico y confianza para repuestos automotrices.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    RateLimitMiddleware,
    capacity=settings.rate_capacity,
    rate=settings.rate_per_second,
    trust_proxy=settings.trust_proxy,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("LENIN_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

StoreDep = Annotated[Store, Depends(get_store)]


def vehicle_params(
    make: str | None = None, model: str | None = None, year: int | None = None, engine: str | None = None
) -> VehicleQuery | None:
    v = VehicleQuery(make or None, model or None, year, engine or None)
    return None if v.empty else v


VehicleDep = Annotated[VehicleQuery | None, Depends(vehicle_params)]


def _csv(value: str | None) -> list[str]:
    return [x for x in (value or "").split(",") if x]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.get("/api/stats", response_model=StatsOut)
def stats(store: StoreDep) -> StatsOut:
    return store.stats


@app.get("/api/meta")
def meta(store: StoreDep) -> dict[str, Any]:
    """Datos de referencia para la interfaz: vehículos, taxonomía, marcas, síntomas, ajustes."""
    c = store.catalog
    return {
        "store": {
            "name": settings.name,
            "currency": settings.currency,
            "locale": settings.locale,
            "free_shipping_from": settings.free_shipping_from,
            "shipping_flat": settings.shipping_flat,
            "email": settings.email,
            "whatsapp": settings.whatsapp,
        },
        "makes": [{"id": m.id, "name": m.name, "years": c.years_of_make(m.id)} for m in c.makes],
        "models": [
            {
                "id": m.id,
                "make_id": m.make_id,
                "name": m.name,
                "body": m.body,
                "gens": [{"code": g.code, "start": g.start, "end": g.end, "engines": list(g.engines)} for g in m.gens],
            }
            for m in c.models
        ],
        "engines": {
            code: {"label": e.label(), "short": e.label(False), "fuel": e.fuel, "cyl": e.cyl}
            for code, e in c.engines.items()
        },
        "categories": [{"id": x.id, "name": x.name, "short": x.short, "blurb": x.blurb} for x in c.categories],
        "part_types": [{"id": p.id, "name": p.name, "cat": p.cat, "syn": list(p.syn[:3])} for p in c.part_types],
        "tiers": [
            {"id": t.id, "name": t.name, "short": t.short, "blurb": t.blurb, "warranty": t.warranty} for t in c.tiers
        ],
        "brands": [
            {
                "id": b.id,
                "name": b.name,
                "origin": b.origin,
                "trust": store.brand_trust[b.id].score,
                "grade": store.brand_trust[b.id].grade,
            }
            for b in c.brands
            if b.id in store.brand_trust
        ],
        "warehouses": [{"id": w.id, "name": w.name, "eta": list(w.eta)} for w in c.warehouses],
        "symptoms": [{"id": s.id, "label": s.label, "example": s.phrases[0]} for s in store.dx.symptoms],
        "sample_vins": [{"label": label, "vin": v} for label, v in SAMPLE_VINS],
        "stats": store.stats.model_dump(),
    }


@app.get("/api/search", response_model=SearchOut)
def search(
    store: StoreDep,
    vehicle: VehicleDep,
    q: str = "",
    cat: str | None = None,
    pt: str | None = None,
    brand: str | None = None,
    tier: str | None = None,
    pos: str | None = None,
    min: float | None = None,
    max: float | None = None,
    stock: bool = False,
    sale: bool = False,
    fit: bool = True,
    sort: Sort = "relevancia",
    page: Annotated[int, Query(ge=0)] = 0,
    size: Annotated[int, Query(ge=0, le=300)] = 24,
) -> SearchOut:
    req = SearchRequest(
        q=q[:200],
        category=_csv(cat),
        part_type=_csv(pt),
        brand=_csv(brand),
        tier=_csv(tier),
        position=_csv(pos),
        price_min=min,
        price_max=max,
        in_stock=stock,
        on_sale=sale,
        vehicle=vehicle,
        fit_only=fit,
        sort=sort,
        page=page,
        size=size,
    )
    return store.search(req)


@app.get("/api/suggest")
def suggest(store: StoreDep, q: str = "") -> list[str]:
    return store.engine.suggest(q[:200])


@app.get("/api/products/{product_id}", response_model=ProductDetailOut)
def product(product_id: str, store: StoreDep, vehicle: VehicleDep) -> ProductDetailOut:
    detail = store.product_detail(product_id, vehicle)
    if detail is None:
        raise HTTPException(404, "Pieza no encontrada")
    return detail


@app.get("/api/verify", response_model=VerifyOut)
def verify(store: StoreDep, token: str) -> VerifyOut:
    """Verifica un certificado de compatibilidad (firma HMAC-SHA256)."""
    return store.verify(token)


@app.post("/api/cart", response_model=CartOut)
def cart(body: CartIn, store: StoreDep) -> CartOut:
    return store.cart([(i.id, i.qty) for i in body.items])


@app.post("/api/orders", response_model=OrderOut, status_code=201)
def create_order(
    body: OrderIn, store: StoreDep, idempotency_key: Annotated[str | None, Header(max_length=80)] = None
) -> OrderOut:
    """Registra un pedido. Repetir la misma ``Idempotency-Key`` devuelve el mismo pedido."""
    v = body.vehicle
    vehicle = vehicle_params(v.make, v.model, v.year, v.engine) if v else None
    try:
        return store.place_order(body.customer, [(i.id, i.qty) for i in body.items], vehicle, idempotency_key)
    except OrderError as e:
        raise HTTPException(422, str(e)) from e


@app.post("/api/orders/lookup", response_model=OrderOut)
def lookup_order(body: OrderLookupIn, store: StoreDep) -> OrderOut:
    """Seguimiento con código y correo (misma respuesta si falta cualquiera de los dos)."""
    order = store.orders.get(body.code, body.email)
    if order is None:
        raise HTTPException(404, "No encontramos un pedido con ese código y correo.")
    return store.order_out(order)


@app.get("/api/service-plan", response_model=ServicePlanOut)
def service_plan(
    store: StoreDep, vehicle: VehicleDep, km: int | None = None, budget: float | None = None, pack: Pack = "rec"
) -> ServicePlanOut:
    if vehicle is None or not vehicle.complete:
        raise HTTPException(422, "Indica marca, modelo y año")
    return store.service_plan(vehicle, km, budget, pack)


@app.get("/api/diagnosis", response_model=DiagnosisOut | None)
def diagnosis(store: StoreDep, vehicle: VehicleDep, symptoms: str, km: int | None = None) -> DiagnosisOut | None:
    return store.diagnose(_csv(symptoms), vehicle, km)


@app.get("/api/vin/{vin}", response_model=VinOut)
def vin(vin: str, store: StoreDep, online: bool = False) -> VinOut:
    return store.decode_vin(vin, online)


@app.get("/api/catalog", response_model=CatalogOut)
def catalog(store: StoreDep, path: str = "") -> CatalogOut:
    return store.catalog_tree([s for s in path.split("/") if s][:6])


@app.get("/api/home", response_model=HomeOut)
def home(store: StoreDep, vehicle: VehicleDep) -> HomeOut:
    return store.home(vehicle)


_dist = Path(os.environ.get("LENIN_FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
