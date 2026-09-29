import { beforeAll, describe, expect, it } from 'vitest';
import { getInventory, normPN } from '../data/inventory';
import { SearchEngine } from './engine';
import { parseQuery, removeSpans } from './parser';

let engine: SearchEngine;
beforeAll(() => {
  engine = new SearchEngine(getInventory());
});

const P = () => engine.products;

describe('parser', () => {
  it('interpreta vehículo, pieza, posición y precio', () => {
    const r = parseQuery('pastillas delanteras corolla 2016 menos de 60');
    expect(r.partTypes).toEqual(['pastillas-freno']);
    expect(r.positions).toEqual(['Delantero']);
    expect(r.vehicle).toMatchObject({ makeId: 'toyota', modelId: 'toyota-corolla', year: 2016 });
    expect(r.priceMax).toBe(60);
    expect(r.text).toBe('');
  });

  it('entiende sinónimos regionales y plurales', () => {
    expect(parseQuery('balatas').partTypes).toEqual(['pastillas-freno']);
    expect(parseQuery('mofle').partTypes).toEqual(['silenciador']);
    expect(parseQuery('croche').partTypes).toEqual(['kit-embrague']);
    expect(parseQuery('amortiguadores traseros').partTypes).toEqual(['amortiguador']);
    expect(parseQuery('filtro de aire acondicionado').partTypes).toEqual(['filtro-cabina']);
    expect(parseQuery('filtro de aire').partTypes).toEqual(['filtro-aire']);
  });

  it('corrige errores de tipeo en marcas y modelos', () => {
    const r = parseQuery('toyta corrola');
    expect(r.vehicle).toMatchObject({ makeId: 'toyota', modelId: 'toyota-corolla' });
    expect(r.corrections.length).toBeGreaterThan(0);
  });

  it('resuelve el motor por cilindrada o código', () => {
    expect(parseQuery('hilux 2018 2.8').vehicle?.engine).toBe('1GD-FTV');
    expect(parseQuery('bomba de agua 2zr-fe').vehicle?.engine).toBe('2ZR-FE');
    expect(parseQuery('mazda 3 2016').vehicle?.modelId).toBe('mazda-mazda3');
    expect(parseQuery('cr-v 2014').vehicle?.modelId).toBe('honda-crv');
  });

  it('quita el texto de un filtro al cerrar su chip', () => {
    const q = 'pastillas corolla 2016';
    const chip = parseQuery(q).chips.find((c) => c.kind === 'vehicle')!;
    expect(removeSpans(q, chip.spans)).toBe('pastillas');
  });
});

describe('motor de búsqueda', () => {
  it('filtra por compatibilidad con el vehículo de la consulta', () => {
    const r = engine.search({ q: 'pastillas delanteras corolla 2016', pageSize: 100 });
    expect(r.total).toBeGreaterThan(1);
    for (const h of r.items) {
      const p = P()[h.i];
      expect(p.partTypeId).toBe('pastillas-freno');
      expect(p.position).toBe('Delantero');
      expect(p.fit).toBe('g:toyota-corolla-e170');
    }
    expect(r.vehicleSource).toBe('query');
  });

  it('usa el vehículo del garaje cuando la consulta no nombra uno', () => {
    const r = engine.search({ q: 'filtro de aceite', vehicle: { makeId: 'nissan', modelId: 'nissan-versa', year: 2018, engine: 'HR16DE' } });
    expect(r.total).toBeGreaterThan(0);
    expect(r.items.every((h) => P()[h.i].fit === 'e:HR16DE')).toBe(true);
    expect(r.vehicleSource).toBe('garage');
    expect(r.hiddenByFitment).toBeGreaterThan(100);
  });

  it('encuentra un número de parte con cualquier formato', () => {
    const p = P().find((x) => x.partNumber.includes(' '))!;
    const messy = p.partNumber.replace(/ /g, '-').toLowerCase();
    const r = engine.search({ q: messy });
    expect(r.pnMatch?.kind).toBe('pn');
    expect(r.items[0].i).toBe(p.i);
  });

  it('un número OEM devuelve todas las piezas equivalentes', () => {
    const p = P().find((x) => x.oem.length && x.fit.startsWith('g:'))!;
    const r = engine.search({ q: p.oem[0] });
    expect(r.pnMatch?.kind).toBe('oem');
    const equivalents = P().filter((x) => x.oem.includes(p.oem[0]));
    expect(r.total).toBe(equivalents.length);
    expect(r.total).toBeGreaterThan(1);
  });

  it('busca por número parcial', () => {
    const p = P().find((x) => x.brandId === 'brembo')!;
    const partial = normPN(p.partNumber).slice(0, 5);
    const r = engine.search({ q: partial, pageSize: 200 });
    expect(r.items.some((h) => h.i === p.i)).toBe(true);
  });

  it('tolera errores de tipeo en texto libre', () => {
    const r = engine.search({ q: 'amortiguadr' });
    expect(r.total).toBeGreaterThan(0);
    expect(P()[r.items[0].i].partTypeId).toBe('amortiguador');
  });

  it('las facetas son disyuntivas (cada una ignora su propia selección)', () => {
    const r = engine.search({ q: 'pastillas', filters: { brand: ['bosch'] } });
    const brands = r.facets.brand;
    expect(brands.find((b) => b.value === 'bosch')?.selected).toBe(true);
    expect(brands.filter((b) => b.count > 0).length).toBeGreaterThan(3);
    expect(r.items.every((h) => P()[h.i].brandId === 'bosch')).toBe(true);
  });

  it('aplica rango de precio y orden', () => {
    const r = engine.search({ q: 'bujia', filters: { priceMax: 10 }, sort: 'precio-asc', pageSize: 50 });
    const prices = r.items.map((h) => P()[h.i].price);
    expect(prices.every((x) => x <= 10)).toBe(true);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('autocompleta la última palabra', () => {
    expect(engine.suggest('amortig')[0]).toBe('amortiguador');
    expect(engine.suggest('corolla pastil')[0]).toMatch(/^corolla pastillas/);
  });

  it('responde en pocos milisegundos', () => {
    expect(engine.benchmark()).toBeLessThan(40);
  });
});
