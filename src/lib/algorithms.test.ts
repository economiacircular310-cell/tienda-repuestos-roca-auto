import { describe, expect, it } from 'vitest';
import { WAREHOUSES } from '../data/catalog';
import { getInventory } from '../data/inventory';
import type { Product } from '../data/types';
import { diagnoseSymptom, findSymptom, rankCauses, SYMPTOMS } from '../search/diagnosis';
import { SearchEngine } from '../search/engine';
import { parseQuery } from '../search/parser';
import { tokens } from '../search/text';
import { planService, tasksAt } from './service';
import { planShipments } from './shipping';
import { bestValueIds, groupKey, valueScore } from './value';

describe('diagnóstico por síntomas', () => {
  it('reconoce el síntoma en lenguaje coloquial', () => {
    expect(findSymptom(tokens('me chilla al frenar el corolla'))?.symptom.id).toBe('ruido-frenar');
    expect(findSymptom(tokens('el carro se calienta mucho'))?.symptom.id).toBe('calienta');
    expect(findSymptom(tokens('prendió la luz de check engine'))?.symptom.id).toBe('check-engine');
    expect(findSymptom(tokens('pastillas delanteras'))).toBeNull();
  });

  it('las probabilidades suman 1 y el desgaste pesa más en autos viejos', () => {
    const s = SYMPTOMS.find((x) => x.id === 'calienta')!;
    const young = rankCauses(s, 20000);
    const old = rankCauses(s, 250000);
    expect(young.reduce((a, c) => a + c.p, 0)).toBeCloseTo(1, 6);
    const pOld = old.find((c) => c.partTypeId === 'refrigerante')!.p;
    const pYoung = young.find((c) => c.partTypeId === 'refrigerante')!.p;
    expect(pOld).not.toBe(pYoung);
    expect(diagnoseSymptom('no-arranca', 2010)!.causes[0].partTypeId).toBe('bateria');
  });

  it('el síntoma no se confunde con categorías ("luz de motor")', () => {
    const r = parseQuery('luz de motor encendida hilux 2015');
    expect(r.symptom).toBe('check-engine');
    expect(r.categories).toEqual([]);
    expect(r.vehicle?.modelId).toBe('toyota-hilux');
  });

  it('la búsqueda por síntoma devuelve las piezas causantes, compatibles y ordenadas', () => {
    const engine = new SearchEngine(getInventory());
    const r = engine.search({ q: 'chilla al frenar corolla 2012', pageSize: 50 });
    expect(r.diagnosis?.symptomId).toBe('ruido-frenar');
    const allowed = new Set(r.diagnosis!.causes.map((c) => c.partTypeId));
    const inv = getInventory();
    expect(r.items.every((h) => allowed.has(inv[h.i].partTypeId))).toBe(true);
    expect(inv[r.items[0].i].partTypeId).toBe(r.diagnosis!.causes[0].partTypeId);
    expect(r.items.every((h) => inv[h.i].fit === 'g:toyota-corolla-e140' || inv[h.i].fit.startsWith('e:'))).toBe(true);
  });
});

describe('plan de mantenimiento', () => {
  it('elige las tareas por múltiplos del intervalo', () => {
    expect(tasksAt(10000).map((t) => t.pt)).toEqual(['aceite-motor', 'filtro-aceite']);
    expect(tasksAt(100000).map((t) => t.pt)).toContain('kit-distribucion');
    expect(tasksAt(40000).map((t) => t.pt)).toContain('bujia');
  });

  it('arma paquetes compatibles con precios ordenados', () => {
    const plan = planService({ makeId: 'toyota', modelId: 'toyota-corolla', year: 2016, engine: '2ZR-FE' }, 40000);
    expect(plan.lines.length).toBeGreaterThanOrEqual(6);
    expect(plan.totals.eco).toBeLessThanOrEqual(plan.totals.rec);
    const bujias = plan.lines.find((l) => l.task.pt === 'bujia')!;
    expect(bujias.qty).toBe(4);
    for (const l of plan.lines)
      for (const p of Object.values(l.picks)) expect(p!.fit === '*' || ['g:toyota-corolla-e170', 'e:2ZR-FE'].includes(p!.fit)).toBe(true);
  });

  it('en diésel usa aceite 15W-40 y no pide bujías', () => {
    const plan = planService({ makeId: 'toyota', modelId: 'toyota-hilux', year: 2019, engine: '1GD-FTV' }, 40000);
    expect(plan.lines.find((l) => l.task.pt === 'aceite-motor')!.picks.eco!.variant).toBe('15W-40');
    expect(plan.lines.some((l) => l.task.pt === 'bujia')).toBe(false);
  });
});

describe('índice de valor', () => {
  it('marca un único ganador por grupo y prefiere valor sobre precio puro', () => {
    const best = bestValueIds();
    const inv = getInventory();
    const perGroup = new Map<string, number>();
    for (const p of inv) if (best.has(p.id)) perGroup.set(groupKey(p), (perGroup.get(groupKey(p)) ?? 0) + 1);
    expect([...perGroup.values()].every((n) => n === 1)).toBe(true);
    const a = { ...inv[0], price: 10, rating: 2.5, reviews: 300, warranty: '1 año', stock: [1, 0, 0] } as Product;
    const b = { ...inv[0], price: 14, rating: 4.8, reviews: 300, warranty: '2 años', stock: [1, 0, 0] } as Product;
    expect(valueScore(b)).toBeGreaterThan(valueScore(a));
  });
});

describe('consolidación de envíos', () => {
  const mk = (stock: number[], price = 10) => ({ ...getInventory()[0], id: Math.random().toString(36), stock, price }) as Product;

  it('usa un solo almacén cuando alcanza', () => {
    const plan = planShipments([
      { p: mk([2, 5, 0]), qty: 1 },
      { p: mk([0, 3, 1]), qty: 2 },
    ]);
    expect(plan.shipments.length).toBe(1);
    expect(plan.shipments[0].warehouse.id).toBe(WAREHOUSES[1].id);
  });

  it('divide en el mínimo de envíos y manda a pedido lo que no hay', () => {
    const plan = planShipments([
      { p: mk([3, 0, 0]), qty: 1 },
      { p: mk([0, 0, 4]), qty: 1 },
      { p: mk([0, 0, 0]), qty: 1 },
    ]);
    expect(plan.shipments.length).toBe(2);
    expect(plan.backorder.length).toBe(1);
  });
});
