import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// La interfaz es un cliente delgado: toda la lógica vive en la API de Python (../backend).
// En desarrollo, /api se reenvía a uvicorn; en producción FastAPI sirve dist/ en el mismo origen.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
