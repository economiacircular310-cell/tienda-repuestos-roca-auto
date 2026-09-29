"""Ajustes de la tienda. Se pueden cambiar con variables de entorno LENIN_*."""

from __future__ import annotations

import os
import secrets
import warnings
from dataclasses import dataclass, field


def _secret() -> bytes:
    value = os.environ.get("LENIN_SECRET")
    if value:
        return value.encode()
    warnings.warn(
        "LENIN_SECRET no está definido: los certificados usan una clave temporal y dejan de "
        "verificarse al reiniciar. Define LENIN_SECRET en producción.",
        stacklevel=2,
    )
    return secrets.token_bytes(32)


@dataclass(frozen=True, slots=True)
class Settings:
    name: str = os.environ.get("LENIN_STORE_NAME", "Lenin Auto Cars")
    currency: str = os.environ.get("LENIN_CURRENCY", "USD")
    locale: str = os.environ.get("LENIN_LOCALE", "es-419")
    free_shipping_from: float = float(os.environ.get("LENIN_FREE_SHIPPING", "99"))
    shipping_flat: float = float(os.environ.get("LENIN_SHIPPING_FLAT", "7.9"))
    email: str = os.environ.get("LENIN_EMAIL", "ventas@leninautocars.example")
    whatsapp: str = os.environ.get("LENIN_WHATSAPP", "+00 000 000 0000")
    km_per_year: int = 15_000
    rate_capacity: int = int(os.environ.get("LENIN_RATE_BURST", "120"))
    rate_per_second: float = float(os.environ.get("LENIN_RATE_PER_SECOND", "2"))
    trust_proxy: bool = os.environ.get("LENIN_TRUST_PROXY", "0") == "1"
    database: str = os.environ.get("LENIN_DB", "lenin_auto.sqlite3")
    secret: bytes = field(default_factory=_secret, repr=False)


settings = Settings()
