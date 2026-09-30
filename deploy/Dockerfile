# Imagen del paquete para el servidor: la interfaz ya viene compilada en web/ (no hace falta Node).
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LENIN_FRONTEND_DIST=/app/web \
    LENIN_DB=/app/data/pedidos.sqlite3 \
    WEB_CONCURRENCY=2
COPY backend/pyproject.toml backend/README.md ./
COPY backend/lenin_auto ./lenin_auto
RUN pip install --no-cache-dir . && useradd --create-home lenin && mkdir -p /app/data && chown lenin /app/data
COPY web /app/web
USER lenin
# Pedidos (SQLite) e inventario importado: monta un volumen para conservarlos entre despliegues.
VOLUME ["/app/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/api/health')"
# PORT lo fijan Render, Railway y similares; WEB_CONCURRENCY es el número de procesos.
CMD ["sh", "-c", "exec uvicorn lenin_auto.api:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
