"""Fachada de la tienda: arma catálogo, inventario, modelos e índices una sola vez y expone
cada caso de uso como un método. La API (``api.py``) y la CLI (``cli.py``) solo traducen.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from functools import cached_property, lru_cache

from . import vin as vin_lib
from .catalog import TIER_ORDER, VehicleQuery, load_catalog
from .config import settings
from .inventory import Product, load_inventory
from .logistics.shipping import Line, plan_shipments
from .schemas import (
    Availability,
    BrandRef,
    BrandTrustOut,
    BudgetOut,
    CartLineOut,
    CartOut,
    CatalogOut,
    CauseOut,
    CertificateOut,
    ChipOut,
    ColumnItem,
    ColumnOut,
    CorrectionOut,
    DiagnosisOut,
    FacetValueOut,
    FairPriceOut,
    FitmentOut,
    FitRow,
    HitOut,
    HomeOut,
    ListingGroup,
    MilestoneOut,
    PlanLineOut,
    PNMatch,
    PriceStats,
    ProductDetailOut,
    ProductOut,
    Ref,
    SearchOut,
    ServicePlanOut,
    ShipmentItem,
    ShipmentOut,
    StatsOut,
    TierRef,
    VehicleOut,
    VerifyOut,
    VinOut,
)
from .search.engine import SearchEngine, SearchRequest, SearchResult
from .trust import certificate
from .trust.brand import brand_trust
from .trust.fitment import assess
from .trust.ratings import RatingModel
from .trust.value import ValueModel
from .workshop.diagnosis import Diagnosis, Diagnostician
from .workshop.maintenance import PACKS, Pack, Planner, milestones


class Store:
    def __init__(self) -> None:
        t0 = time.perf_counter()
        self.catalog = load_catalog()
        self.inventory = load_inventory()
        self.ratings = RatingModel.fit([(p.rating, p.reviews) for p in self.inventory])
        self.values = ValueModel(self.inventory, self.ratings)
        self.brand_trust = brand_trust(self.catalog, self.inventory, self.ratings)
        self.dx = Diagnostician(self.catalog, settings.km_per_year)
        self.engine = SearchEngine(self.catalog, self.inventory, self.ratings, self.dx)
        self.planner = Planner(self.catalog, self.inventory, self.ratings, self.values)
        self.build_ms = round((time.perf_counter() - t0) * 1000)
        self.median_query_ms = self.engine.benchmark()

    # ------------------------------------------------------------------ conversión

    def vehicle_out(self, v: VehicleQuery | None) -> VehicleOut | None:
        if v is None or v.empty:
            return None
        return VehicleOut(
            make_id=v.make_id,
            model_id=v.model_id,
            year=v.year,
            engine=v.engine,
            fuel=v.fuel,
            label=self.catalog.vehicle_label(v, engine=False) or (v.fuel or "Vehículo"),
        )

    def availability(self, p: Product) -> Availability:
        whs = self.catalog.warehouses
        stocked = [(w, p.stock[i]) for i, w in enumerate(whs) if p.stock[i] > 0]
        if not stocked:
            return Availability(
                in_stock=False, total=0, low=False, text="Bajo pedido · 5–8 días", warehouse=None, eta=None
            )
        w, _ = min(stocked, key=lambda x: x[0].eta[0])
        total = p.stock_total
        prefix = f"Últimas {total} unidades · " if total < 5 else "En stock · "
        return Availability(
            in_stock=True,
            total=total,
            low=total < 5,
            text=f"{prefix}llega en {w.eta[0]}–{w.eta[1]} días",
            warehouse=w.name,
            eta=w.eta,
        )

    def product_out(self, p: Product) -> ProductOut:
        c = self.catalog
        brand = c.brand_by_id[p.brand_id]
        trust = self.brand_trust[p.brand_id]
        tier = c.tier_by_id[p.tier]
        fair = self.values.fair_price(p)
        return ProductOut(
            id=p.id,
            part_number=p.part_number,
            title=p.title,
            brand=BrandRef(id=brand.id, name=brand.name, origin=brand.origin, trust=trust.score, grade=trust.grade),
            part_type=Ref(id=p.part_type_id, name=c.part_type_by_id[p.part_type_id].name),
            category=Ref(id=p.cat_id, name=c.category_by_id[p.cat_id].name),
            tier=TierRef(id=tier.id, name=tier.name, short=tier.short),
            position=p.position,
            variant=p.variant,
            price=p.price,
            list_price=p.list_price,
            discount_pct=p.discount_pct,
            closeout=p.closeout,
            stock=list(p.stock),
            availability=self.availability(p),
            rating=p.rating,
            reviews=p.reviews,
            rating_adjusted=round(self.ratings.adjusted(p.rating, p.reviews), 2),
            satisfaction=round(self.ratings.satisfaction(p.rating, p.reviews), 3),
            fit=p.fit,
            oem=list(p.oem),
            xref=list(p.xref),
            specs=list(p.specs),
            warranty=p.warranty,
            best_value=p.id in self.values.best_value,
            fair_price=FairPriceOut(percentile=fair.percentile, label=fair.label, median=fair.median),
        )

    def diagnosis_out(self, d: Diagnosis | None) -> DiagnosisOut | None:
        if d is None:
            return None
        return DiagnosisOut(
            label=d.label,
            advice=d.advice,
            km=d.km,
            km_estimated=d.km_estimated,
            symptoms=[Ref(id=s.id, name=s.label) for s in d.symptoms],
            causes=[CauseOut(part_type_id=x.part_type_id, name=x.name, p=round(x.p, 4), wear=x.wear) for x in d.causes],
        )

    # ------------------------------------------------------------------ casos de uso

    @cached_property
    def stats(self) -> StatsOut:
        return StatsOut(
            products=len(self.inventory),
            brands=len(self.catalog.brands),
            vehicles=self.catalog.vehicle_config_count,
            part_types=len(self.catalog.part_types),
            build_ms=self.build_ms,
            median_query_ms=self.median_query_ms,
        )

    def search(self, req: SearchRequest) -> SearchOut:
        r: SearchResult = self.engine.search(req)
        lo, hi, hist = r.price_hist
        return SearchOut(
            q=req.q,
            total=r.total,
            items=[HitOut(product=self.product_out(h.product), fits=h.fits, marks=list(h.marks)) for h in r.hits],
            facets={
                d: [FacetValueOut(value=f.value, label=f.label, count=f.count, selected=f.selected) for f in vals]
                for d, vals in r.facets.items()
            },
            price=PriceStats(min=lo, max=hi, hist=hist),
            in_stock_count=r.in_stock_count,
            on_sale_count=r.on_sale_count,
            chips=[
                ChipOut(kind=ch.kind, label=ch.label, without=ch.without, corrected=ch.corrected)
                for ch in r.parsed.chips
            ],
            text=r.parsed.text,
            corrections=[CorrectionOut(written=a, understood=b, channel=ch) for a, b, ch in r.corrections],
            vehicle=self.vehicle_out(r.vehicle),
            vehicle_source=r.vehicle_source,
            hidden_by_fitment=r.hidden_by_fitment,
            relaxed=r.relaxed,
            pn_match=PNMatch(kind=r.pn_match[0], raw=r.pn_match[1], count=r.pn_match[2]) if r.pn_match else None,
            diagnosis=self.diagnosis_out(r.diagnosis),
            suggestions=r.suggestions,
            took_ms=r.took_ms,
        )

    def product_detail(self, product_id: str, vehicle: VehicleQuery | None) -> ProductDetailOut | None:
        p = self.inventory.by_id.get(product_id)
        if p is None:
            return None
        c = self.catalog
        fit = assess(p, vehicle, c)
        alternatives = sorted(self.inventory.groups[p.group_key], key=lambda x: (TIER_ORDER.index(x.tier), x.price))
        keys = c.fit_keys(vehicle) if vehicle and not vehicle.empty else frozenset({p.fit})
        related: list[Product] = []
        for pt in c.part_type_by_id[p.part_type_id].related:
            pool = [x for x in self.inventory.by_type.get(pt, ()) if x.fit == "*" or x.fit in keys or x.fit == p.fit]
            related += sorted(pool, key=lambda x: -self.values.value(x))[:2]
        cert = None
        if vehicle and fit.status == "confirmada":
            veh = {"make": vehicle.make_id, "model": vehicle.model_id, "year": vehicle.year, "engine": vehicle.engine}
            issued = certificate.issue(settings.secret, p.id, p.part_number, veh)
            cert = CertificateOut(
                code=issued.code,
                token=issued.token,
                vehicle=c.vehicle_label(vehicle),
                issued=str(issued.payload["iat"]),
            )
        t = self.brand_trust[p.brand_id]
        return ProductDetailOut(
            product=self.product_out(p),
            fitment=FitmentOut(status=fit.status, confidence=fit.confidence, reason=fit.reason),
            vehicles=[FitRow(**row) for row in self.inventory.fitment_rows(p)],  # type: ignore[arg-type]
            alternatives=[self.product_out(x) for x in alternatives],
            related=[self.product_out(x) for x in related[:4]],
            brand_trust=BrandTrustOut(
                score=t.score,
                grade=t.grade,
                rating=t.rating,
                reviews=t.reviews,
                references=t.references,
                in_stock_pct=t.in_stock_pct,
                oem_supplier=t.oem_supplier,
            ),
            certificate=cert,
        )

    def verify(self, token: str) -> VerifyOut:
        cert = certificate.verify(settings.secret, token)
        if cert is None:
            return VerifyOut(valid=False)
        pl = cert.payload
        p = self.inventory.by_id.get(str(pl.get("p")))
        year = pl.get("veh_year")
        v = VehicleQuery(
            str(pl.get("veh_make") or "") or None,
            str(pl.get("veh_model") or "") or None,
            int(year) if isinstance(year, int) else None,
            str(pl.get("veh_engine") or "") or None,
        )
        return VerifyOut(
            valid=True,
            code=cert.code,
            product=self.product_out(p) if p else None,
            vehicle=self.catalog.vehicle_label(v),
            issued=str(pl.get("iat")),
        )

    def cart(self, items: list[tuple[str, int]]) -> CartOut:
        lines = [(self.inventory.by_id[i], q) for i, q in items if i in self.inventory.by_id]
        missing = [i for i, _ in items if i not in self.inventory.by_id]
        subtotal = round(sum(p.price * q for p, q in lines), 2)
        left = max(0.0, round(settings.free_shipping_from - subtotal, 2))
        shipping = 0.0 if subtotal == 0 or left == 0 else settings.shipping_flat
        plan = plan_shipments([Line(p, q) for p, q in lines], self.catalog.warehouses)
        return CartOut(
            lines=[CartLineOut(product=self.product_out(p), qty=q, total=round(p.price * q, 2)) for p, q in lines],
            missing=missing,
            subtotal=subtotal,
            shipping=shipping,
            total=round(subtotal + shipping, 2),
            free_shipping_left=left,
            shipments=[
                ShipmentOut(
                    warehouse=Ref(id=s.warehouse.id, name=s.warehouse.name),
                    eta=s.warehouse.eta,
                    items=[
                        ShipmentItem(id=x.product.id, part_number=x.product.part_number, qty=x.qty) for x in s.items
                    ],
                )
                for s in plan.shipments
            ],
            backorder=[
                ShipmentItem(id=x.product.id, part_number=x.product.part_number, qty=x.qty) for x in plan.backorder
            ],
            eta=plan.eta,
        )

    def service_plan(
        self, v: VehicleQuery, km: int | None = None, budget: float | None = None, pack: Pack = "rec"
    ) -> ServicePlanOut:
        k = km if km is not None else self.planner.default_km(v.year)
        plan = self.planner.plan(v, k)
        choice = self.planner.fit_budget(plan, pack, budget) if budget is not None else None
        return ServicePlanOut(
            km=plan.km,
            vehicle=self.catalog.vehicle_label(v, engine=False),
            engine=self.catalog.engines[plan.engine].label() if plan.engine in self.catalog.engines else None,
            lines=[
                PlanLineOut(
                    part_type_id=line.task.part_type,
                    name=line.name,
                    every=line.task.every,
                    why=line.task.why,
                    priority=line.task.priority,
                    position=line.task.position,
                    qty=line.qty,
                    picks={pk: self.product_out(line.picks[pk]) for pk in PACKS},
                    cost={pk: line.cost(pk) for pk in PACKS},
                )
                for line in plan.lines
            ],
            totals={str(k): v for k, v in plan.totals.items()},
            milestones=[
                MilestoneOut(km=m, tasks=[self.catalog.part_type_by_id[t.part_type].name for t in ts])
                for m, ts in milestones(plan.km)
            ],
            budget=BudgetOut(
                pack=choice.pack,
                budget=choice.budget,
                now=[line.task.part_type for line in choice.now],
                later=[line.task.part_type for line in choice.later],
                total=choice.total,
                priority_kept=choice.priority_kept,
                priority_total=choice.priority_total,
            )
            if choice
            else None,
        )

    def diagnose(self, symptoms: list[str], vehicle: VehicleQuery | None, km: int | None = None) -> DiagnosisOut | None:
        available = None
        if vehicle and not vehicle.empty:
            available = set(self.engine.types_by_fit.get("*", ()))
            for k in self.catalog.fit_keys(vehicle):
                available |= self.engine.types_by_fit.get(k, set())
        return self.diagnosis_out(self.dx.diagnose(symptoms, vehicle.year if vehicle else None, km, available))

    def decode_vin(self, raw: str, online: bool = False) -> VinOut:
        r = vin_lib.decode(raw, datetime.now(UTC).year)
        if online:
            r = vin_lib.enrich_online(r, self.catalog)
        c = self.catalog
        return VinOut(
            vin=r.vin,
            valid=r.valid,
            error=r.error,
            make_id=r.make_id,
            make=c.make_by_id[r.make_id].name if r.make_id in c.make_by_id else None,
            region=r.region,
            year=r.year,
            check_ok=r.check_ok,
            model_id=r.model_id,
            model=c.model_by_id[r.model_id].name if r.model_id in c.model_by_id else r.online_model,
            engine=r.engine,
            online=r.online,
        )

    def catalog_tree(self, segs: list[str]) -> CatalogOut:
        """Explorador Marca → Año → Modelo → Motor → Sistema → Pieza."""
        c = self.catalog
        make_id, year_s, model_id, engine_s, cat_id, pt_id = (segs + [None] * 6)[:6]
        year = int(year_s) if year_s and year_s.isdigit() else None
        engine = engine_s if engine_s and engine_s != "todos" else None
        vehicle = VehicleQuery(make_id, model_id, year, engine) if make_id and year and model_id else None
        ready = bool(vehicle and engine_s)
        cols = [
            ColumnOut(
                key="make",
                title="Marca",
                base=[],
                selected=make_id,
                items=[ColumnItem(id=m.id, label=m.name) for m in c.makes],
            )
        ]
        if make_id in c.make_by_id:
            cols.append(
                ColumnOut(
                    key="year",
                    title="Año",
                    base=[make_id],
                    selected=year_s,
                    items=[ColumnItem(id=str(y), label=str(y)) for y in c.years_of_make(make_id)],
                )
            )
        if make_id and year:
            cols.append(
                ColumnOut(
                    key="model",
                    title="Modelo",
                    base=[make_id, str(year)],
                    selected=model_id,
                    items=[
                        ColumnItem(id=m.id, label=m.name, sub=f"{m.body} · {(c.gen_for(m.id, year) or m.gens[0]).code}")
                        for m in c.models_of_make_year(make_id, year)
                    ],
                )
            )
        if make_id and year and model_id:
            engs = c.engines_for(model_id, year)
            items = [ColumnItem(id=e, label=c.engines[e].label(False), sub=e) for e in engs]
            if len(engs) > 1:
                items.append(ColumnItem(id="todos", label="Todos los motores"))
            cols.append(
                ColumnOut(
                    key="engine", title="Motor", base=[make_id, str(year), model_id], selected=engine_s, items=items
                )
            )
        listing: list[ListingGroup] = []
        if ready and vehicle and make_id and model_id and engine_s:
            base: list[str] = [make_id, str(year), model_id, engine_s]
            facets = self.engine.search(SearchRequest(vehicle=vehicle, size=0)).facets
            cols.append(
                ColumnOut(
                    key="cat",
                    title="Sistema",
                    base=base,
                    selected=cat_id,
                    items=[
                        ColumnItem(id=f.value, label=f.label, count=f.count, icon=f.value)
                        for f in facets["category"]
                        if f.count
                    ],
                )
            )
            if cat_id:
                pts = self.engine.search(SearchRequest(vehicle=vehicle, category=[cat_id], size=0)).facets["partType"]
                cols.append(
                    ColumnOut(
                        key="pt",
                        title="Pieza",
                        base=[*base, cat_id],
                        selected=pt_id,
                        items=[
                            ColumnItem(id=f.value, label=f.label, count=f.count)
                            for f in pts
                            if f.count and c.part_type_by_id[f.value].cat == cat_id
                        ],
                    )
                )
            if pt_id:
                res = self.engine.search(SearchRequest(vehicle=vehicle, part_type=[pt_id], sort="nivel", size=300))
                groups: dict[str, list[ProductOut]] = {}
                for h in res.hits:
                    groups.setdefault(h.product.position or h.product.variant or "Todas", []).append(
                        self.product_out(h.product)
                    )
                listing = [ListingGroup(position=k, items=v) for k, v in groups.items()]
        return CatalogOut(
            vehicle=self.vehicle_out(vehicle),
            ready=ready,
            columns=cols,
            part_type=c.part_type_by_id[pt_id].name if pt_id in c.part_type_by_id else None,
            listing=listing,
        )

    def home(self, vehicle: VehicleQuery | None) -> HomeOut:
        c = self.catalog
        counts = self.engine.search(SearchRequest(vehicle=vehicle, size=0)).facets["category"]
        deals = self.engine.search(
            SearchRequest(vehicle=vehicle, on_sale=True, in_stock=True, sort="valoracion", size=10)
        )
        # Vitrina de niveles: un grupo real con las cuatro opciones
        keys = c.fit_keys(vehicle) if vehicle and not vehicle.empty else None
        popular = [
            "g:toyota-corolla-e170",
            "g:toyota-hilux-an120",
            "g:nissan-versa-n17",
            "g:hyundai-accent-rb",
            "g:kia-rio-ub",
        ]
        groups = [
            g
            for k, g in self.inventory.groups.items()
            if k.split("|")[1] == "pastillas-freno"
            and k.split("|")[2] == "Delantero"
            and (keys is None or g[0].fit in keys)
        ]
        full = [g for g in groups if len({p.tier for p in g}) == 4]
        pick = next((g for f in popular for g in full if g[0].fit == f), None) if keys is None else None
        group = pick or (full[0] if full else max(groups, key=lambda g: len({p.tier for p in g}), default=[]))
        title = ""
        if group:
            row = self.inventory.fitment_rows(group[0])[0]
            title = f"Pastillas de freno delanteras · {row['model']} {row['years'][0]}–{row['years'][1]}"  # type: ignore[index]
        showcase: dict[str, ProductOut | None] = {
            t: (
                self.product_out(min((p for p in group if p.tier == t), key=lambda p: p.price))
                if any(p.tier == t for p in group)
                else None
            )
            for t in TIER_ORDER
        }
        inv = self.inventory.products
        bosch = next(p for p in inv if p.brand_id == "bosch" and p.part_type_id == "pastillas-freno")
        oem = next(p for p in inv if p.fit == "g:toyota-hilux-an120" and p.part_type_id == "amortiguador" and p.oem)
        xref = next(p for p in inv if p.xref and p.part_type_id == "filtro-aceite")
        return HomeOut(
            stats=self.stats,
            category_counts={f.value: f.count for f in counts},
            deals=[self.product_out(h.product) for h in deals.hits],
            deals_total=deals.total,
            tier_showcase_title=title,
            tier_showcase=showcase,
            part_number_samples=[
                {
                    "label": "Bosch",
                    "value": bosch.part_number.replace(" ", "").lower(),
                    "note": "sin espacios, en minúsculas",
                },
                {"label": "OEM Toyota", "value": oem.oem[0], "note": "devuelve todas las equivalentes"},
                {"label": "Referencia cruzada", "value": xref.xref[0], "note": "número de otra marca"},
            ],
            service=self.service_plan(vehicle) if vehicle and vehicle.complete else None,
        )


@lru_cache(maxsize=1)
def get_store() -> Store:
    return Store()
