"""Protección de la API: limitador de peticiones y cabeceras de seguridad.

Token bucket (cubeta de fichas)
    Cada cliente tiene una cubeta de ``capacity`` fichas que se rellena a ``rate`` fichas
    por segundo; cada petición gasta una. Permite ráfagas cortas (teclear en el buscador
    dispara varias consultas seguidas) y corta los abusos sostenidos. O(1) por petición y
    memoria acotada: las cubetas más antiguas se descartan (LRU) al pasar de ``max_keys``.
    Las respuestas llevan las cabeceras ``RateLimit-*`` del borrador IETF y, al rechazar,
    ``Retry-After`` con los segundos exactos hasta la siguiente ficha.

Cabeceras de seguridad
    CSP estricta (solo recursos propios), ``nosniff``, sin iframes ajenos, política de
    referer y de permisos, aislamiento de ventana y HSTS cuando la conexión es HTTPS.
"""

from __future__ import annotations

import json
import math
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable, MutableMapping
from dataclasses import dataclass
from typing import Any

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class Decision:
    allowed: bool
    remaining: int
    retry_after: float
    reset: float


class TokenBucket:
    def __init__(self, capacity: int, rate: float, max_keys: int = 10_000) -> None:
        self.capacity = capacity
        self.rate = rate
        self.max_keys = max_keys
        self._buckets: OrderedDict[str, tuple[float, float]] = OrderedDict()

    def take(self, key: str, now: float | None = None) -> Decision:
        t = time.monotonic() if now is None else now
        tokens, last = self._buckets.pop(key, (float(self.capacity), t))
        tokens = min(float(self.capacity), tokens + (t - last) * self.rate)
        allowed = tokens >= 1.0
        if allowed:
            tokens -= 1.0
        self._buckets[key] = (tokens, t)
        if len(self._buckets) > self.max_keys:
            self._buckets.popitem(last=False)
        retry = 0.0 if allowed else (1.0 - tokens) / self.rate
        reset = (self.capacity - tokens) / self.rate
        return Decision(allowed, int(tokens), retry, reset)


def _client_key(scope: Scope, trust_proxy: bool) -> str:
    """IP del cliente. Detrás de un proxy de confianza, la **última** de ``X-Forwarded-For``:
    es la que agrega el proxy; las anteriores las escribe el cliente y se pueden falsear."""
    if trust_proxy:
        for name, value in scope.get("headers", ()):
            if name == b"x-forwarded-for":
                last = str(value.decode("latin-1")).rsplit(",", 1)[-1].strip()
                if last:
                    return last
    client = scope.get("client")
    return str(client[0]) if client else "anon"


class RateLimitMiddleware:
    """Limita solo las rutas ``/api/``; la interfaz estática no gasta fichas."""

    def __init__(self, app: ASGIApp, capacity: int = 120, rate: float = 2.0, trust_proxy: bool = False) -> None:
        self.app = app
        self.bucket = TokenBucket(capacity, rate)
        self.trust_proxy = trust_proxy

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/") or scope["path"] == "/api/health":
            await self.app(scope, receive, send)
            return
        d = self.bucket.take(_client_key(scope, self.trust_proxy))
        limit = [
            (b"ratelimit-limit", str(self.bucket.capacity).encode()),
            (b"ratelimit-remaining", str(d.remaining).encode()),
            (b"ratelimit-reset", str(math.ceil(d.reset)).encode()),
        ]
        if not d.allowed:
            body = json.dumps({"detail": "Demasiadas peticiones. Espera un momento y vuelve a intentar."}).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"retry-after", str(math.ceil(d.retry_after)).encode()),
                        *limit,
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        async def with_limits(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), *limit]
            await send(message)

        await self.app(scope, receive, with_limits)


CSP = "; ".join(
    (
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    )
)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        https = scope.get("scheme") == "https"
        is_docs = scope["path"].startswith("/api/docs")

        async def secured(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"x-frame-options", b"DENY"),
                    (b"cross-origin-opener-policy", b"same-origin"),
                    (b"permissions-policy", b"camera=(), geolocation=(), payment=(), microphone=(self)"),
                ]
                if not is_docs:  # Swagger UI carga sus recursos desde una CDN
                    headers.append((b"content-security-policy", CSP.encode()))
                if https:
                    headers.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                message["headers"] = [*message.get("headers", []), *headers]
            await send(message)

        await self.app(scope, receive, secured)
