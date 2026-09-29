import io
from pathlib import Path

import pytest

from lenin_auto.catalog import Catalog, VehicleQuery, load_catalog, load_json
from lenin_auto.importer import (
    Importer,
    ImportFailed,
    describe_fits,
    export_csv,
    import_file,
    parse_number,
    parse_warranty,
    sniff_delimiter,
)
from lenin_auto.inventory import Inventory, load_inventory, load_snapshot, product_record
from lenin_auto.trust.fitment import assess

EJEMPLO = Path(__file__).resolve().parents[2] / "docs" / "ejemplos" / "inventario-ejemplo.csv"
COROLLA = ("toyota", "toyota-corolla")


@pytest.fixture(scope="module")
def importer() -> Importer:
    return Importer()


def _csv(*rows: str, sep: str = ";") -> bytes:
    return "\n".join(r.replace(";", sep) for r in rows).encode("cp1252")


def test_ida_y_vuelta_exacta_de_todo_el_inventario(importer: Importer) -> None:
    """Exportar las 20 885 piezas a CSV y volver a importarlas devuelve exactamente lo mismo."""
    inv = load_inventory()
    buf = io.StringIO()
    export_csv(inv, buf)
    rep = importer.run(buf.getvalue().encode("utf-8-sig"), "demo.csv")
    assert not rep.errors and not rep.new_brands
    assert [product_record(p) for p in rep.products] == [product_record(p) for p in inv.products]


def test_lectura_de_numeros_y_garantias() -> None:
    assert parse_number("$1.234,50") == (1234.5, "")
    assert parse_number("1,234.50") == (1234.5, "")
    assert parse_number("45,9") == (45.9, "")
    value, note = parse_number("1.234")
    assert value == 1234 and "miles" in note  # ambiguo: se dice en el reporte
    assert parse_number("cincuenta") == (None, "")
    assert parse_warranty("24 meses") == "2 años"
    assert parse_warranty("18 m") == "18 meses"
    assert parse_warranty("Garantía de 1 año") == "1 año"
    assert parse_warranty("vitalicia") == "De por vida"
    assert parse_warranty("azul") is None


def test_detecta_separador() -> None:
    assert sniff_delimiter("a;b;c\n1;2,5;3\n") == ";"
    assert sniff_delimiter("a\tb\n1\t2\n") == "\t"
    assert sniff_delimiter('a,b\n"x; y",2\n') == ","


def test_planilla_real_desordenada() -> None:
    rep = import_file(EJEMPLO)
    s = rep.summary()
    assert s["encoding"] == "Windows-1252" and s["delimiter"] == ";"
    assert s["ignored_columns"] == ["Color"]
    by_pn = {p.part_number: p for p in rep.products}

    pads = by_pn["D1210-8327"]  # «Pastillas … delanteras», «24 meses», existencias por almacén
    assert (pads.part_type_id, pads.position, pads.warranty) == ("pastillas-freno", "Delantero", "2 años")
    assert pads.stock == (12, 0, 3) and pads.list_price == 59.9
    assert pads.fits == {f"y:toyota-corolla-e170:{y}" for y in (2014, 2015, 2016)}

    assert by_pn["KYB-339210"].brand_id == "kyb"  # «Kayaba» es un alias
    assert by_pn["NGK-94201"].brand_id == "ngk"  # «NKG»: letras vecinas intercambiadas
    assert by_pn["BR-9921"].tier == "desempeno"  # «premium»
    assert by_pn["PH4967"].fits == {"e:2ZR-FE", "e:1ZR-FE"}
    assert by_pn["RB-440"].part_type_id == "disco-freno"  # «ventilados» no lo vuelve electroventilador
    oil = by_pn["AC-5W30"]
    assert oil.universal and oil.variant == "5W-30" and oil.brand_id == "mobil1"
    hilux = by_pn["KYB-339210"].fits  # «diésel» restringe a los motores diésel de esos años
    assert hilux and all(k.startswith("ye:toyota-hilux-an120:") and "GD-FTV" in k for k in hilux)

    errors = {(i.row, i.message.split(":")[0]) for i in rep.errors}
    assert errors == {
        (8, "precio no válido"),
        (10, "«Frenos» es la categoría Frenos"),
        (11, "repetido"),
    }
    notes = [i.message for i in rep.warnings if i.row == 12]
    assert any("dos generaciones (JK y JL)" in n for n in notes)  # Wrangler 2018: lo avisa
    assert [b.name for b in rep.new_brands] == ["Raybestos"]


def test_lo_que_el_proveedor_no_declara_no_se_certifica(importer: Importer) -> None:
    rep = importer.run(
        _csv(
            "Número de parte;Marca;Tipo;Precio;Aplicación",
            "Z-1;Bosch;Pastillas de freno delanteras;50;Toyota Corolla 2014-2016",
        )
    )
    p = rep.products[0]
    c = load_catalog()
    assert assess(p, VehicleQuery(*COROLLA, 2016), c).status == "confirmada"
    assert assess(p, VehicleQuery(*COROLLA, 2018), c).status == "no"  # misma generación, año no declarado
    maybe = assess(p, VehicleQuery(*COROLLA), c)
    assert maybe.status == "condicional" and "2014–2016" in maybe.reason


def test_aplicaciones_con_generacion_motor_y_tramos(importer: Importer) -> None:
    rep = importer.run(
        _csv(
            "sku,brand,type,price,fitment",
            'A-1,Gates,Water pump,40,"Jeep Wrangler JK 2007-2018"',
            'A-2,Gates,Bomba de agua,40,"Toyota Corolla 2016 2ZR-FE; Toyota Hilux 2.8 2016+"',
            "A-3,Gates,Bomba de agua,40,Toyota Corolla hasta 2010",
            "A-4,Gates,Bomba de agua,40,Toyota Corolla 1995",
            "A-5,Gates,Bomba de agua,40,Toyota",
            sep=",",
        )
    )
    by_pn = {p.part_number: p for p in rep.products}
    assert by_pn["A-1"].fits == {"g:jeep-wrangler-jk"}  # la generación escrita evita la ambigüedad de 2018
    assert "ye:toyota-corolla-e170:2016:2ZR-FE" in by_pn["A-2"].fits
    assert "ge:toyota-hilux-an120:1GD-FTV" in by_pn["A-2"].fits  # 2.8 y 2016+: toda la AN120, solo ese motor
    assert all(k.startswith("y") for k in by_pn["A-3"].fits)  # «hasta 2010»: años exactos
    errors = {i.row: i.message for i in rep.errors}
    assert "no tiene Corolla en 1995" in errors[5] and "falta el modelo" in errors[6]


def test_describir_y_releer_claves_precisas(importer: Importer) -> None:
    c = load_catalog()
    fits = {"y:toyota-corolla-e170:2014", "y:toyota-corolla-e170:2015", "ye:toyota-corolla-e170:2018:2ZR-FE"}
    text = describe_fits(fits, c)
    assert text == "Toyota Corolla E170 2014-2015; Toyota Corolla E170 2018 2ZR-FE"
    rep = importer.run(_csv("parte;marca;tipo;precio;aplicacion", f'Q-9;Bosch;Bomba de agua;10;"{text}"'))
    assert rep.products[0].fits == fits


def test_columnas_obligatorias(importer: Importer) -> None:
    with pytest.raises(ImportFailed, match="precio"):
        importer.run(_csv("parte;marca;tipo", "X;Bosch;Bujía"))
    with pytest.raises(ImportFailed, match="vacía"):
        importer.run(b"\n\n")


def test_instantanea_registra_marcas_nuevas(tmp_path: Path) -> None:
    rep = import_file(EJEMPLO)
    path = tmp_path / "inventario.json"
    rep.save(path)
    fresh = Catalog(load_json("vehicles.json"), load_json("taxonomy.json"))  # sin tocar el catálogo compartido
    products = load_snapshot(path, fresh)
    assert [product_record(p) for p in products] == [product_record(p) for p in rep.products]
    raybestos = fresh.brand_by_id["raybestos"]
    assert raybestos.tiers == ("diario",) and "disco-freno" in raybestos.types
    inv = Inventory(products, fresh)
    assert inv.fitment_rows(inv.by_id["bosch-d12108327"])[0]["years"] == [2014, 2016]
