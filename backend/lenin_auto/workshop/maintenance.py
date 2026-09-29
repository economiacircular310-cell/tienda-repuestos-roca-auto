"""Plan de mantenimiento por kilometraje y optimizador de presupuesto.

1. Qué toca: cada tarea tiene un intervalo de fábrica; en el servicio de K km toca todo
   intervalo que divide a K (K se redondea a la decena de miles).
2. Qué comprar: por tarea, tres paquetes entre las piezas compatibles
      económico   → la más barata con existencias
      recomendado → la de mejor índice de valor (trust.value)
      premium     → la mejor calificada (bayesiana) de alto desempeño u original
3. Si no alcanza el dinero: problema de la mochila 0/1 resuelto por programación dinámica
   (Bellman, 1957). Maximiza la importancia total de lo que se hace hoy —seguridad
   primero— sin pasar el presupuesto, y dice qué conviene posponer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from ..catalog import Catalog, VehicleQuery
from ..inventory import Inventory, Product
from ..trust.ratings import RatingModel
from ..trust.value import ValueModel

Pack = Literal["eco", "rec", "pro"]
PACKS: tuple[Pack, ...] = ("eco", "rec", "pro")


@dataclass(frozen=True, slots=True)
class Task:
    part_type: str
    every: int
    why: str
    priority: int  # 1–10: 10 = seguridad
    position: str | None = None
    qty: int | Literal["cyl"] = 1
    bundle: str | None = None  # tareas que se hacen juntas o no se hacen (aceite + filtro)


TASKS: tuple[Task, ...] = (
    Task("aceite-motor", 10_000, "Cambio de aceite", 9, bundle="cambio-aceite"),
    Task("filtro-aceite", 10_000, "Va con cada cambio de aceite", 9, bundle="cambio-aceite"),
    Task("filtro-aire", 20_000, "Protege el motor del polvo", 6),
    Task("filtro-cabina", 20_000, "Aire limpio en la cabina", 3),
    Task("plumillas", 20_000, "El caucho se endurece con el sol", 5),
    Task("bujia", 40_000, "Una por cilindro", 6, qty="cyl"),
    Task("filtro-combustible", 40_000, "Cuida bomba e inyectores", 5),
    Task("liquido-frenos", 40_000, "Absorbe humedad con el tiempo", 8, qty=2),
    Task("pastillas-freno", 40_000, "Eje delantero, desgaste normal", 10, position="Delantero"),
    Task("refrigerante", 60_000, "Pierde aditivos anticorrosión", 6, qty=2),
    Task("correa-accesorios", 60_000, "Se cristaliza y chilla", 6),
    Task("aceite-transmision", 60_000, "Alarga la vida de la caja", 5, qty=4),
    Task("disco-freno", 80_000, "Par delantero", 9, position="Delantero", qty=2),
    Task("amortiguador", 80_000, "Siempre por pares", 7, position="Delantero", qty=2),
    Task("kit-distribucion", 100_000, "Si se rompe, daña el motor", 10),
)


@dataclass(frozen=True, slots=True)
class PlanLine:
    task: Task
    name: str
    qty: int
    picks: dict[Pack, Product]

    def cost(self, pack: Pack) -> float:
        return round(self.picks[pack].price * self.qty, 2)


@dataclass(frozen=True, slots=True)
class Plan:
    km: int
    engine: str | None
    lines: tuple[PlanLine, ...]
    totals: dict[Pack, float] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class BudgetChoice:
    pack: Pack
    budget: float
    now: tuple[PlanLine, ...]
    later: tuple[PlanLine, ...]
    total: float
    priority_kept: int
    priority_total: int


def round_km(km: int) -> int:
    return max(10_000, round(km / 10_000) * 10_000)


def tasks_at(km: int) -> list[Task]:
    k = round_km(km)
    return [t for t in TASKS if k % t.every == 0]


def milestones(from_km: int, count: int = 8) -> list[tuple[int, list[Task]]]:
    start = round_km(from_km)
    return [(start + i * 10_000, tasks_at(start + i * 10_000)) for i in range(count)]


class Planner:
    def __init__(self, catalog: Catalog, inventory: Inventory, ratings: RatingModel, values: ValueModel) -> None:
        self.c = catalog
        self.inv = inventory
        self.ratings = ratings
        self.values = values

    def default_km(self, year: int | None) -> int:
        return round_km(round((self.c.max_year - year + 0.5) * 15_000) if year else 60_000)

    def _variant(self, part_type: str, engine: str | None, year: int | None) -> str | None:
        e = self.c.engines.get(engine or "")
        return {
            "aceite-motor": "15W-40" if e and e.fuel == "Diésel" else "0W-20" if (year or 0) >= 2018 else "5W-30",
            "liquido-frenos": "DOT 4",
            "refrigerante": "Rosa (P-HOAT)",
            "aceite-transmision": "ATF Dexron VI",
        }.get(part_type)

    def plan(self, v: VehicleQuery, km: int) -> Plan:
        k = round_km(km)
        engine = v.engine
        if engine is None and v.model_id and v.year:
            engine = next(iter(self.c.engines_for(v.model_id, v.year)), None)
        keys = self.c.fit_keys(VehicleQuery(v.make_id, v.model_id, v.year, engine))
        cyl = self.c.engines[engine].cyl if engine in self.c.engines else 4
        lines: list[PlanLine] = []
        for task in tasks_at(k):
            variant = self._variant(task.part_type, engine, v.year)
            cands = [
                p
                for p in self.inv.by_type.get(task.part_type, ())
                if p.fits_any(keys)
                and (task.position is None or p.position == task.position)
                and (variant is None or p.variant == variant)
            ]
            if not cands:
                continue
            pool = [p for p in cands if p.in_stock] or cands
            high = [p for p in pool if p.tier in ("desempeno", "oem")] or pool
            picks: dict[Pack, Product] = {
                "eco": min(pool, key=lambda p: p.price),
                "rec": max(pool, key=self.values.value),
                "pro": max(high, key=lambda p: (self.ratings.adjusted(p.rating, p.reviews), p.price)),
            }
            qty = cyl if task.qty == "cyl" else task.qty
            lines.append(PlanLine(task, self.c.part_type_by_id[task.part_type].name, qty, picks))
        totals = {pk: round(sum(line.cost(pk) for line in lines), 2) for pk in PACKS}
        return Plan(k, engine, tuple(lines), totals)

    @staticmethod
    def fit_budget(plan: Plan, pack: Pack, budget: float) -> BudgetChoice:
        """Mochila 0/1 exacta en pesos enteros, O(n · presupuesto).

        Las tareas de un mismo ``bundle`` forman un solo objeto (se hacen juntas o no se
        hacen): así nunca se propone cambiar el filtro sin el aceite.

        Seguridad primero, de forma estricta: cada tarea vale (n + 1)^prioridad, con n el
        número de tareas. Como (n + 1)^p > n · (n + 1)^(p−1), una tarea de prioridad p vale
        más que todas las de prioridad menor juntas: el óptimo es lexicográfico (primero lo
        de seguridad que quepa y, con lo que sobra, lo siguiente). Python maneja enteros
        de precisión arbitraria, así que no hay desbordamiento.
        """
        bundles: dict[str, list[PlanLine]] = {}
        for line in plan.lines:
            bundles.setdefault(line.task.bundle or line.task.part_type, []).append(line)
        items = list(bundles.values())
        cap = max(0, int(budget))
        costs = [max(1, round(sum(line.cost(pack) for line in group))) for group in items]
        base = len(plan.lines) + 1
        values = [sum(base**line.task.priority for line in group) for group in items]
        best = [0] * (cap + 1)
        keep = [[False] * (cap + 1) for _ in items]
        for i, (w, val) in enumerate(zip(costs, values, strict=True)):
            for c in range(cap, w - 1, -1):
                if best[c - w] + val > best[c]:
                    best[c] = best[c - w] + val
                    keep[i][c] = True
        chosen: set[int] = set()
        c = cap
        for i in range(len(items) - 1, -1, -1):
            if keep[i][c]:
                chosen.add(i)
                c -= costs[i]
        now = tuple(line for i, group in enumerate(items) if i in chosen for line in group)
        later = tuple(line for i, group in enumerate(items) if i not in chosen for line in group)
        return BudgetChoice(
            pack,
            budget,
            now,
            later,
            round(sum(line.cost(pack) for line in now), 2),
            sum(line.task.priority for line in now),
            sum(line.task.priority for line in plan.lines),
        )
