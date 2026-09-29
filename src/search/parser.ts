/**
 * Intérprete de consultas en lenguaje natural.
 *
 *   "pastillas delanteras corolla 2016 menos de 60"
 *     → tipo: Pastillas de freno · posición: Delantero · vehículo: 2016 Toyota Corolla · precio ≤ 60
 *
 * Reconoce vehículos (marca, modelo, año, motor, cilindrada, combustible), tipos de pieza con
 * sinónimos regionales, categorías, marcas, posición, nivel de calidad, rangos de precio y
 * números de parte/OEM. Tolera errores de tipeo en nombres ("toyta corrola").
 */
import { BRANDS, CATEGORIES, PART_TYPES, TIERS } from '../data/catalog';
import type { Fuel, Tier, VehicleQuery } from '../data/types';
import { ENGINES, MAKES, MAKE_BY_ID, MODELS, MODEL_BY_ID, engineLabel, enginesFor } from '../data/vehicles';
import { findSymptom } from './diagnosis';
import { STOPWORDS, editDistance, fold, tokens, typoBudget, type Tok } from './text';

export type ChipKind = 'vehicle' | 'engine' | 'partType' | 'category' | 'brand' | 'position' | 'tier' | 'price' | 'partNumber' | 'fuel' | 'symptom';

export interface Chip {
  kind: ChipKind;
  label: string;
  /** Rango [inicio, fin) en la consulta original; permite quitar el filtro borrando ese texto. */
  spans: [number, number][];
  corrected?: string;
}

export interface ParsedVehicle extends VehicleQuery {
  fuel?: Fuel;
}

export interface ParsedQuery {
  text: string;
  textTokens: Tok[];
  vehicle?: ParsedVehicle;
  partTypes: string[];
  categories: string[];
  brands: string[];
  positions: string[];
  tiers: Tier[];
  priceMin?: number;
  priceMax?: number;
  pn?: { key: string; raw: string; kind: PNKind; ids: number[] };
  /** Síntoma reconocido ("chilla al frenar") → ver diagnosis.ts */
  symptom?: string;
  chips: Chip[];
  corrections: { from: string; to: string }[];
}

export type PNKind = 'pn' | 'oem' | 'xref';
export type PNLookup = (key: string) => { kind: PNKind; ids: number[] } | null;

type EntryKind = 'model' | 'make' | 'partType' | 'category' | 'brand' | 'position' | 'tier' | 'fuel';
interface Entry {
  kind: EntryKind;
  value: string;
  label: string;
}

const PRIORITY: EntryKind[] = ['model', 'make', 'partType', 'category', 'brand', 'position', 'tier', 'fuel'];

const keyOf = (phrase: string) =>
  tokens(phrase)
    .filter((t) => !STOPWORDS.has(t.f))
    .map((t) => t.s)
    .join(' ');

const CATEGORY_ALIASES: Record<string, string[]> = {
  frenos: ['sistema de frenos'],
  suspension: ['suspension', 'direccion'],
  motor: ['partes de motor'],
  filtros: ['filtros', 'lubricacion', 'mantenimiento', 'afinacion'],
  encendido: ['ignicion'],
  electrico: ['electricidad', 'sistema electrico', 'sensores'],
  enfriamiento: ['refrigeracion', 'sistema de enfriamiento'],
  transmision: ['caja de cambios'],
  escape: ['emisiones'],
  iluminacion: ['luces', 'luz'],
  carroceria: ['exterior', 'visibilidad'],
  climatizacion: ['aire acondicionado', 'clima', 'climatizacion', 'ac'],
  combustible: ['inyeccion', 'alimentacion'],
};

const BRAND_ALIASES: Record<string, string[]> = {
  kn: ['kn', 'k and n'],
  mobil1: ['mobil1', 'mobil'],
  hiq: ['hiq'],
  mann: ['mann', 'mann filter'],
  ebc: ['ebc'],
  spectra: ['spectra'],
  hitachi: ['hitachi'],
  'lac-value': ['lac', 'lenin'],
  'fel-pro': ['felpro'],
  acdelco: ['ac delco'],
};

const POSITION_WORDS: Record<string, string[]> = {
  Delantero: ['delantero', 'delantera', 'adelante', 'frontal', 'front', 'delanteras', 'delanteros'],
  Trasero: ['trasero', 'trasera', 'atras', 'posterior', 'rear', 'traseras', 'traseros'],
  Izquierdo: ['izquierdo', 'izquierda', 'izq', 'piloto', 'conductor', 'lado conductor'],
  Derecho: ['derecho', 'derecha', 'der', 'copiloto', 'acompanante', 'pasajero'],
  Inferior: ['inferior', 'abajo'],
  Superior: ['superior', 'arriba'],
};

const TIER_WORDS: Record<Tier, string[]> = {
  economico: ['economico', 'economica', 'barato', 'barata', 'basico', 'low cost'],
  diario: ['uso diario', 'diario', 'estandar'],
  desempeno: ['alto desempeno', 'desempeno', 'performance', 'deportivo', 'racing', 'premium', 'alto rendimiento', 'pro'],
  oem: ['original', 'oem', 'genuino', 'genuina', 'de agencia', 'agencia', 'equipo original'],
};

const FUEL_WORDS: Record<Fuel, string[]> = {
  Diésel: ['diesel', 'disel', 'petrolero', 'tdi', 'crdi'],
  Gasolina: ['gasolina', 'nafta', 'naftero', 'bencina'],
  Híbrido: ['hibrido', 'hybrid'],
};

interface Dictionary {
  phrases: Map<string, Entry[]>;
  maxLen: number;
  fuzzy: { word: string; entries: Entry[] }[];
  engineFull: Map<string, string>;
  engineWord: Map<string, Set<string>>;
}

let dict: Dictionary | undefined;

function buildDictionary(): Dictionary {
  const phrases = new Map<string, Entry[]>();
  let maxLen = 1;
  const add = (phrase: string, e: Entry) => {
    const k = keyOf(phrase);
    if (!k) return;
    const list = phrases.get(k) ?? [];
    if (!list.some((x) => x.kind === e.kind && x.value === e.value)) list.push(e);
    phrases.set(k, list);
    maxLen = Math.max(maxLen, k.split(' ').length);
  };

  for (const m of MAKES) {
    const e: Entry = { kind: 'make', value: m.id, label: m.name };
    add(m.name, e);
    m.aliases.forEach((a) => add(a, e));
  }
  for (const m of MODELS) {
    const e: Entry = { kind: 'model', value: m.id, label: m.name };
    add(m.name, e);
    m.aliases.forEach((a) => add(a, e));
    add(`${MAKE_BY_ID.get(m.makeId)!.name} ${m.name}`, e);
  }
  for (const pt of PART_TYPES) {
    const e: Entry = { kind: 'partType', value: pt.id, label: pt.name };
    add(pt.name, e);
    pt.syn.forEach((s) => add(s, e));
  }
  for (const c of CATEGORIES) {
    const e: Entry = { kind: 'category', value: c.id, label: c.name };
    add(c.name, e);
    add(c.short, e);
    CATEGORY_ALIASES[c.id]?.forEach((a) => add(a, e));
  }
  for (const b of BRANDS) {
    const e: Entry = { kind: 'brand', value: b.id, label: b.name };
    add(b.name, e);
    add(fold(b.name).replace(/[^a-z0-9]/g, ''), e);
    BRAND_ALIASES[b.id]?.forEach((a) => add(a, e));
  }
  for (const [pos, words] of Object.entries(POSITION_WORDS)) {
    words.forEach((w) => add(w, { kind: 'position', value: pos, label: pos }));
  }
  for (const [tier, words] of Object.entries(TIER_WORDS) as [Tier, string[]][]) {
    const label = TIERS.find((t) => t.id === tier)!.name;
    words.forEach((w) => add(w, { kind: 'tier', value: tier, label }));
  }
  for (const [fuel, words] of Object.entries(FUEL_WORDS) as [Fuel, string[]][]) {
    words.forEach((w) => add(w, { kind: 'fuel', value: fuel, label: fuel }));
  }

  // Palabras sueltas con las que se permite corrección de tipeo.
  const fuzzy: Dictionary['fuzzy'] = [];
  for (const [k, entries] of phrases) {
    if (k.includes(' ') || k.length < 4 || /\d/.test(k)) continue;
    if (entries.some((e) => e.kind === 'model' || e.kind === 'make' || e.kind === 'partType' || e.kind === 'brand' || e.kind === 'category')) {
      fuzzy.push({ word: k, entries });
    }
  }

  const engineFull = new Map<string, string>();
  const engineWord = new Map<string, Set<string>>();
  for (const code of Object.keys(ENGINES)) {
    engineFull.set(fold(code).replace(/[^a-z0-9]/g, ''), code);
    for (const w of fold(code).split(/[^a-z0-9]+/)) {
      if (w.length < 3 || !/[a-z]/.test(w) || STOPWORDS.has(w)) continue;
      const set = engineWord.get(w) ?? new Set<string>();
      set.add(code);
      engineWord.set(w, set);
    }
  }
  return { phrases, maxLen, fuzzy, engineFull, engineWord };
}

function getDict(): Dictionary {
  if (!dict) dict = buildDictionary();
  return dict;
}

const pickEntry = (entries: Entry[]) => [...entries].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];

const YEAR_RE = /^(19[89]\d|20[0-3]\d)$/;
const LITERS_RE = /^\d\.\d$/;
const PRICE_RES: [RegExp, 'range' | 'max' | 'min'][] = [
  [/\bentre\s*\$?\s*(\d+(?:[.,]\d+)?)\s*y\s*\$?\s*(\d+(?:[.,]\d+)?)/g, 'range'],
  [/(?:\bmenos de|\bpor debajo de|\bbajo|\bhasta|\bmaximo|\bmax|<)\s*\$?\s*(\d+(?:[.,]\d+)?)/g, 'max'],
  [/(?:\bmas de|\bdesde|\bminimo|\barriba de|>)\s*\$?\s*(\d+(?:[.,]\d+)?)/g, 'min'],
];
const NOISE = new Set(['l', 'lt', 'lts', 'litro', 'litros', 'cc', 'v', 'motor']);

export function parseQuery(q: string, lookupPN?: PNLookup): ParsedQuery {
  const d = getDict();
  const out: ParsedQuery = {
    text: '',
    textTokens: [],
    partTypes: [],
    categories: [],
    brands: [],
    positions: [],
    tiers: [],
    chips: [],
    corrections: [],
  };
  const f = fold(q);
  const consumed: [number, number][] = [];
  const isConsumed = (t: Tok) => consumed.some(([a, b]) => t.start >= a && t.end <= b);

  // 1) Rangos de precio
  for (const [re, kind] of PRICE_RES) {
    for (const m of f.matchAll(re)) {
      const nums = m
        .slice(1)
        .filter(Boolean)
        .map((n) => parseFloat(n.replace(',', '.')));
      if (nums.some((n) => YEAR_RE.test(String(n)))) continue;
      const span: [number, number] = [m.index!, m.index! + m[0].length];
      if (consumed.some(([a, b]) => span[0] < b && span[1] > a)) continue;
      consumed.push(span);
      if (kind === 'range') [out.priceMin, out.priceMax] = [Math.min(...nums), Math.max(...nums)];
      else if (kind === 'max') out.priceMax = nums[0];
      else out.priceMin = nums[0];
    }
  }
  if (out.priceMin != null || out.priceMax != null) {
    const label =
      out.priceMin != null && out.priceMax != null
        ? `$${out.priceMin}–$${out.priceMax}`
        : out.priceMax != null
          ? `Hasta $${out.priceMax}`
          : `Desde $${out.priceMin}`;
    out.chips.push({ kind: 'price', label, spans: [...consumed] });
  }

  const all = tokens(q).filter((t) => !isConsumed(t));

  // 2) Número de parte exacto (también con espacios: "0 986 494 525")
  if (lookupPN) {
    const whole = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hit = whole.length >= 4 ? lookupPN(whole) : null;
    if (hit && all.length) {
      out.pn = { key: whole, raw: q.trim(), kind: hit.kind, ids: hit.ids };
      out.chips.push({ kind: 'partNumber', label: q.trim().toUpperCase(), spans: [[all[0].start, all[all.length - 1].end]] });
      return out;
    }
    outer: for (let len = Math.min(4, all.length); len >= 1; len--) {
      for (let i = 0; i + len <= all.length; i++) {
        const slice = all.slice(i, i + len);
        const key = slice
          .map((t) => t.raw)
          .join('')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
        if (key.length < 4 || YEAR_RE.test(key)) continue;
        const h = lookupPN(key);
        if (h) {
          const span: [number, number] = [slice[0].start, slice[slice.length - 1].end];
          consumed.push(span);
          out.pn = { key, raw: q.slice(...span), kind: h.kind, ids: h.ids };
          out.chips.push({ kind: 'partNumber', label: q.slice(...span).toUpperCase(), spans: [span] });
          break outer;
        }
      }
    }
  }

  let toks = all.filter((t) => !isConsumed(t));

  // 3) Síntomas ("chilla al frenar", "se calienta") antes que las frases de piezas
  const sym = findSymptom(toks);
  if (sym) {
    const spans = sym.used.map((t) => [t.start, t.end] as [number, number]);
    consumed.push(...spans);
    out.symptom = sym.symptom.id;
    out.chips.push({ kind: 'symptom', label: sym.symptom.label, spans });
    toks = toks.filter((t) => !isConsumed(t));
  }

  const vehicle: ParsedVehicle = {};
  const vehicleSpans: [number, number][] = [];
  let liters: number | undefined;
  const engineCands: { codes: Set<string>; span: [number, number] }[] = [];
  const leftovers: Tok[] = [];

  // 3) Frases del diccionario (coincidencia más larga primero), año, cilindrada, motor
  const content = toks.filter((t) => !STOPWORDS.has(t.f));
  for (let i = 0; i < content.length;) {
    const t = content[i];
    if (YEAR_RE.test(t.f)) {
      vehicle.year = Number(t.f);
      vehicleSpans.push([t.start, t.end]);
      i++;
      continue;
    }
    if (LITERS_RE.test(t.f)) {
      liters = parseFloat(t.f);
      vehicleSpans.push([t.start, t.end]);
      i++;
      continue;
    }
    // "motor 1.8" / "motor 2zr": la palabra motor solo introduce la cilindrada
    const nx = content[i + 1];
    if (t.f === 'motor' && nx && (LITERS_RE.test(nx.f) || d.engineFull.has(nx.f.replace(/[^a-z0-9]/g, '')) || d.engineWord.has(nx.f))) {
      i++;
      continue;
    }
    // motor por código: "2zr-fe", "1gd", "pentastar"
    const two = content[i + 1] ? (t.f + content[i + 1].f).replace(/[^a-z0-9]/g, '') : '';
    const oneKey = t.f.replace(/[^a-z0-9]/g, '');
    const fullCode = (two && d.engineFull.get(two)) || d.engineFull.get(oneKey);
    if (fullCode) {
      const used = d.engineFull.get(two) === fullCode && two ? 2 : 1;
      engineCands.push({ codes: new Set([fullCode]), span: [t.start, content[i + used - 1].end] });
      i += used;
      continue;
    }

    let matched = false;
    for (let len = Math.min(d.maxLen, content.length - i); len >= 1; len--) {
      const slice = content.slice(i, i + len);
      const entries = d.phrases.get(slice.map((x) => x.s).join(' '));
      if (!entries) continue;
      apply(pickEntry(entries), [slice[0].start, slice[slice.length - 1].end]);
      i += len;
      matched = true;
      break;
    }
    if (matched) continue;

    const ew = d.engineWord.get(oneKey);
    if (ew) {
      engineCands.push({ codes: new Set(ew), span: [t.start, t.end] });
      i++;
      continue;
    }

    // Corrección de tipeo sobre palabras conocidas (modelos, marcas, piezas)
    const budget = typoBudget(t.s.length);
    if (budget > 0 && !NOISE.has(t.f)) {
      let best: { word: string; entries: Entry[]; dist: number } | undefined;
      for (const cand of d.fuzzy) {
        // "encendida" no es un error de "encendido": mismo lema, otro género
        if (/[ao]$/.test(t.s) && cand.word.slice(0, -1) === t.s.slice(0, -1)) continue;
        const dist = editDistance(t.s, cand.word, budget);
        if (dist <= budget && (!best || dist < best.dist)) best = { ...cand, dist };
      }
      if (best) {
        const e = pickEntry(best.entries);
        out.corrections.push({ from: t.raw, to: e.label });
        apply(e, [t.start, t.end], e.label);
        i++;
        continue;
      }
    }
    if (!NOISE.has(t.f)) leftovers.push(t);
    i++;
  }

  function apply(e: Entry, span: [number, number], corrected?: string) {
    const chip = (kind: ChipKind, label: string) => out.chips.push({ kind, label, spans: [span], corrected });
    switch (e.kind) {
      case 'model': {
        const m = MODEL_BY_ID.get(e.value)!;
        vehicle.modelId = m.id;
        vehicle.makeId = m.makeId;
        vehicleSpans.push(span);
        break;
      }
      case 'make':
        if (!vehicle.makeId) vehicle.makeId = e.value;
        vehicleSpans.push(span);
        break;
      case 'fuel':
        vehicle.fuel = e.value as Fuel;
        chip('fuel', e.label);
        break;
      case 'partType':
        if (!out.partTypes.includes(e.value)) out.partTypes.push(e.value);
        chip('partType', e.label);
        break;
      case 'category':
        if (!out.categories.includes(e.value)) out.categories.push(e.value);
        chip('category', e.label);
        break;
      case 'brand':
        if (!out.brands.includes(e.value)) out.brands.push(e.value);
        chip('brand', e.label);
        break;
      case 'position':
        if (!out.positions.includes(e.value)) out.positions.push(e.value);
        chip('position', e.label);
        break;
      case 'tier':
        if (!out.tiers.includes(e.value as Tier)) out.tiers.push(e.value as Tier);
        chip('tier', e.label);
        break;
    }
  }

  // 4) Resolver motor con el contexto (modelo, año, cilindrada, combustible)
  const modelEngines = vehicle.modelId
    ? vehicle.year
      ? enginesFor(vehicle.modelId, vehicle.year)
      : [...new Set(MODEL_BY_ID.get(vehicle.modelId)!.gens.flatMap((g) => g.engines))]
    : null;
  let engineSet = null as Set<string> | null;
  for (const c of engineCands) {
    engineSet = engineSet ? new Set([...engineSet].filter((x: string) => c.codes.has(x))) : new Set(c.codes);
    vehicleSpans.push(c.span);
  }
  if (liters != null) {
    const pool = engineSet ? [...engineSet] : (modelEngines ?? []);
    const byL = pool.filter((code) => Math.abs(ENGINES[code].liters - liters!) < 0.05);
    if (byL.length) engineSet = new Set(byL);
  }
  if (engineSet && modelEngines) {
    const inter = [...engineSet].filter((x) => modelEngines.includes(x));
    if (inter.length) engineSet = new Set(inter);
  }
  if (engineSet && engineSet.size === 1) vehicle.engine = [...engineSet][0];
  if (!vehicle.makeId && vehicle.engine) {
    // un código de motor solo ya identifica al fabricante
    const m = MODELS.find((mm) => mm.gens.some((g) => g.engines.includes(vehicle.engine!)));
    if (m) vehicle.makeId = m.makeId;
  }

  if (vehicle.makeId || vehicle.modelId || vehicle.year || vehicle.engine) {
    out.vehicle = vehicle;
    const make = vehicle.makeId ? MAKE_BY_ID.get(vehicle.makeId)!.name : '';
    const model = vehicle.modelId ? MODEL_BY_ID.get(vehicle.modelId)!.name : '';
    const label = [vehicle.year, make, model].filter(Boolean).join(' ') || 'Vehículo';
    out.chips.unshift({ kind: 'vehicle', label, spans: vehicleSpans });
    if (vehicle.engine) {
      out.chips.splice(1, 0, { kind: 'engine', label: engineLabel(vehicle.engine), spans: engineCands.map((c) => c.span) });
    }
  } else if (engineCands.length || liters != null) {
    // cilindrada o motor sin vehículo: vuelve al texto libre
    for (const c of engineCands) leftovers.push(...toks.filter((t) => t.start >= c.span[0] && t.end <= c.span[1]));
  }

  // "frenos pastillas" o "motor … bujías": con un tipo de pieza la categoría sobra (o se contradice)
  if (out.partTypes.length && out.categories.length) {
    out.categories = [];
    out.chips = out.chips.filter((c) => c.kind !== 'category');
  }

  out.textTokens = leftovers.sort((a, b) => a.start - b.start);
  out.text = out.textTokens.map((t) => t.f).join(' ');
  return out;
}

/** Quita de la consulta el texto que originó un filtro (para el botón × de cada chip). */
export function removeSpans(q: string, spans: [number, number][]): string {
  let s = q;
  for (const [a, b] of [...spans].sort((x, y) => y[0] - x[0])) s = s.slice(0, a) + ' '.repeat(b - a) + s.slice(b);
  return s
    .replace(/\s+/g, ' ')
    .replace(/\b(de|para|del|al|el|la)\s*$/i, '')
    .replace(/^(al|el|la|de)\b\s*/i, '')
    .trim();
}

/** Frases para autocompletar: tipos de pieza, categorías, modelos y marcas. */
export function completionPhrases(): { text: string; kind: EntryKind }[] {
  return [
    ...PART_TYPES.map((p) => ({ text: p.name, kind: 'partType' as const })),
    ...PART_TYPES.flatMap((p) =>
      p.syn
        .filter((s) => s.length > 5)
        .slice(0, 2)
        .map((s) => ({ text: s, kind: 'partType' as const })),
    ),
    ...CATEGORIES.map((c) => ({ text: c.name, kind: 'category' as const })),
    ...MODELS.map((m) => ({ text: `${MAKE_BY_ID.get(m.makeId)!.name} ${m.name}`, kind: 'model' as const })),
    ...BRANDS.map((b) => ({ text: b.name, kind: 'brand' as const })),
  ];
}
