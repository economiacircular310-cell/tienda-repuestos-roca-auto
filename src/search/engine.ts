/**
 * Motor de búsqueda del inventario.
 *
 * - Índice invertido BM25 (MiniSearch) con prefijos y tolerancia a errores.
 * - Intérprete de lenguaje natural (vehículo, pieza, posición, precio…) → filtros.
 * - Números de parte, OEM y referencias cruzadas normalizados (exactos y parciales).
 * - Compatibilidad por vehículo (generación/motor) con conteo de lo que se oculta.
 * - Facetas disyuntivas estilo Algolia: cada faceta cuenta ignorando su propia selección.
 *
 * Corre dentro de un Web Worker; si el navegador no lo permite, en el hilo principal.
 */
import MiniSearch from 'minisearch';
import { BRAND_BY_ID, CATEGORY_BY_ID, PART_TYPE_BY_ID, TIERS, XREF_BRANDS } from '../data/catalog';
import { normPN } from '../data/inventory';
import type { Product, VehicleQuery } from '../data/types';
import { ENGINES, GEN_BY_ID, MAKE_BY_ID, MODELS, VEHICLE_CONFIG_COUNT, fitKeysFor } from '../data/vehicles';
import { diagnoseSymptom } from './diagnosis';
import { completionPhrases, parseQuery, type ParsedVehicle, type PNKind } from './parser';
import { STOPWORDS, editDistance, fold, indexTokens, looksLikePN, processTerm, stem, typoBudget, type Tok } from './text';
import type { EngineStats, FacetDim, FacetValue, Hit, SearchRequest, SearchResponse } from './types';

interface Doc {
  i: number;
  t: string;
  b: string;
  s: string;
}

const DIMS: FacetDim[] = ['category', 'partType', 'brand', 'tier', 'position'];
const BIT = { category: 1, partType: 2, brand: 4, tier: 8, position: 16, price: 32, stock: 64, sale: 128 } as const;
const TIER_ORDER = new Map(TIERS.map((t, k) => [t.id, k]));

const SEARCH_OPTS = {
  boost: { t: 3, b: 2.5, s: 1 },
  prefix: (term: string, i: number, terms: string[]) => i === terms.length - 1 && term.length >= 2,
  fuzzy: (term: string) => (term.length >= 5 ? 0.2 : false),
  weights: { fuzzy: 0.45, prefix: 0.6 },
} as const;

export const inStock = (p: Product) => p.stock[0] + p.stock[1] + p.stock[2] > 0;

export class SearchEngine {
  readonly products: Product[];
  readonly buildMs: number;
  private ms: MiniSearch<Doc>;
  private exact = new Map<string, { kind: PNKind; ids: number[] }>();
  private pnKeys: { key: string; i: number }[] = [];
  private vocab = new Map<string, number>();
  private completions: { text: string; f: string; weight: number }[];
  /** Tipos de pieza disponibles por clave de compatibilidad (para depurar el diagnóstico). */
  private typesByFit = new Map<string, Set<string>>();

  constructor(products: Product[]) {
    const t0 = performance.now();
    this.products = products;
    this.ms = new MiniSearch<Doc>({
      idField: 'i',
      fields: ['t', 'b', 's'],
      tokenize: indexTokens,
      processTerm,
      searchOptions: SEARCH_OPTS,
    });
    const docs: Doc[] = products.map((p) => {
      const pt = PART_TYPE_BY_ID.get(p.partTypeId)!;
      return {
        i: p.i,
        t: `${pt.name} ${p.variant ?? ''} ${p.position ?? ''}`,
        b: BRAND_BY_ID.get(p.brandId)!.name,
        s: p.specs.map(([, v]) => v).join(' '),
      };
    });
    this.ms.addAll(docs);

    for (const d of docs) {
      for (const raw of indexTokens(`${d.t} ${d.b} ${d.s}`)) {
        const term = processTerm(raw);
        if (term) this.vocab.set(term, (this.vocab.get(term) ?? 0) + 1);
      }
    }

    const addExact = (key: string, kind: PNKind, i: number) => {
      const cur = this.exact.get(key);
      if (!cur) this.exact.set(key, { kind, ids: [i] });
      else if (cur.kind === kind && !cur.ids.includes(i)) cur.ids.push(i);
    };
    for (const p of products) {
      const set = this.typesByFit.get(p.fit) ?? new Set<string>();
      set.add(p.partTypeId);
      this.typesByFit.set(p.fit, set);
      addExact(p.pnKey, 'pn', p.i);
      this.pnKeys.push({ key: p.pnKey, i: p.i });
    }
    for (const p of products) {
      for (const o of p.oem) {
        addExact(normPN(o), 'oem', p.i);
        this.pnKeys.push({ key: normPN(o), i: p.i });
      }
      for (const x of p.xref) {
        const brand = XREF_BRANDS.find(([b]) => x.startsWith(`${b} `))?.[0] ?? '';
        const key = normPN(x.slice(brand.length));
        addExact(key, 'xref', p.i);
        this.pnKeys.push({ key, i: p.i });
      }
    }

    // Pesos de autocompletado según cuántos productos respalda cada frase.
    const byType = new Map<string, number>();
    const byCat = new Map<string, number>();
    const byBrand = new Map<string, number>();
    const byFit = new Map<string, number>();
    for (const p of products) {
      byType.set(p.partTypeId, (byType.get(p.partTypeId) ?? 0) + 1);
      byCat.set(p.catId, (byCat.get(p.catId) ?? 0) + 1);
      byBrand.set(p.brandId, (byBrand.get(p.brandId) ?? 0) + 1);
      byFit.set(p.fit, (byFit.get(p.fit) ?? 0) + 1);
    }
    const weightOf = (text: string, kind: string) => {
      if (kind === 'partType') return byType.get([...PART_TYPE_BY_ID.values()].find((x) => x.name === text || x.syn.includes(text))?.id ?? '') ?? 1;
      if (kind === 'category') return byCat.get([...CATEGORY_BY_ID.values()].find((c) => c.name === text)?.id ?? '') ?? 1;
      if (kind === 'brand') return byBrand.get([...BRAND_BY_ID.values()].find((b) => b.name === text)?.id ?? '') ?? 1;
      const m = MODELS.find((mm) => `${MAKE_BY_ID.get(mm.makeId)!.name} ${mm.name}` === text);
      if (!m) return 1;
      let n = 0;
      for (const k of fitKeysFor({ modelId: m.id })) n += byFit.get(k) ?? 0;
      return n;
    };
    this.completions = completionPhrases().map((c) => ({ text: c.text, f: fold(c.text), weight: weightOf(c.text, c.kind) }));

    this.buildMs = performance.now() - t0;
  }

  lookupPN = (key: string) => this.exact.get(key) ?? null;

  stats(mode: EngineStats['mode'], medianQueryMs = 0): EngineStats {
    return {
      products: this.products.length,
      brands: BRAND_BY_ID.size,
      vehicles: VEHICLE_CONFIG_COUNT,
      partTypes: PART_TYPE_BY_ID.size,
      buildMs: Math.round(this.buildMs),
      medianQueryMs,
      mode,
    };
  }

  /** Mide la latencia real con consultas típicas (se muestra en la portada). */
  benchmark(): number {
    const qs = [
      'pastillas de freno delanteras corolla 2016',
      'amortiguador hilux',
      'filtro aceite',
      'bujia iridio',
      'kit embrague sentra 2015 menos de 300',
      'bomba de agua g4fc',
      'balatas',
      'radiador civic 2018',
      'faro izquierdo',
      'aceite 5w-30 sintetico',
      'sensor oxigeno',
      'bosch',
    ];
    const times: number[] = [];
    for (let round = 0; round < 2; round++) {
      for (const q of qs) {
        const t = performance.now();
        this.search({ q, pageSize: 24 });
        times.push(performance.now() - t);
      }
    }
    times.sort((a, b) => a - b);
    return Math.round(times[Math.floor(times.length / 2)] * 100) / 100;
  }

  private correct(words: Tok[]): Map<Tok, string> {
    const fixes = new Map<Tok, string>();
    for (const w of words) {
      if (this.vocab.has(w.s)) continue;
      const budget = Math.max(1, typoBudget(w.s.length));
      let best: { term: string; d: number; df: number } | undefined;
      for (const [term, df] of this.vocab) {
        if (Math.abs(term.length - w.s.length) > budget || /\d/.test(term)) continue;
        const d = editDistance(w.s, term, budget);
        if (d <= budget && (!best || d < best.d || (d === best.d && df > best.df))) best = { term, d, df };
      }
      if (best) fixes.set(w, best.term);
    }
    return fixes;
  }

  private fitKeys(v: ParsedVehicle | VehicleQuery): Set<string> {
    const keys = fitKeysFor(v);
    const fuel = (v as ParsedVehicle).fuel;
    if (!fuel) return keys;
    const out = new Set<string>();
    for (const k of keys) {
      if (k.startsWith('e:')) {
        if (ENGINES[k.slice(2)]?.fuel === fuel) out.add(k);
      } else if (GEN_BY_ID.get(k.slice(2))?.engines.some((e) => ENGINES[e].fuel === fuel)) out.add(k);
    }
    return out;
  }

  search(req: SearchRequest): SearchResponse {
    const t0 = performance.now();
    const q = req.q ?? '';
    const parsed = parseQuery(q, this.lookupPN);
    const pageSize = req.pageSize ?? 24;
    const page = req.page ?? 0;

    let scores: Map<number, number> | null = null;
    let highlights: string[] = [];
    let relaxed = false;
    let autoCorrected: string | undefined;
    let pnMatch: SearchResponse['pnMatch'];

    if (parsed.pn) {
      scores = new Map(parsed.pn.ids.map((i) => [i, 1]));
      pnMatch = { kind: parsed.pn.kind, raw: parsed.pn.raw, count: parsed.pn.ids.length };
      highlights.push(parsed.pn.key);
    }

    if (parsed.textTokens.length) {
      const toks = parsed.textTokens.filter((t) => !STOPWORDS.has(t.f));
      const pnToks = toks.filter((t) => !this.vocab.has(t.s) && looksLikePN(normPN(t.raw)));
      let words = toks.filter((t) => !pnToks.includes(t));

      if (pnToks.length) {
        const keys = pnToks.map((t) => normPN(t.raw));
        const m = new Map<number, number>();
        for (const { key, i } of this.pnKeys) {
          if (keys.some((k) => key.includes(k))) m.set(i, Math.max(m.get(i) ?? 0, key.startsWith(keys[0]) ? 1 : 0.7));
        }
        scores = scores ? intersect(scores, m) : m;
        highlights.push(...keys);
      }

      if (words.length) {
        const run = (ws: string[], combineWith: 'AND' | 'OR') => this.ms.search(ws.join(' '), { ...SEARCH_OPTS, combineWith });
        let res = run(
          words.map((w) => w.f),
          'AND',
        );
        if (!res.length) {
          const fixes = this.correct(words);
          if (fixes.size) {
            const fixed = words.map((w) => fixes.get(w) ?? w.f);
            res = run(fixed, 'AND');
            if (res.length) {
              autoCorrected = fixed.join(' ');
              words = words.map((w) => (fixes.has(w) ? { ...w, s: fixes.get(w)! } : w));
            }
          }
        }
        if (!res.length && words.length > 1) {
          res = run(
            words.map((w) => w.f),
            'OR',
          );
          relaxed = res.length > 0;
        }
        const max = res[0]?.score || 1;
        const m = new Map<number, number>();
        const termSet = new Set<string>();
        for (const r of res) {
          m.set(r.id as number, r.score / max);
          for (const term of r.terms) termSet.add(term);
        }
        highlights.push(...termSet);
        scores = scores ? intersect(scores, m) : m;
      }
    }
    for (const id of parsed.partTypes) {
      highlights.push(
        ...PART_TYPE_BY_ID.get(id)!
          .name.split(' ')
          .map((w) => stem(fold(w)))
          .filter((w) => !STOPWORDS.has(w)),
      );
    }
    highlights = [...new Set(highlights)];

    // Vehículo: el de la consulta manda sobre el del garaje.
    const pv = parsed.vehicle;
    const queryVehicle = pv && (pv.makeId || pv.modelId || pv.year || pv.engine || pv.fuel) ? pv : null;
    const vehicle: ParsedVehicle | VehicleQuery | null = queryVehicle ?? req.vehicle ?? null;
    const fitKeys = vehicle && req.fitOnly !== false ? this.fitKeys(vehicle) : null;

    const F = req.filters ?? {};

    // Síntoma → causas probables (bayes) que filtran y ordenan si no se pidió una pieza concreta
    const diagnosis = parsed.symptom ? (diagnoseSymptom(parsed.symptom, vehicle?.year) ?? undefined) : undefined;
    if (diagnosis && fitKeys) {
      // Solo causas con piezas para ese vehículo (un Corolla con discos atrás no tiene zapatas)
      const available = new Set(this.typesByFit.get('*'));
      for (const k of fitKeys) for (const t of this.typesByFit.get(k) ?? []) available.add(t);
      const kept = diagnosis.causes.filter((c) => available.has(c.partTypeId));
      const total = kept.reduce((a, c) => a + c.p, 0) || 1;
      diagnosis.causes = kept.map((c) => ({ ...c, p: c.p / total }));
    }
    const symptomTypes =
      diagnosis && !parsed.partTypes.length && !F.partType?.length
        ? new Map(diagnosis.causes.filter((c) => c.p >= 0.04).map((c) => [c.partTypeId, c.p]))
        : null;
    if (symptomTypes)
      for (const id of symptomTypes.keys())
        highlights.push(
          ...PART_TYPE_BY_ID.get(id)!
            .name.split(' ')
            .map((w) => stem(fold(w)))
            .filter((w) => !STOPWORDS.has(w)),
        );

    const sel: Record<FacetDim, Set<string>> = {
      category: new Set([...(F.category ?? []), ...parsed.categories]),
      partType: new Set([...(F.partType ?? []), ...parsed.partTypes]),
      brand: new Set([...(F.brand ?? []), ...parsed.brands]),
      tier: new Set([...(F.tier ?? []), ...parsed.tiers]),
      position: new Set(F.position ?? []),
    };
    const posWords = parsed.positions.map((w) => w.toLowerCase());
    const priceMin = F.priceMin ?? parsed.priceMin;
    const priceMax = F.priceMax ?? parsed.priceMax;

    const counts: Record<FacetDim, Map<string, number>> = {
      category: new Map(),
      partType: new Map(),
      brand: new Map(),
      tier: new Map(),
      position: new Map(),
    };
    const bump = (dim: FacetDim, v: string | undefined) => {
      if (v) counts[dim].set(v, (counts[dim].get(v) ?? 0) + 1);
    };

    const hits: Hit[] = [];
    let hiddenByFitment = 0;
    let inStockCount = 0;
    let onSaleCount = 0;
    const priceVals: number[] = [];

    const consider = (p: Product, textScore: number) => {
      if (symptomTypes && !symptomTypes.has(p.partTypeId)) return;
      if (posWords.length && !(p.position && posWords.some((w) => p.position!.toLowerCase().includes(w)))) return;
      let mask = 0;
      if (sel.category.size && !sel.category.has(p.catId)) mask |= BIT.category;
      if (sel.partType.size && !sel.partType.has(p.partTypeId)) mask |= BIT.partType;
      if (sel.brand.size && !sel.brand.has(p.brandId)) mask |= BIT.brand;
      if (sel.tier.size && !sel.tier.has(p.tier)) mask |= BIT.tier;
      if (sel.position.size && !(p.position && sel.position.has(p.position))) mask |= BIT.position;
      if ((priceMin != null && p.price < priceMin) || (priceMax != null && p.price > priceMax)) mask |= BIT.price;
      const stocked = inStock(p);
      if (F.inStock && !stocked) mask |= BIT.stock;
      const sale = !!p.listPrice || p.closeout;
      if (F.onSale && !sale) mask |= BIT.sale;

      const fitOk = !fitKeys || p.fit === '*' || fitKeys.has(p.fit);
      if (!fitOk) {
        if (mask === 0) hiddenByFitment++;
        return;
      }

      if (mask === 0) {
        const fitsVehicle = !!fitKeys && p.fit !== '*';
        const score =
          textScore * 10 +
          (symptomTypes?.get(p.partTypeId) ?? 0) * 8 +
          (fitsVehicle ? 0.8 : 0) +
          Math.log1p(p.popularity) * 0.25 +
          (stocked ? 0.4 : 0) -
          (p.fit === '*' && fitKeys ? 0.6 : 0);
        hits.push({ i: p.i, score, fits: fitsVehicle });
        for (const d of DIMS) bump(d, dimValue(p, d));
      } else if ((mask & (mask - 1)) === 0) {
        // falla en una sola dimensión: cuenta para esa faceta (disyuntiva)
        for (const d of DIMS) if (mask === BIT[d]) bump(d, dimValue(p, d));
      }
      if ((mask & ~BIT.price) === 0) priceVals.push(p.price);
      if ((mask & ~BIT.stock) === 0 && stocked) inStockCount++;
      if ((mask & ~BIT.sale) === 0 && sale) onSaleCount++;
    };

    if (scores) for (const [i, s] of scores) consider(this.products[i], s);
    else for (const p of this.products) consider(p, 0);

    const sort = req.sort ?? 'relevancia';
    const P = this.products;
    if (sort === 'precio-asc') hits.sort((a, b) => P[a.i].price - P[b.i].price);
    else if (sort === 'precio-desc') hits.sort((a, b) => P[b.i].price - P[a.i].price);
    else if (sort === 'valoracion') hits.sort((a, b) => P[b.i].rating - P[a.i].rating || P[b.i].reviews - P[a.i].reviews);
    else if (sort === 'nivel') hits.sort((a, b) => TIER_ORDER.get(P[a.i].tier)! - TIER_ORDER.get(P[b.i].tier)! || P[a.i].price - P[b.i].price);
    else hits.sort((a, b) => b.score - a.score);

    const facets = {} as Record<FacetDim, FacetValue[]>;
    for (const d of DIMS) {
      const values = new Set([...counts[d].keys(), ...sel[d]]);
      facets[d] = [...values]
        .map((v) => ({ value: v, label: labelOf(d, v), count: counts[d].get(v) ?? 0, selected: sel[d].has(v) }))
        .sort((a, b) =>
          d === 'tier'
            ? TIER_ORDER.get(a.value as never)! - TIER_ORDER.get(b.value as never)!
            : Number(b.selected) - Number(a.selected) || b.count - a.count || a.label.localeCompare(b.label),
        );
    }

    return {
      q,
      total: hits.length,
      items: hits.slice(page * pageSize, (page + 1) * pageSize),
      facets,
      price: histogram(priceVals),
      inStockCount,
      onSaleCount,
      chips: parsed.chips,
      text: parsed.text,
      corrections: parsed.corrections,
      vehicle: vehicle ? { makeId: vehicle.makeId, modelId: vehicle.modelId, year: vehicle.year, engine: vehicle.engine } : null,
      vehicleSource: queryVehicle ? 'query' : req.vehicle ? 'garage' : null,
      hiddenByFitment,
      autoCorrected,
      relaxed,
      pnMatch,
      diagnosis,
      highlights: [...new Set(highlights)],
      suggestions: this.suggest(q),
      tookMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }

  /** Autocompletado de la última palabra (o dos) de la consulta. */
  suggest(q: string): string[] {
    const trimmed = q.replace(/\s+$/, '');
    if (trimmed.length < 2 || /\s$/.test(q)) return [];
    const words = [...trimmed.matchAll(/\S+/g)];
    const out: { text: string; weight: number }[] = [];
    const seen = new Set<string>();
    for (const n of [2, 1]) {
      if (words.length < n) continue;
      const start = words[words.length - n].index!;
      const tail = fold(trimmed.slice(start));
      if (tail.length < 2) continue;
      for (const c of this.completions) {
        if (c.f === tail || !(c.f.startsWith(tail) || c.f.includes(` ${tail}`))) continue;
        const text = `${trimmed.slice(0, start)}${c.text.toLowerCase()}`;
        if (seen.has(text)) continue;
        seen.add(text);
        out.push({ text, weight: c.weight * (c.f.startsWith(tail) ? 2 : 1) });
      }
      if (out.length) break;
    }
    return out
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((o) => o.text);
  }
}

function intersect(a: Map<number, number>, b: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w != null) out.set(k, v + w);
  }
  return out;
}

function dimValue(p: Product, d: FacetDim): string | undefined {
  switch (d) {
    case 'category':
      return p.catId;
    case 'partType':
      return p.partTypeId;
    case 'brand':
      return p.brandId;
    case 'tier':
      return p.tier;
    case 'position':
      return p.position;
  }
}

function labelOf(d: FacetDim, v: string): string {
  switch (d) {
    case 'category':
      return CATEGORY_BY_ID.get(v)?.name ?? v;
    case 'partType':
      return PART_TYPE_BY_ID.get(v)?.name ?? v;
    case 'brand':
      return BRAND_BY_ID.get(v)?.name ?? v;
    case 'tier':
      return TIERS.find((t) => t.id === v)?.name ?? v;
    default:
      return v;
  }
}

function histogram(values: number[]): SearchResponse['price'] {
  if (!values.length) return { min: 0, max: 0, hist: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const bins = 16;
  const hist = new Array<number>(bins).fill(0);
  const span = max - min || 1;
  for (const v of values) hist[Math.min(bins - 1, Math.floor(((v - min) / span) * bins))]++;
  return { min: Math.floor(min), max: Math.ceil(max), hist };
}
