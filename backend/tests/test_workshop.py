from lenin_auto.catalog import VehicleQuery
from lenin_auto.search.engine import SearchRequest
from lenin_auto.search.text import tokenize
from lenin_auto.store import Store
from lenin_auto.workshop.diagnosis import weibull_cdf
from lenin_auto.workshop.maintenance import Planner, tasks_at

COROLLA = VehicleQuery("toyota", "toyota-corolla", 2016, "2ZR-FE")


def test_reconoce_sintomas_coloquiales(store: Store) -> None:
    ids = lambda t: [s.id for s, _ in store.dx.find(tokenize(t))]  # noqa: E731
    assert ids("me chilla al frenar el corolla") == ["ruido-frenar"]
    assert ids("el carro se calienta mucho") == ["calienta"]
    assert ids("me chilla y vibra al frenar") == ["ruido-frenar", "vibra-frenar"]
    assert ids("pastillas delanteras") == []


def test_weibull() -> None:
    assert weibull_cdf(0, 40_000, 2.5) == 0
    assert 0.6 < weibull_cdf(40_000, 40_000, 2.5) < 0.65  # F(η) = 1 − 1/e
    assert weibull_cdf(200_000, 40_000, 2.5) > 0.99


def test_bayes_multisintoma(store: Store) -> None:
    one = store.dx.diagnose(["ruido-frenar"], 2016)
    two = store.dx.diagnose(["ruido-frenar", "vibra-frenar"], 2016)
    assert one and two
    assert abs(sum(c.p for c in one.causes) - 1) < 1e-9
    assert one.causes[0].part_type_id == "pastillas-freno"
    assert two.causes[0].part_type_id == "disco-freno"  # la pieza que explica ambos síntomas


def test_sintoma_no_se_lee_como_categoria(store: Store) -> None:
    r = store.engine.parser.parse("luz de motor encendida hilux 2015")
    assert r.symptoms == ["check-engine"] and r.categories == [] and r.vehicle.model_id == "toyota-hilux"  # type: ignore[union-attr]


def test_busqueda_por_sintoma_filtra_y_ordena(store: Store) -> None:
    r = store.engine.search(SearchRequest(q="chilla al frenar corolla 2012", size=50))
    assert r.diagnosis
    allowed = {c.part_type_id for c in r.diagnosis.causes}
    assert "zapatas-freno" not in allowed or r.vehicle is None  # un Corolla con discos atrás no tiene zapatas
    assert all(h.product.part_type_id in allowed for h in r.hits)
    assert r.hits[0].product.part_type_id == r.diagnosis.causes[0].part_type_id


def test_tareas_por_kilometraje() -> None:
    assert [t.part_type for t in tasks_at(10_000)] == ["aceite-motor", "filtro-aceite"]
    assert "kit-distribucion" in [t.part_type for t in tasks_at(100_000)]


def test_plan_compatible_y_cantidades(store: Store) -> None:
    plan = store.planner.plan(COROLLA, 40_000)
    assert plan.totals["eco"] <= plan.totals["rec"]
    assert next(line for line in plan.lines if line.task.part_type == "bujia").qty == 4
    for line in plan.lines:
        for p in line.picks.values():
            assert p.fit in ("*", "g:toyota-corolla-e170", "e:2ZR-FE")


def test_diesel_usa_15w40_y_no_lleva_bujias(store: Store) -> None:
    plan = store.planner.plan(VehicleQuery("toyota", "toyota-hilux", 2019, "1GD-FTV"), 40_000)
    assert next(line for line in plan.lines if line.task.part_type == "aceite-motor").picks["eco"].variant == "15W-40"
    assert all(line.task.part_type != "bujia" for line in plan.lines)


def test_mochila_respeta_presupuesto_y_paquetes(store: Store) -> None:
    plan = store.planner.plan(COROLLA, 40_000)
    for budget in (60, 100, 150, 220):
        choice = Planner.fit_budget(plan, "rec", budget)
        assert choice.total <= budget + 1
        ids = {line.task.part_type for line in choice.now}
        assert ("aceite-motor" in ids) == ("filtro-aceite" in ids)  # aceite y filtro, juntos o nada
    assert Planner.fit_budget(plan, "rec", 10_000).later == ()


def test_mochila_pone_la_seguridad_primero(store: Store) -> None:
    plan = store.planner.plan(COROLLA, 40_000)
    pads = next(line for line in plan.lines if line.task.part_type == "pastillas-freno")
    choice = Planner.fit_budget(plan, "rec", pads.cost("rec") + 1)
    assert [line.task.part_type for line in choice.now] == ["pastillas-freno"]  # prioridad 10 antes que todo
    choice = Planner.fit_budget(plan, "rec", 150)
    assert "pastillas-freno" in {line.task.part_type for line in choice.now}
