import { createStore } from '../lib/store';

export interface SavedVehicle {
  id: string;
  makeId: string;
  modelId: string;
  year: number;
  engine?: string;
}

export const garage = createStore<{ vehicles: SavedVehicle[]; activeId: string | null }>({ vehicles: [], activeId: null }, 'lac.garage.v1');

export function activeVehicle(): SavedVehicle | null {
  const g = garage.get();
  return g.vehicles.find((v) => v.id === g.activeId) ?? null;
}

export function saveVehicle(v: Omit<SavedVehicle, 'id'>): SavedVehicle {
  const id = `${v.modelId}-${v.year}-${v.engine ?? 'x'}`;
  const saved = { ...v, id };
  garage.set((g) => ({
    vehicles: [saved, ...g.vehicles.filter((x) => x.id !== id)].slice(0, 6),
    activeId: id,
  }));
  return saved;
}

export const cart = createStore<{ items: { id: string; qty: number }[] }>({ items: [] }, 'lac.cart.v1');

export function addToCart(id: string, qty = 1) {
  cart.set((c) => {
    const found = c.items.find((i) => i.id === id);
    return {
      items: found ? c.items.map((i) => (i.id === id ? { ...i, qty: Math.min(99, i.qty + qty) } : i)) : [...c.items, { id, qty }],
    };
  });
}

export function setQty(id: string, qty: number) {
  cart.set((c) => ({ items: qty <= 0 ? c.items.filter((i) => i.id !== id) : c.items.map((i) => (i.id === id ? { ...i, qty: Math.min(99, qty) } : i)) }));
}

export const myOrders = createStore<{ code: string; email: string }[]>([], 'lac.orders.v1');
export function rememberOrder(code: string, email: string) {
  myOrders.set((o) => [{ code, email }, ...o.filter((x) => x.code !== code)].slice(0, 20));
}

export const recent = createStore<string[]>([], 'lac.recent.v1');
export function pushRecent(q: string) {
  const t = q.trim();
  if (t.length < 2) return;
  recent.set((r) => [t, ...r.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6));
}

export type ThemePref = 'system' | 'light' | 'dark';
export const theme = createStore<ThemePref>('system', 'lac.theme.v1');

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export const ui = createStore<{ palette: boolean; paletteSeed: string; cart: boolean; garage: boolean }>({
  palette: false,
  paletteSeed: '',
  cart: false,
  garage: false,
});

export const openPalette = (seed = '') => ui.set((u) => ({ ...u, palette: true, paletteSeed: seed, garage: false }));

export interface Toast {
  id: number;
  text: string;
  tone?: 'ok' | 'info';
}
export const toasts = createStore<Toast[]>([]);
let toastSeq = 0;
export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const id = ++toastSeq;
  toasts.set((t) => [...t, { id, text, tone }].slice(-3));
  setTimeout(() => toasts.set((t) => t.filter((x) => x.id !== id)), 3200);
}
