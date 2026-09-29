/**
 * Inventario de demostración.
 *
 * Se genera de forma determinista (misma semilla => mismos productos) para que el hilo
 * principal y el Web Worker de búsqueda construyan exactamente el mismo arreglo sin
 * tener que transferir miles de objetos entre ellos. En producción este módulo se
 * reemplaza por el feed real (ERP, ACES/PIES, TecDoc) — ver docs/ARQUITECTURA.md.
 */
import { BRANDS, OEM_PATTERNS, PART_TYPES, TIER_BY_ID, WAREHOUSES, XREF_BRANDS } from './catalog';
import type { Brand, Generation, PartType, Product, Tier } from './types';
import { ENGINES, GENERATIONS, GENS_BY_ENGINE, GEN_BY_ID, MODEL_BY_ID } from './vehicles';

export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normaliza un número de parte: 'P 83 140', 'p83-140' y 'P83140' son la misma clave. */
export const normPN = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
function fill(pattern: string, r: () => number): string {
  let out = '';
  for (const ch of pattern) {
    if (ch === '#') out += Math.floor(r() * 10);
    else if (ch === '@') out += LETTERS[Math.floor(r() * LETTERS.length)];
    else out += ch;
  }
  return out;
}

const pick = <T>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)];

function brandCovers(b: Brand, pt: PartType): boolean {
  if (b.types?.includes(pt.id)) return true;
  return pt.basis !== 'universal' && !!b.cats?.includes(pt.cat);
}

const roundPrice = (p: number, r: () => number) => Math.max(2.99, Math.floor(p) + (r() < 0.55 ? 0.99 : 0.49));

interface Group {
  pt: PartType;
  fit: string;
  makeId?: string;
  position?: string;
  variant?: string;
  sizeFactor: number;
}

function enginePartAllowed(pt: PartType, code: string): boolean {
  const e = ENGINES[code];
  const diesel = e.fuel === 'Diésel';
  switch (pt.id) {
    case 'bujia':
    case 'bobina':
    case 'cuerpo-aceleracion':
      return !diesel;
    case 'cables-bujia': {
      const oldest = Math.min(...(GENS_BY_ENGINE.get(code) ?? []).map((g) => g.from));
      return !diesel && oldest < 2012 && e.cyl <= 4;
    }
    case 'kit-embrague':
      return e.cyl < 8 && e.fuel !== 'Híbrido';
    case 'motor-arranque':
      return e.fuel !== 'Híbrido';
    case 'sensor-oxigeno':
      return !diesel;
    default:
      return true;
  }
}

function hasRearDrum(g: Generation): boolean {
  const m = MODEL_BY_ID.get(g.modelId)!;
  const maxL = Math.max(...g.engines.map((c) => ENGINES[c].liters));
  return m.body === 'Pickup' || (m.body !== 'SUV' && maxL <= 1.6);
}

function buildGroups(): Group[] {
  const groups: Group[] = [];
  const engineCodes = [...GENS_BY_ENGINE.keys()];
  for (const pt of PART_TYPES) {
    if (pt.basis === 'universal') {
      for (const variant of pt.variants ?? ['']) groups.push({ pt, fit: '*', variant, sizeFactor: 1 });
      continue;
    }
    if (pt.basis === 'engine') {
      for (const code of engineCodes) {
        if (!enginePartAllowed(pt, code)) continue;
        const gens = GENS_BY_ENGINE.get(code)!;
        const makeId = MODEL_BY_ID.get(gens[0].modelId)!.makeId;
        const e = ENGINES[code];
        groups.push({ pt, fit: `e:${code}`, makeId, sizeFactor: 1 + Math.max(0, e.liters - 1.6) * 0.08 });
      }
      continue;
    }
    for (const g of GENERATIONS) {
      const m = MODEL_BY_ID.get(g.modelId)!;
      const drum = hasRearDrum(g);
      if (pt.id === 'zapatas-freno' && !drum) continue;
      const size = m.body === 'Pickup' ? 1.22 : m.body === 'SUV' ? 1.12 : 1;
      for (const position of pt.positions ?? [undefined]) {
        if (drum && position === 'Trasero' && (pt.id === 'pastillas-freno' || pt.id === 'disco-freno')) continue;
        groups.push({ pt, fit: `g:${g.id}`, makeId: m.makeId, position, sizeFactor: size });
      }
    }
  }
  return groups;
}

const OWN_OEM_BRANDS = new Set(['mobis', 'acdelco', 'motorcraft', 'mopar']);

function buildInventory(): Product[] {
  const products: Product[] = [];
  const usedPN = new Set<string>();

  const uniquePN = (pattern: string, r: () => number) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const pn = fill(pattern, r);
      const key = normPN(pn);
      if (!usedPN.has(key)) {
        usedPN.add(key);
        return pn;
      }
    }
    const pn = `${fill(pattern, r)}-${Math.floor(r() * 90 + 10)}`;
    usedPN.add(normPN(pn));
    return pn;
  };

  for (const grp of buildGroups()) {
    const { pt } = grp;
    const seed = `${pt.id}|${grp.fit}|${grp.position ?? ''}|${grp.variant ?? ''}`;
    const r = mulberry32(hash(seed));

    // Plan de niveles por grupo: como RockAuto, varias opciones para la misma pieza.
    let plan: Tier[];
    if (pt.basis === 'universal') {
      plan = [];
    } else {
      plan = ['economico', 'diario'];
      if (r() < 0.3) plan.push('diario');
      if (pt.perf && r() < 0.72) plan.push('desempeno');
      if (r() < 0.5) plan.push('oem');
    }

    const offers: { brand: Brand; tier: Tier }[] = [];
    const taken = new Set<string>();
    if (pt.basis === 'universal') {
      for (const b of BRANDS) {
        if (!b.types?.includes(pt.id)) continue;
        const tier = b.tiers.includes('diario') ? 'diario' : b.tiers[0];
        if (r() < 0.8 || b.id === 'lac-value') offers.push({ brand: b, tier });
      }
    } else {
      for (const tier of plan) {
        const cands = BRANDS.filter(
          (b) =>
            !taken.has(b.id) && b.tiers.includes(tier) && brandCovers(b, pt) && (tier !== 'oem' ? true : !!grp.makeId && !!b.oemMakes?.includes(grp.makeId)),
        );
        if (!cands.length) continue;
        // La marca propia aparece seguido en el nivel económico.
        const brand = tier === 'economico' && r() < 0.3 && cands.some((c) => c.id === 'lac-value') ? cands.find((c) => c.id === 'lac-value')! : pick(cands, r);
        taken.add(brand.id);
        offers.push({ brand, tier });
      }
    }
    if (!offers.length) continue;

    const oem: string[] = [];
    if (grp.makeId && pt.basis !== 'universal') {
      oem.push(fill(OEM_PATTERNS[grp.makeId], r));
      if (r() < 0.28) oem.push(fill(OEM_PATTERNS[grp.makeId], r));
    }

    const [lo, hi] = pt.price;
    const base = (lo + (hi - lo) * (0.2 + 0.45 * r())) * grp.sizeFactor;

    for (const { brand, tier } of offers) {
      const t = TIER_BY_ID.get(tier)!;
      let price = roundPrice(base * t.mult * (0.9 + 0.2 * r()), r);
      let listPrice: number | undefined;
      const closeout = r() < 0.045;
      if (closeout) price = roundPrice(price * 0.78, r);
      else if (r() < 0.15) listPrice = roundPrice(price * (1.15 + r() * 0.3), r);

      const partNumber = OWN_OEM_BRANDS.has(brand.id) && oem[0] && !usedPN.has(normPN(oem[0])) ? (usedPN.add(normPN(oem[0])), oem[0]) : uniquePN(brand.pn, r);

      const stock = WAREHOUSES.map(() => (r() < 0.56 ? 1 + Math.floor(r() * r() * 48) : 0));
      const rating = Math.round((3.5 + r() * 1.5 - (tier === 'economico' ? 0.25 : 0)) * 10) / 10;
      const reviews = Math.floor(Math.pow(r(), 2.2) * 900) + (tier === 'diario' ? 12 : 0);

      const specs: [string, string][] = pt.specs.map((s) => [s.k, pick(s.v, r)]);
      if (grp.variant) specs.unshift(['Especificación', grp.variant]);
      if (grp.position) specs.unshift(['Posición', grp.position]);
      specs.push(['Origen de la marca', brand.origin], ['Garantía', t.warranty]);

      const lead = pt.specs[0] ? specs.find(([k]) => k === pt.specs[0].k)?.[1] : undefined;
      const title = `${pt.name}${grp.variant ? ` ${grp.variant}` : ''}${lead ? ` · ${lead}` : ''}`;

      const xref: string[] = [];
      if (r() < 0.6) {
        const [xb, xp] = pick(XREF_BRANDS, r);
        xref.push(`${xb} ${fill(xp, r)}`);
      }

      const pnKey = normPN(partNumber);
      products.push({
        i: products.length,
        id: `${brand.id}-${pnKey.toLowerCase()}`,
        partNumber,
        pnKey,
        brandId: brand.id,
        partTypeId: pt.id,
        catId: pt.cat,
        tier,
        position: grp.position,
        variant: grp.variant || undefined,
        title,
        price,
        listPrice,
        closeout,
        stock,
        rating: Math.min(5, rating),
        reviews,
        fit: grp.fit,
        oem,
        xref,
        specs,
        warranty: t.warranty,
        popularity: Math.round(reviews * (rating / 5) + (stock.some((s) => s > 0) ? 40 : 0) + (tier === 'diario' ? 25 : 0)),
      });
    }
  }
  return products;
}

let cache: Product[] | undefined;
let byId: Map<string, Product> | undefined;

export function getInventory(): Product[] {
  if (!cache) cache = buildInventory();
  return cache;
}

export function productById(id: string): Product | undefined {
  if (!byId) byId = new Map(getInventory().map((p) => [p.id, p]));
  return byId.get(id);
}

export const totalStock = (p: Product) => p.stock.reduce((a, b) => a + b, 0);

export interface FitRow {
  makeId: string;
  modelId: string;
  genCode: string;
  from: number;
  to: number;
  engines: string[];
}

/** Vehículos en los que entra un producto (se deriva de su clave de compatibilidad). */
export function fitmentOf(p: Pick<Product, 'fit'>): FitRow[] {
  if (p.fit === '*') return [];
  const [kind, key] = [p.fit.slice(0, 1), p.fit.slice(2)];
  const gens = kind === 'g' ? [GEN_BY_ID.get(key)!] : (GENS_BY_ENGINE.get(key) ?? []);
  return gens.map((g) => ({
    makeId: MODEL_BY_ID.get(g.modelId)!.makeId,
    modelId: g.modelId,
    genCode: g.code,
    from: g.from,
    to: g.to,
    engines: kind === 'e' ? [key] : g.engines,
  }));
}

export const fits = (p: Pick<Product, 'fit'>, keys: Set<string> | null) => !keys || p.fit === '*' || keys.has(p.fit);
