# Imagen única: compila la interfaz (Node) y la sirve junto con la API (Python/FastAPI).
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LENIN_FRONTEND_DIST=/app/web
COPY backend/pyproject.toml backend/README.md ./
COPY backend/lenin_auto ./lenin_auto
RUN pip install --no-cache-dir . && useradd --create-home lenin
COPY --from=web /web/dist /app/web
USER lenin
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "lenin_auto.api:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
