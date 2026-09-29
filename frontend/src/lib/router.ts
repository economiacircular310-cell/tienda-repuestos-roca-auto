/**
 * Enrutador por hash (#/ruta?params). Funciona en cualquier hosting estático sin
 * reglas de reescritura; si el entorno bloquea la navegación, sigue en memoria.
 */
import { useMemo, useSyncExternalStore, type MouseEvent } from 'react';

let memory: string | null = null;
const listeners = new Set<() => void>();
const current = () => memory ?? (location.hash.replace(/^#/, '') || '/');

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener('hashchange', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('hashchange', fn);
  };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  try {
    if (opts.replace) history.replaceState(null, '', `#${to}`);
    else location.hash = to;
    memory = null;
  } catch {
    memory = to;
  }
  listeners.forEach((l) => l());
}

export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

export function useRoute(): Route {
  const raw = useSyncExternalStore(subscribe, current, () => '/');
  return useMemo(() => {
    const [p, qs = ''] = raw.split('?');
    return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs), raw };
  }, [raw]);
}

export const href = (to: string) => `#${to}`;

/** onClick para <a href="#…">: respeta Ctrl/Cmd+clic y usa navigate() en lo demás. */
export function linkClick(to: string, after?: () => void) {
  return (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
    after?.();
  };
}

export function searchUrl(q: string, params: Record<string, string | undefined> = {}) {
  const sp = new URLSearchParams();
  if (q) sp.set('q', q);
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return `/buscar${s ? `?${s}` : ''}`;
}
