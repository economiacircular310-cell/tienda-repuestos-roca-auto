"""Certificado de compatibilidad firmado (HMAC-SHA256, RFC 2104).

Al comprar una pieza para un vehículo concreto emitimos un token autocontenido:

    base64url(carga JSON canónica) . base64url(HMAC-SHA256(secreto, carga))

Cualquiera puede verificarlo con la tienda (el taller, una aseguradora, el propio cliente):
si alguien altera un solo carácter del vehículo, la pieza o la fecha, la firma no coincide.
No requiere base de datos. La comparación de firmas es de tiempo constante
(``hmac.compare_digest``) para no filtrar información por tiempos de respuesta.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


@dataclass(frozen=True, slots=True)
class Certificate:
    token: str
    code: str
    payload: dict[str, str | int | None]


def _sign(secret: bytes, body: bytes) -> bytes:
    return hmac.new(secret, body, hashlib.sha256).digest()


def _code(sig: bytes) -> str:
    raw = base64.b32encode(sig[:10]).decode()
    return "LAC-" + "-".join(raw[i : i + 4] for i in range(0, 16, 4))


def issue(
    secret: bytes, product_id: str, part_number: str, vehicle: dict[str, str | int | None], now: datetime | None = None
) -> Certificate:
    payload: dict[str, str | int | None] = {
        "v": 1,
        "p": product_id,
        "pn": part_number,
        **{f"veh_{k}": val for k, val in vehicle.items()},
        "iat": (now or datetime.now(UTC)).strftime("%Y-%m-%d"),
    }
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    sig = _sign(secret, body)
    return Certificate(f"{_b64(body)}.{_b64(sig)}", _code(sig), payload)


def verify(secret: bytes, token: str) -> Certificate | None:
    try:
        body_b64, sig_b64 = token.split(".", 1)
        body, sig = _unb64(body_b64), _unb64(sig_b64)
    except (ValueError, TypeError):
        return None
    if not hmac.compare_digest(sig, _sign(secret, body)):
        return None
    try:
        payload = json.loads(body)
    except ValueError:
        return None
    return Certificate(token, _code(sig), payload)
