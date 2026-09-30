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
  // Navegadores desde 2022 (el mínimo de las capas CSS que usa Tailwind 4): JS sin sintaxis más nueva.
  build: {
    target: ['chrome99', 'edge99', 'firefox97', 'safari15.4'],
    cssTarget: ['chrome99', 'edge99', 'firefox97', 'safari15.4'],
    chunkSizeWarningLimit: 900,
  },
});
