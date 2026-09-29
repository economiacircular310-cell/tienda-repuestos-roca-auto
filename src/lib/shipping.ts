/**
 * Consolidación de envíos: elige el menor conjunto de almacenes que surte el carrito.
 *
 * Con W almacenes hay 2^W − 1 combinaciones; con 3 almacenes es una búsqueda exacta de
 * 7 casos (para decenas de almacenes se cambia por un set-cover voraz). Criterio:
 *   1) menos envíos, 2) menor día máximo de entrega, 3) menor suma de días.
 * Cada línea se asigna al almacén del conjunto con más existencias y, si ninguno alcanza
 * solo, se reparte entre varios.
 */
import { WAREHOUSES } from '../data/catalog';
import type { Product, Warehouse } from '../data/types';

export interface Line {
  p: Product;
  qty: number;
}

export interface ShipmentPlan {
  shipments: { warehouse: Warehouse; items: { p: Product; qty: number }[] }[];
  backorder: Line[];
  eta: [number, number] | null;
}

export function planShipments(lines: Line[], warehouses: Warehouse[] = WAREHOUSES): ShipmentPlan {
  const W = warehouses.length;
  const backorder = lines.filter((l) => l.p.stock.reduce((a, b) => a + b, 0) < l.qty);
  const shippable = lines.filter((l) => !backorder.includes(l));
  if (!shippable.length) return { shipments: [], backorder, eta: null };

  let bestMask = -1;
  let bestKey: number[] | null = null;
  for (let mask = 1; mask < 1 << W; mask++) {
    const idx = [...Array(W).keys()].filter((i) => mask & (1 << i));
    const ok = shippable.every((l) => idx.reduce((a, i) => a + l.p.stock[i], 0) >= l.qty);
    if (!ok) continue;
    const key = [idx.length, Math.max(...idx.map((i) => warehouses[i].eta[1])), idx.reduce((a, i) => a + warehouses[i].eta[1], 0)];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      bestKey = key;
      bestMask = mask;
    }
  }

  const chosen = [...Array(W).keys()].filter((i) => bestMask & (1 << i));
  const byW = new Map<number, { p: Product; qty: number }[]>();
  for (const l of shippable) {
    const single = chosen.filter((i) => l.p.stock[i] >= l.qty).sort((a, b) => l.p.stock[b] - l.p.stock[a])[0];
    if (single != null) {
      byW.set(single, [...(byW.get(single) ?? []), { p: l.p, qty: l.qty }]);
      continue;
    }
    let left = l.qty;
    for (const i of [...chosen].sort((a, b) => l.p.stock[b] - l.p.stock[a])) {
      const take = Math.min(left, l.p.stock[i]);
      if (take > 0) byW.set(i, [...(byW.get(i) ?? []), { p: l.p, qty: take }]);
      left -= take;
      if (!left) break;
    }
  }
  const shipments = [...byW.entries()].sort((a, b) => a[0] - b[0]).map(([i, items]) => ({ warehouse: warehouses[i], items }));
  const eta: [number, number] = [Math.max(...shipments.map((s) => s.warehouse.eta[0])), Math.max(...shipments.map((s) => s.warehouse.eta[1]))];
  return { shipments, backorder, eta };
}
