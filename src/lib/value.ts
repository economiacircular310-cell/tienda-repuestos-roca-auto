/**
 * Índice de valor: cuánta calidad compras por cada unidad de dinero.
 *   valor = (valoración/5)² · √(años de garantía) · disponibilidad / precio^0.7
 * La exponente < 1 evita que siempre gane lo más barato; la valoración al cuadrado
 * castiga fuerte a los productos mal calificados. Se compara solo entre opciones de la
 * misma pieza (mismo vehículo, tipo y posición).
 */
import { getInventory } from '../data/inventory';
import type { Product } from '../data/types';

const years = (w: string) => Number.parseInt(w, 10) || 1;

export function valueScore(p: Product): number {
  const stock = p.stock.some((s) => s > 0) ? 1 : 0.8;
  const trust = Math.min(1, 0.6 + p.reviews / 250);
  return ((p.rating / 5) ** 2 * trust * Math.sqrt(years(p.warranty)) * stock) / p.price ** 0.7;
}

export const groupKey = (p: Product) => `${p.fit}|${p.partTypeId}|${p.position ?? ''}|${p.variant ?? ''}`;

let best: Set<string> | undefined;

/** Ids de los productos con mejor índice de valor dentro de su grupo (grupos de 3+ opciones). */
export function bestValueIds(): Set<string> {
  if (best) return best;
  const groups = new Map<string, Product[]>();
  for (const p of getInventory()) {
    const k = groupKey(p);
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }
  best = new Set();
  for (const g of groups.values()) {
    if (g.length < 3) continue;
    let top = g[0];
    for (const p of g) if (valueScore(p) > valueScore(top)) top = p;
    best.add(top.id);
  }
  return best;
}
