"""Pedidos: persistencia en SQLite, códigos verificables y seguimiento.

Código de pedido — ``LAC-7Q2M-9XKD-4``
    40 bits aleatorios criptográficos (``secrets``) en base32 de Crockford (sin I, L, O, U:
    nada que se confunda al dictarlo por teléfono) más un carácter verificador calculado
    con el algoritmo de Luhn mod N (N = 32). Detecta cualquier carácter mal escrito y casi
    cualquier transposición de dos vecinos antes de tocar la base de datos.

Estados — máquina de estados explícita con historial
    recibido → preparando → enviado → entregado, y cancelado desde recibido/preparando.

Idempotencia
    El cliente manda una ``Idempotency-Key`` por intento de compra; repetir la petición
    (doble clic, red inestable) devuelve el mismo pedido en lugar de crear otro.

Privacidad
    El pedido solo se consulta con código y correo; si alguno no coincide la respuesta es
    idéntica a «no existe» y la comparación del correo es de tiempo constante.
"""

from __future__ import annotations

import hmac
import json
import re
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_INDEX = {ch: i for i, ch in enumerate(ALPHABET)}
_CODE_RE = re.compile(r"^LAC-([0-9A-Z]{4})-([0-9A-Z]{4})-([0-9A-Z])$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

Status = Literal["recibido", "preparando", "enviado", "entregado", "cancelado"]
TRANSITIONS: dict[str, tuple[str, ...]] = {
    "recibido": ("preparando", "cancelado"),
    "preparando": ("enviado", "cancelado"),
    "enviado": ("entregado",),
    "entregado": (),
    "cancelado": (),
}


def luhn_check_char(payload: str) -> str:
    """Carácter verificador Luhn mod N sobre el alfabeto de Crockford."""
    n = len(ALPHABET)
    total = 0
    factor = 2
    for ch in reversed(payload):
        addend = factor * _INDEX[ch]
        total += addend // n + addend % n
        factor = 1 if factor == 2 else 2
    return ALPHABET[(n - total % n) % n]


def luhn_valid(payload_with_check: str) -> bool:
    body, check = payload_with_check[:-1], payload_with_check[-1]
    return all(ch in _INDEX for ch in payload_with_check) and luhn_check_char(body) == check


def new_order_code() -> str:
    value = secrets.randbits(40)
    body = "".join(ALPHABET[(value >> (5 * i)) & 31] for i in range(8))
    return f"LAC-{body[:4]}-{body[4:]}-{luhn_check_char(body)}"


def normalize_code(raw: str) -> str | None:
    """Acepta minúsculas, espacios y O/I/L confundidos; devuelve el código canónico o None."""
    clean = re.sub(r"[^0-9A-Z]", "", raw.upper())
    if clean.startswith("LAC"):
        clean = clean[3:]
    clean = clean.translate(str.maketrans("OIL", "011"))  # equivalencias de Crockford
    if len(clean) != 9 or not luhn_valid(clean):
        return None
    return f"LAC-{clean[:4]}-{clean[4:8]}-{clean[8]}"


def add_business_days(start: date, days: int) -> date:
    """Suma días hábiles de despacho (lunes a sábado)."""
    d = start
    left = days
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() != 6:  # domingo
            left -= 1
    return d


class OrderError(ValueError):
    """Datos de pedido inválidos (el mensaje es apto para mostrar al cliente)."""


@dataclass(slots=True)
class Order:
    code: str
    created_at: str
    status: str
    customer: dict[str, str]
    vehicle: dict[str, Any] | None
    lines: list[dict[str, Any]]
    shipments: list[dict[str, Any]]
    totals: dict[str, float]
    delivery: tuple[str, str] | None
    events: list[dict[str, str]] = field(default_factory=list)


_SCHEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS orders (
    code        TEXT PRIMARY KEY,
    idem_key    TEXT UNIQUE,
    created_at  TEXT NOT NULL,
    status      TEXT NOT NULL,
    email       TEXT NOT NULL,
    payload     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events (
    code   TEXT NOT NULL REFERENCES orders(code),
    at     TEXT NOT NULL,
    status TEXT NOT NULL,
    note   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS order_events_code ON order_events(code);
"""


class OrderBook:
    def __init__(self, path: str | Path) -> None:
        self.path = str(path)
        with self._db() as con:
            con.executescript(_SCHEMA)

    @contextmanager
    def _db(self) -> Iterator[sqlite3.Connection]:
        con = sqlite3.connect(self.path, timeout=10)
        con.row_factory = sqlite3.Row
        try:
            with con:
                yield con
        finally:
            con.close()

    @staticmethod
    def validate_customer(customer: dict[str, str]) -> dict[str, str]:
        name = " ".join(customer.get("name", "").split())
        email = customer.get("email", "").strip().lower()
        phone = re.sub(r"[^\d+ ]", "", customer.get("phone", "")).strip()
        city = " ".join(customer.get("city", "").split())
        if not 2 <= len(name) <= 80:
            raise OrderError("Escribe tu nombre (entre 2 y 80 caracteres).")
        if not _EMAIL_RE.match(email) or len(email) > 120:
            raise OrderError("Escribe un correo válido, por ejemplo nombre@correo.com.")
        return {"name": name, "email": email, "phone": phone[:30], "city": city[:60]}

    def create(self, order: Order, idem_key: str | None = None) -> Order:
        with self._db() as con:
            if idem_key:
                row = con.execute("SELECT code FROM orders WHERE idem_key = ?", (idem_key,)).fetchone()
                if row:
                    found = self._load(con, row["code"])
                    assert found is not None
                    return found
            payload = json.dumps(
                {
                    "customer": order.customer,
                    "vehicle": order.vehicle,
                    "lines": order.lines,
                    "shipments": order.shipments,
                    "totals": order.totals,
                    "delivery": order.delivery,
                },
                ensure_ascii=False,
            )
            con.execute(
                "INSERT INTO orders (code, idem_key, created_at, status, email, payload) VALUES (?, ?, ?, ?, ?, ?)",
                (order.code, idem_key, order.created_at, order.status, order.customer["email"], payload),
            )
            con.execute(
                "INSERT INTO order_events (code, at, status, note) VALUES (?, ?, ?, ?)",
                (order.code, order.created_at, order.status, "Pedido registrado"),
            )
            created = self._load(con, order.code)
            assert created is not None
            return created

    def get(self, code: str, email: str) -> Order | None:
        canonical = normalize_code(code)
        if canonical is None:
            return None
        with self._db() as con:
            row = con.execute("SELECT email FROM orders WHERE code = ?", (canonical,)).fetchone()
            if row is None or not hmac.compare_digest(row["email"], email.strip().lower()):
                return None
            return self._load(con, canonical)

    def advance(self, code: str, status: Status, note: str = "") -> Order:
        canonical = normalize_code(code)
        if canonical is None:
            raise OrderError("Código de pedido inválido.")
        with self._db() as con:
            row = con.execute("SELECT status FROM orders WHERE code = ?", (canonical,)).fetchone()
            if row is None:
                raise OrderError("El pedido no existe.")
            if status not in TRANSITIONS[row["status"]]:
                raise OrderError(f"No se puede pasar de «{row['status']}» a «{status}».")
            now = datetime.now(UTC).isoformat(timespec="seconds")
            con.execute("UPDATE orders SET status = ? WHERE code = ?", (status, canonical))
            con.execute(
                "INSERT INTO order_events (code, at, status, note) VALUES (?, ?, ?, ?)", (canonical, now, status, note)
            )
            loaded = self._load(con, canonical)
            assert loaded is not None
            return loaded

    def recent(self, limit: int = 20) -> list[Order]:
        with self._db() as con:
            rows = con.execute("SELECT code FROM orders ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
            return [o for r in rows if (o := self._load(con, r["code"])) is not None]

    @staticmethod
    def _load(con: sqlite3.Connection, code: str) -> Order | None:
        row = con.execute("SELECT * FROM orders WHERE code = ?", (code,)).fetchone()
        if row is None:
            return None
        data = json.loads(row["payload"])
        events = [
            {"at": e["at"], "status": e["status"], "note": e["note"]}
            for e in con.execute("SELECT at, status, note FROM order_events WHERE code = ? ORDER BY rowid", (code,))
        ]
        delivery = (data["delivery"][0], data["delivery"][1]) if data.get("delivery") else None
        return Order(
            code=row["code"],
            created_at=row["created_at"],
            status=row["status"],
            customer=data["customer"],
            vehicle=data["vehicle"],
            lines=data["lines"],
            shipments=data["shipments"],
            totals=data["totals"],
            delivery=delivery,
            events=events,
        )
