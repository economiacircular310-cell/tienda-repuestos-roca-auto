/**
 * Cliente HTTP de la API de Python. Toda la lógica vive en el servidor; aquí solo hay
 * transporte, caché de GET y descarte de respuestas fuera de orden.
 */
import { useEffect, useRef, useState } from 'react';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export type Params = Record<string, string | number | boolean | null | undefined>;

export function url(path: string, params: Params = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const qs = sp.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

const cache = new Map<string, Promise<unknown>>();

export async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const u = url(path, params);
  let p = cache.get(u) as Promise<T> | undefined;
  if (!p) {
    p = fetch(u, { signal }).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 404 ? 'No encontrado' : `Error ${r.status}`);
      return (await r.json()) as T;
    });
    cache.set(u, p);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    p.catch(() => cache.delete(u));
  }
  return p;
}

/** Error de la API con el mensaje apto para el cliente que manda el servidor. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!r.ok) {
    const detail = await r.json().catch(() => null);
    const message = typeof detail?.detail === 'string' ? detail.detail : r.status === 429 ? 'Demasiadas peticiones. Espera un momento.' : `Error ${r.status}`;
    throw new ApiError(r.status, message);
  }
  return (await r.json()) as T;
}

/** GET reactivo: vuelve a pedir cuando cambian ruta o parámetros; ignora respuestas viejas. */
export function useApi<T>(path: string | null, params: Params = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ticket = useRef(0);
  const key = path ? url(path, params) : '';
  useEffect(() => {
    if (!path) return;
    const mine = ++ticket.current;
    setLoading(true);
    get<T>(path, params)
      .then((d) => {
        if (mine === ticket.current) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => mine === ticket.current && setError(e.message))
      .finally(() => mine === ticket.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error, loading };
}
