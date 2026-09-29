/**
 * Cliente de búsqueda: habla con el Web Worker (índice fuera del hilo de la interfaz)
 * y, si el entorno no permite workers, carga el motor en el hilo principal.
 */
import { useEffect, useRef, useState } from 'react';
import { getInventory } from '../data/inventory';
import type { EngineStats, SearchRequest, SearchResponse } from './types';

type Pending = { resolve: (r: SearchResponse) => void; reject: (e: unknown) => void };

interface Backend {
  search(req: SearchRequest): Promise<SearchResponse>;
}

let statsValue: EngineStats | null = null;
const statsListeners = new Set<(s: EngineStats) => void>();
const publishStats = (s: EngineStats) => {
  statsValue = s;
  statsListeners.forEach((fn) => fn(s));
};

async function mainThreadBackend(): Promise<Backend> {
  const { SearchEngine } = await import('./engine');
  const engine = new SearchEngine(getInventory());
  publishStats(engine.stats('main', engine.benchmark()));
  return { search: async (req) => engine.search(req) };
}

function workerBackend(): Promise<Backend> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    const pending = new Map<number, Pending>();
    let seq = 0;
    let ready = false;
    const timer = setTimeout(() => !ready && reject(new Error('worker timeout')), 15000);
    worker.onerror = (e) => {
      if (!ready) {
        clearTimeout(timer);
        reject(e);
      }
    };
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        ready = true;
        clearTimeout(timer);
        publishStats(msg.stats);
        resolve({
          search: (req) =>
            new Promise((res, rej) => {
              const id = ++seq;
              pending.set(id, { resolve: res, reject: rej });
              worker.postMessage({ id, req });
            }),
        });
      } else {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.type === 'result') p.resolve(msg.result);
        else p.reject(new Error(msg.error));
      }
    };
  });
}

let backend: Promise<Backend> | null = null;
function getBackend(): Promise<Backend> {
  if (!backend) backend = workerBackend().catch(() => mainThreadBackend());
  return backend;
}

export const search = (req: SearchRequest) => getBackend().then((b) => b.search(req));

/** Arranca el índice en cuanto la página termina de pintar. */
export function warmUp() {
  void getBackend();
}

export function useEngineStats(): EngineStats | null {
  const [s, setS] = useState(statsValue);
  useEffect(() => {
    statsListeners.add(setS);
    void getBackend();
    return () => {
      statsListeners.delete(setS);
    };
  }, []);
  return s;
}

/** Ejecuta una búsqueda y descarta respuestas que lleguen fuera de orden. */
export function useSearch(req: SearchRequest | null) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const key = req ? JSON.stringify(req) : '';
  useEffect(() => {
    if (!req) return;
    const ticket = ++latest.current;
    setLoading(true);
    search(req)
      .then((r) => {
        if (ticket === latest.current) setData(r);
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading };
}
