/**
 * Plan de mantenimiento por kilometraje.
 *
 * 1) Qué toca: cada tarea tiene un intervalo; en el servicio de K km toca si K es múltiplo
 *    de su intervalo (K se redondea a la decena de miles más cercana).
 * 2) Qué comprar: para cada tarea se filtran las piezas compatibles con el vehículo y se
 *    arman tres paquetes:
 *      Económico   → la opción más barata con existencias.
 *      Recomendado → la de mejor índice de valor (lib/value.ts).
 *      Premium     → la mejor calificada de nivel alto desempeño u original.
 * 3) Las cantidades se ajustan al motor (bujías × cilindros) y al trabajo (amortiguadores por par).
 */
import { PART_TYPE_BY_ID } from '../data/catalog';
import { fits, getInventory } from '../data/inventory';
import type { Product, VehicleQuery } from '../data/types';
import { ENGINES, MAX_YEAR, enginesFor, fitKeysFor } from '../data/vehicles';
import { valueScore } from './value';

export interface Task {
  pt: string;
  every: number;
  position?: string;
  qty?: (cyl: number) => number;
  why: string;
}

export const TASKS: Task[] = [
  { pt: 'aceite-motor', every: 10000, why: 'Cambio de aceite' },
  { pt: 'filtro-aceite', every: 10000, why: 'Va con cada cambio de aceite' },
  { pt: 'filtro-aire', every: 20000, why: 'Protege el motor del polvo' },
  { pt: 'filtro-cabina', every: 20000, why: 'Aire limpio en la cabina' },
  { pt: 'plumillas', every: 20000, why: 'El caucho se endurece con el sol' },
  { pt: 'bujia', every: 40000, qty: (cyl) => cyl, why: 'Una por cilindro' },
  { pt: 'filtro-combustible', every: 40000, why: 'Cuida bomba e inyectores' },
  { pt: 'liquido-frenos', every: 40000, qty: () => 2, why: 'Absorbe humedad con el tiempo' },
  { pt: 'pastillas-freno', every: 40000, position: 'Delantero', why: 'Eje delantero, desgaste normal' },
  { pt: 'refrigerante', every: 60000, qty: () => 2, why: 'Pierde aditivos anticorrosión' },
  { pt: 'correa-accesorios', every: 60000, why: 'Se cristaliza y chilla' },
  { pt: 'aceite-transmision', every: 60000, qty: () => 4, why: 'Alarga la vida de la caja' },
  { pt: 'disco-freno', every: 80000, position: 'Delantero', qty: () => 2, why: 'Par delantero' },
  { pt: 'amortiguador', every: 80000, position: 'Delantero', qty: () => 2, why: 'Siempre por pares' },
  { pt: 'kit-distribucion', every: 100000, why: 'Si se rompe, daña el motor' },
];

export type PackId = 'eco' | 'rec' | 'pro';
export interface PlanLine {
  task: Task;
  name: string;
  qty: number;
  picks: Partial<Record<PackId, Product>>;
}
export interface ServicePlan {
  km: number;
  lines: PlanLine[];
  totals: Record<PackId, number>;
  engine?: string;
}

export const roundKm = (km: number) => Math.max(10000, Math.round(km / 10000) * 10000);
export const tasksAt = (km: number) => TASKS.filter((t) => roundKm(km) % t.every === 0);

function variantFor(pt: string, engine?: string, year?: number): string | undefined {
  const e = engine ? ENGINES[engine] : undefined;
  if (pt === 'aceite-motor') return e?.fuel === 'Diésel' ? '15W-40' : (year ?? 0) >= 2018 ? '0W-20' : '5W-30';
  if (pt === 'liquido-frenos') return 'DOT 4';
  if (pt === 'refrigerante') return 'Rosa (P-HOAT)';
  if (pt === 'aceite-transmision') return 'ATF Dexron VI';
  return undefined;
}

export function planService(v: VehicleQuery, km: number): ServicePlan {
  const K = roundKm(km);
  const engine = v.engine ?? (v.modelId && v.year ? enginesFor(v.modelId, v.year)[0] : undefined);
  const keys = fitKeysFor({ ...v, engine });
  const cyl = engine ? ENGINES[engine].cyl : 4;
  const inv = getInventory();
  const lines: PlanLine[] = [];

  for (const task of tasksAt(K)) {
    const variant = variantFor(task.pt, engine, v.year);
    const cands = inv.filter(
      (p) => p.partTypeId === task.pt && fits(p, keys) && (!task.position || p.position === task.position) && (!variant || p.variant === variant),
    );
    if (!cands.length) continue;
    const inStock = cands.filter((p) => p.stock.some((s) => s > 0));
    const pool = inStock.length ? inStock : cands;
    const eco = [...pool].sort((a, b) => a.price - b.price)[0];
    const rec = [...pool].sort((a, b) => valueScore(b) - valueScore(a))[0];
    const high = pool.filter((p) => p.tier === 'desempeno' || p.tier === 'oem');
    const pro = [...(high.length ? high : pool)].sort((a, b) => b.rating - a.rating || b.price - a.price)[0];
    lines.push({ task, name: PART_TYPE_BY_ID.get(task.pt)!.name, qty: task.qty ? task.qty(cyl) : 1, picks: { eco, rec, pro } });
  }

  const totals = { eco: 0, rec: 0, pro: 0 } as Record<PackId, number>;
  for (const l of lines) for (const k of ['eco', 'rec', 'pro'] as PackId[]) totals[k] += (l.picks[k]?.price ?? 0) * l.qty;
  for (const k of Object.keys(totals) as PackId[]) totals[k] = Math.round(totals[k] * 100) / 100;
  return { km: K, lines, totals, engine };
}

/** Próximos hitos grandes (para la línea de tiempo del odómetro). */
export function milestones(fromKm: number, count = 6) {
  const out: { km: number; tasks: Task[] }[] = [];
  for (let k = roundKm(fromKm); out.length < count; k += 10000) out.push({ km: k, tasks: tasksAt(k) });
  return out;
}

export const defaultKm = (year?: number) => roundKm(year ? (MAX_YEAR - year + 0.5) * 15000 : 60000);
