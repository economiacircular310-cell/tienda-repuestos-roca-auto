"""Línea de comandos de Lenin Auto Cars.

    python -m lenin_auto buscar "pastillas delanteras corolla 2016 menos de 60"
    python -m lenin_auto buscar "filtro de aceite" --vehiculo toyota-corolla:2016:2ZR-FE
    python -m lenin_auto diagnostico "me chilla y vibra al frenar" --vehiculo nissan-versa:2014
    python -m lenin_auto servicio toyota-corolla:2016:2ZR-FE --km 40000 --presupuesto 150
    python -m lenin_auto vin 2T1BURHE3GC741258 --en-linea
    python -m lenin_auto pieza bosch-0986602017 --vehiculo toyota-corolla:2010
    python -m lenin_auto verificar <token>
    python -m lenin_auto importar inventario.csv --salida inventario.json --reporte problemas.csv
    python -m lenin_auto exportar plantilla.csv -n 50
    python -m lenin_auto stats
    python -m lenin_auto servir --puerto 8000

Todas las órdenes aceptan --json para integrarse con otros sistemas.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence

from pydantic import BaseModel

_TTY = sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _TTY else text


def bold(t: str) -> str:
    return _c("1", t)


def dim(t: str) -> str:
    return _c("2", t)


def yellow(t: str) -> str:
    return _c("33;1", t)


def green(t: str) -> str:
    return _c("32", t)


def red(t: str) -> str:
    return _c("31", t)


def bar(p: float, width: int = 24) -> str:
    full = round(p * width)
    return yellow("█" * full) + dim("░" * (width - full))


def _vehicle(spec: str | None):  # type: ignore[no-untyped-def]
    """'modelo:año[:motor]' → VehicleQuery (la marca sale del modelo)."""
    from .catalog import VehicleQuery, load_catalog

    if not spec:
        return None
    parts = spec.split(":")
    catalog = load_catalog()
    model = catalog.model_by_id.get(parts[0])
    if model is None:
        raise SystemExit(f"Modelo desconocido: {parts[0]}. Ejemplos: toyota-corolla, nissan-versa, ford-ranger")
    year = int(parts[1]) if len(parts) > 1 and parts[1] else None
    engine = parts[2] if len(parts) > 2 and parts[2] else None
    return VehicleQuery(model.make_id, model.id, year, engine)


def _dump(model: BaseModel | None) -> None:
    print(json.dumps(model.model_dump() if model else None, ensure_ascii=False, indent=2))


def cmd_buscar(a: argparse.Namespace) -> None:
    from .search.engine import SearchRequest
    from .store import get_store

    store = get_store()
    out = store.search(SearchRequest(q=a.consulta, vehicle=_vehicle(a.vehiculo), size=a.n, sort=a.orden))
    if a.json:
        return _dump(out)
    print(bold(f"\n  «{a.consulta}»") + dim(f"   {out.total} piezas · {out.took_ms:.1f} ms"))
    if out.chips:
        print("  " + "  ".join(f"{dim(ch.kind)} {yellow(ch.label)}" for ch in out.chips))
    for cor in out.corrections:
        print(dim(f"  entendí «{cor.written}» como «{cor.understood}» ({cor.channel})"))
    if out.vehicle:
        print(green(f"  ✓ solo compatibles con {out.vehicle.label}") + dim(f" · {out.hidden_by_fitment} ocultas"))
    if out.diagnosis:
        print(bold(f"\n  Diagnóstico: {out.diagnosis.label}") + dim(f"  (~{out.diagnosis.km:,} km)"))
        for cause in out.diagnosis.causes[:5]:
            print(f"    {bar(cause.p)} {cause.p * 100:5.1f} %  {cause.name}")
    print()
    for h in out.items:
        p = h.product
        badge = yellow(" ★ mejor valor") if p.best_value else ""
        fit = green(" ✓") if h.fits else ""
        print(
            f"  {bold(f'${p.price:>8.2f}')}  {p.brand.name:<14} {dim(p.part_number):<22} {p.tier.short:<6} {p.title[:44]}{fit}{badge}"
        )
    print()


def cmd_diagnostico(a: argparse.Namespace) -> None:
    from .search.text import tokenize
    from .store import get_store

    store = get_store()
    found = [s.id for s, _ in store.dx.find(tokenize(a.sintomas))]
    if not found:
        raise SystemExit("No reconocí un síntoma. Ejemplos: «chilla al frenar», «se calienta», «no arranca».")
    d = store.diagnose(found, _vehicle(a.vehiculo), a.km)
    if a.json:
        return _dump(d)
    assert d is not None
    print(bold(f"\n  {d.label}") + dim(f"  ·  ~{d.km:,} km{' estimados' if d.km_estimated else ''}\n"))
    for cause in d.causes:
        print(f"  {bar(cause.p)} {cause.p * 100:5.1f} %  {cause.name:<30} {dim(f'desgaste Weibull {cause.wear:.0%}')}")
    print(dim(f"\n  {d.advice}\n"))


def cmd_servicio(a: argparse.Namespace) -> None:
    from .store import get_store

    v = _vehicle(a.vehiculo)
    if v is None or not v.complete:
        raise SystemExit("Indica el vehículo como modelo:año[:motor], por ejemplo toyota-corolla:2016:2ZR-FE")
    plan = get_store().service_plan(v, a.km, a.presupuesto, a.paquete)
    if a.json:
        return _dump(plan)
    print(bold(f"\n  Servicio de {plan.km:,} km · {plan.vehicle}") + dim(f" · {plan.engine or ''}\n"))
    later = set(plan.budget.later) if plan.budget else set()
    for line in plan.lines:
        p = line.picks[a.paquete]
        mark = red("  después") if line.part_type_id in later else ""
        print(f"  {line.name:<30} ×{line.qty:<2} {p.brand.name:<14} {bold(f'${line.cost[a.paquete]:>8.2f}')}{mark}")
    print(dim("\n  paquetes: ") + "  ".join(f"{k} {bold(f'${v:,.2f}')}" for k, v in plan.totals.items()))
    if plan.budget:
        b = plan.budget
        print(
            yellow(
                f"\n  Con ${b.budget:,.0f}: hoy ${b.total:,.2f} · importancia cubierta {b.priority_kept}/{b.priority_total}\n"
            )
        )


def cmd_vin(a: argparse.Namespace) -> None:
    from .store import get_store

    r = get_store().decode_vin(a.vin, a.en_linea)
    if a.json:
        return _dump(r)
    if not r.valid:
        raise SystemExit(red(r.error or "VIN inválido"))
    print(f"\n  {bold(r.vin)}")
    for k, v in (
        ("Fabricante", r.make),
        ("Año modelo", r.year),
        ("Modelo", r.model),
        ("Motor", r.engine),
        ("Origen", r.region),
    ):
        print(f"  {k:<12} {v or dim('—')}")
    print(f"  {'Verificador':<12} {green('correcto') if r.check_ok else red('no coincide')}\n")


def cmd_pieza(a: argparse.Namespace) -> None:
    from .store import get_store

    d = get_store().product_detail(a.id, _vehicle(a.vehiculo))
    if d is None:
        raise SystemExit("Pieza no encontrada")
    if a.json:
        return _dump(d)
    p = d.product
    print(bold(f"\n  {p.brand.name} {p.part_number} · {p.title}"))
    print(f"  ${p.price:.2f} · {p.tier.name} · ★ {p.rating} ({p.reviews}) → bayesiano {p.rating_adjusted}")
    print(
        f"  Confianza de marca {d.brand_trust.score}/100 ({d.brand_trust.grade}) · {p.fair_price.label} (P{p.fair_price.percentile})"
    )
    print(f"  Compatibilidad: {d.fitment.status} ({d.fitment.confidence:.0%}) — {d.fitment.reason}")
    if d.certificate:
        print(green(f"  Certificado {d.certificate.code}") + dim(f"  token: {d.certificate.token[:36]}…"))
    print()


def cmd_verificar(a: argparse.Namespace) -> None:
    from .store import get_store

    r = get_store().verify(a.token)
    if a.json:
        return _dump(r)
    if r.valid:
        print(green(f"\n  ✓ Certificado auténtico {r.code}") + f" · {r.vehicle} · emitido {r.issued}\n")
    else:
        print(red("\n  ✗ Certificado inválido o alterado\n"))


def cmd_pedidos(a: argparse.Namespace) -> None:
    from .orders import OrderError
    from .store import get_store

    store = get_store()
    if a.accion == "listar":
        orders = store.orders.recent(a.n)
        if a.json:
            print(json.dumps([store.order_out(o).model_dump() for o in orders], ensure_ascii=False, indent=2))
            return
        for o in orders:
            print(
                f"  {bold(o.code)}  {o.created_at[:16]}  {o.status:<11} {o.customer['name']:<24} ${o.totals['total']:>9.2f}"
            )
        if not orders:
            print(dim("  Aún no hay pedidos."))
        return
    try:
        order = store.orders.advance(a.codigo, a.estado, a.nota or "")
    except OrderError as e:
        raise SystemExit(red(f"  {e}")) from e
    print(green(f"  {order.code} → {order.status}"))


def cmd_importar(a: argparse.Namespace) -> None:
    from .importer import ImportFailed, import_file

    try:
        rep = import_file(a.archivo)
    except (ImportFailed, OSError) as e:
        raise SystemExit(red(f"  {e}")) from e
    if a.salida and rep.products:
        rep.save(a.salida)
    if a.reporte:
        with open(a.reporte, "w", encoding="utf-8-sig", newline="") as f:
            rep.issues_csv(f)
    s = rep.summary()
    if a.json:
        print(json.dumps(s, ensure_ascii=False, indent=2))
        return
    print(bold(f"\n  Importación de {s['source']}") + dim(f"  ·  {s['encoding']}, separador «{s['delimiter']}»"))
    print(f"  {s['rows']:>7,} filas leídas")
    print(green(f"  {s['imported']:>7,} piezas listas") + dim(f"  ({s['universal']:,} universales)"))
    if s["skipped_rows"]:
        print(red(f"  {s['skipped_rows']:>7,} filas omitidas por errores"))
    if s["new_brands"]:
        print(f"  {len(s['new_brands']):>7} marcas nuevas: {', '.join(s['new_brands'][:8])}")
    print(dim("\n  Columnas: " + " · ".join(f"{h} → {f}" for f, h in s["columns"].items())))
    if s["ignored_columns"]:
        print(dim(f"  Ignoradas: {', '.join(s['ignored_columns'])}"))
    for level, title in (("error", "Errores"), ("aviso", "Avisos")):
        items = [i for i in rep.issues if i.level == level]
        if not items:
            continue
        paint = red if level == "error" else yellow
        print(paint(f"\n  {title} ({len(items):,})"))
        if level == "error":
            for i in items[:12]:
                value = dim(f"  «{i.value[:40]}»") if i.value else ""
                print(f"    fila {i.row:<6} {i.column[:16]:<16} {i.message}{value}")
            if len(items) > 12:
                print(dim(f"    … y {len(items) - 12:,} más en el reporte"))
        else:
            for t in [t for t in s["top_issues"] if t["level"] == "aviso"][:8]:
                print(f"    × {t['count']:<6,} {t['column'][:16]:<16} {t['message']}")
    if a.salida and rep.products:
        print(green(f"\n  Instantánea escrita en {a.salida}"))
        print(dim(f"  Úsala con:  LENIN_INVENTORY={a.salida} lenin-auto servir"))
    elif not a.salida:
        print(dim("\n  Solo validación. Agrega --salida inventario.json para generar la instantánea."))
    print(dim(f"  {s['took_ms']:,.0f} ms\n"))


def cmd_exportar(a: argparse.Namespace) -> None:
    from .importer import export_csv
    from .inventory import load_inventory

    with open(a.archivo, "w", encoding="utf-8-sig", newline="") as f:
        n = export_csv(load_inventory(), f, a.n, a.separador)
    print(green(f"  {n:,} piezas exportadas a {a.archivo}") + dim(" (se pueden volver a importar tal cual)"))


def cmd_stats(a: argparse.Namespace) -> None:
    from .store import get_store

    s = get_store().stats
    if a.json:
        return _dump(s)
    print(bold("\n  Lenin Auto Cars"))
    print(f"  {s.products:,} referencias · {s.brands} marcas · {s.vehicles:,} configuraciones de vehículo")
    print(dim(f"  arranque {s.build_ms} ms · mediana de consulta {s.median_query_ms} ms\n"))


def cmd_servir(a: argparse.Namespace) -> None:
    import uvicorn

    uvicorn.run("lenin_auto.api:app", host=a.host, port=a.puerto, reload=a.recargar)


def main(argv: Sequence[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="lenin-auto", description="Motor de Lenin Auto Cars desde la terminal.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add(name: str, fn, help_: str) -> argparse.ArgumentParser:  # type: ignore[no-untyped-def]
        p = sub.add_parser(name, help=help_)
        p.set_defaults(fn=fn)
        p.add_argument("--json", action="store_true", help="salida JSON")
        return p

    p = add("buscar", cmd_buscar, "busca en lenguaje natural")
    p.add_argument("consulta")
    p.add_argument("--vehiculo", help="modelo:año[:motor], p. ej. toyota-corolla:2016:2ZR-FE")
    p.add_argument("-n", type=int, default=10)
    p.add_argument(
        "--orden", default="relevancia", choices=["relevancia", "precio-asc", "precio-desc", "valoracion", "nivel"]
    )

    p = add("diagnostico", cmd_diagnostico, "causas probables de uno o varios síntomas")
    p.add_argument("sintomas")
    p.add_argument("--vehiculo")
    p.add_argument("--km", type=int)

    p = add("servicio", cmd_servicio, "plan de mantenimiento por kilometraje")
    p.add_argument("vehiculo")
    p.add_argument("--km", type=int)
    p.add_argument("--presupuesto", type=float)
    p.add_argument("--paquete", default="rec", choices=["eco", "rec", "pro"])

    p = add("vin", cmd_vin, "decodifica un VIN")
    p.add_argument("vin")
    p.add_argument("--en-linea", action="store_true", help="completa con la API vPIC de la NHTSA")

    p = add("pieza", cmd_pieza, "ficha de una pieza con confianza y certificado")
    p.add_argument("id")
    p.add_argument("--vehiculo")

    p = add("verificar", cmd_verificar, "verifica un certificado de compatibilidad")
    p.add_argument("token")

    p = add("pedidos", cmd_pedidos, "lista pedidos o cambia su estado")
    ps = p.add_subparsers(dest="accion", required=True)
    pl = ps.add_parser("listar")
    pl.add_argument("-n", type=int, default=20)
    pa = ps.add_parser("avanzar")
    pa.add_argument("codigo")
    pa.add_argument("estado", choices=["preparando", "enviado", "entregado", "cancelado"])
    pa.add_argument("--nota")

    p = add("importar", cmd_importar, "importa tu inventario desde CSV con reporte por fila")
    p.add_argument("archivo")
    p.add_argument("--salida", help="instantánea JSON a generar (sin esto solo valida)")
    p.add_argument("--reporte", help="CSV con cada error y aviso por fila")

    p = add("exportar", cmd_exportar, "exporta el inventario a CSV (sirve de plantilla)")
    p.add_argument("archivo")
    p.add_argument("-n", type=int, help="solo las primeras N piezas")
    p.add_argument("--separador", default=",", help="«;» para Excel en español")

    add("stats", cmd_stats, "tamaño del catálogo y rendimiento")

    p = add("servir", cmd_servir, "levanta la API (y la interfaz si está compilada)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--puerto", type=int, default=8000)
    p.add_argument("--recargar", action="store_true")

    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
