"""Contrato público de la API (Pydantic v2). FastAPI genera con esto la documentación OpenAPI."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Ref(BaseModel):
    id: str
    name: str


class BrandRef(Ref):
    origin: str
    trust: int = Field(description="Índice de confianza de marca, 0–100")
    grade: str


class TierRef(Ref):
    short: str


class Availability(BaseModel):
    in_stock: bool
    total: int
    low: bool
    text: str
    warehouse: str | None
    eta: tuple[int, int] | None


class FairPriceOut(BaseModel):
    percentile: int
    label: str
    median: float


class ProductOut(BaseModel):
    id: str
    part_number: str
    title: str
    brand: BrandRef
    part_type: Ref
    category: Ref
    tier: TierRef
    position: str | None
    variant: str | None
    price: float
    list_price: float | None
    discount_pct: int
    closeout: bool
    stock: list[int]
    availability: Availability
    rating: float
    reviews: int
    rating_adjusted: float = Field(description="Promedio bayesiano")
    satisfaction: float = Field(description="Cota inferior de Wilson (95 %) de clientes satisfechos")
    fit: str
    oem: list[str]
    xref: list[str]
    specs: list[tuple[str, str]]
    warranty: str
    best_value: bool
    fair_price: FairPriceOut


class HitOut(BaseModel):
    product: ProductOut
    fits: bool
    marks: list[tuple[int, int]]


class ChipOut(BaseModel):
    kind: str
    label: str
    without: str
    corrected: bool


class FacetValueOut(BaseModel):
    value: str
    label: str
    count: int
    selected: bool


class VehicleOut(BaseModel):
    make_id: str | None
    model_id: str | None
    year: int | None
    engine: str | None
    fuel: str | None
    label: str


class CauseOut(BaseModel):
    part_type_id: str
    name: str
    p: float
    wear: float


class DiagnosisOut(BaseModel):
    label: str
    advice: str
    km: int
    km_estimated: bool
    symptoms: list[Ref]
    causes: list[CauseOut]


class CorrectionOut(BaseModel):
    written: str
    understood: str
    channel: str


class PriceStats(BaseModel):
    min: float
    max: float
    hist: list[int]


class PNMatch(BaseModel):
    kind: str
    raw: str
    count: int


class SearchOut(BaseModel):
    q: str
    total: int
    items: list[HitOut]
    facets: dict[str, list[FacetValueOut]]
    price: PriceStats
    in_stock_count: int
    on_sale_count: int
    chips: list[ChipOut]
    text: str
    corrections: list[CorrectionOut]
    vehicle: VehicleOut | None
    vehicle_source: str | None
    hidden_by_fitment: int
    relaxed: bool
    pn_match: PNMatch | None
    diagnosis: DiagnosisOut | None
    suggestions: list[str]
    took_ms: float


class FitmentOut(BaseModel):
    status: str
    confidence: float
    reason: str


class FitRow(BaseModel):
    make_id: str
    make: str
    model_id: str
    model: str
    generation: str
    years: tuple[int, int]
    engines: list[str]


class CertificateOut(BaseModel):
    code: str
    token: str
    vehicle: str
    issued: str


class BrandTrustOut(BaseModel):
    score: int
    grade: str
    rating: float
    reviews: int
    references: int
    in_stock_pct: int
    oem_supplier: bool


class ProductDetailOut(BaseModel):
    product: ProductOut
    fitment: FitmentOut
    vehicles: list[FitRow]
    alternatives: list[ProductOut]
    related: list[ProductOut]
    brand_trust: BrandTrustOut
    certificate: CertificateOut | None


class VerifyOut(BaseModel):
    valid: bool
    code: str | None = None
    product: ProductOut | None = None
    vehicle: str | None = None
    issued: str | None = None


class CartItemIn(BaseModel):
    id: str
    qty: int = Field(ge=1, le=99)


class CartIn(BaseModel):
    items: list[CartItemIn]


class CartLineOut(BaseModel):
    product: ProductOut
    qty: int
    total: float


class ShipmentItem(BaseModel):
    id: str
    part_number: str
    qty: int


class ShipmentOut(BaseModel):
    warehouse: Ref
    eta: tuple[int, int]
    items: list[ShipmentItem]


class CartOut(BaseModel):
    lines: list[CartLineOut]
    missing: list[str]
    subtotal: float
    shipping: float
    total: float
    free_shipping_left: float
    shipments: list[ShipmentOut]
    backorder: list[ShipmentItem]
    eta: tuple[int, int] | None


class PlanLineOut(BaseModel):
    part_type_id: str
    name: str
    every: int
    why: str
    priority: int
    position: str | None
    qty: int
    picks: dict[str, ProductOut]
    cost: dict[str, float]


class MilestoneOut(BaseModel):
    km: int
    tasks: list[str]


class BudgetOut(BaseModel):
    pack: str
    budget: float
    now: list[str]
    later: list[str]
    total: float
    priority_kept: int
    priority_total: int


class ServicePlanOut(BaseModel):
    km: int
    vehicle: str
    engine: str | None
    lines: list[PlanLineOut]
    totals: dict[str, float]
    milestones: list[MilestoneOut]
    budget: BudgetOut | None


class VinOut(BaseModel):
    vin: str
    valid: bool
    error: str | None
    make_id: str | None
    make: str | None
    region: str | None
    year: int | None
    check_ok: bool | None
    model_id: str | None
    model: str | None
    engine: str | None
    online: str | None


class ColumnItem(BaseModel):
    id: str
    label: str
    sub: str | None = None
    count: int | None = None
    icon: str | None = None


class ColumnOut(BaseModel):
    key: str
    title: str
    base: list[str]
    selected: str | None
    items: list[ColumnItem]


class ListingGroup(BaseModel):
    position: str
    items: list[ProductOut]


class CatalogOut(BaseModel):
    vehicle: VehicleOut | None
    ready: bool
    columns: list[ColumnOut]
    part_type: str | None
    listing: list[ListingGroup]


class StatsOut(BaseModel):
    products: int
    brands: int
    vehicles: int
    part_types: int
    build_ms: int
    median_query_ms: float


class HomeOut(BaseModel):
    stats: StatsOut
    category_counts: dict[str, int]
    deals: list[ProductOut]
    deals_total: int
    tier_showcase_title: str
    tier_showcase: dict[str, ProductOut | None]
    part_number_samples: list[dict[str, str]]
    service: ServicePlanOut | None
