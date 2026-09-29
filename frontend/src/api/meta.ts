/** Datos de referencia (vehículos, taxonomía, marcas) cargados una vez desde /api/meta. */
import { useSyncExternalStore } from 'react';
import { get } from './client';
import type { Meta } from './types';

let meta: Meta | null = null;
let failed = false;
const listeners = new Set<() => void>();

export function loadMeta(): Promise<Meta> {
  return get<Meta>('/api/meta').then(
    (m) => {
      meta = m;
      failed = false;
      listeners.forEach((l) => l());
      return m;
    },
    (e) => {
      failed = true;
      listeners.forEach((l) => l());
      throw e;
    },
  );
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useMeta = () => useSyncExternalStore(subscribe, () => meta);
export const useMetaFailed = () => useSyncExternalStore(subscribe, () => failed);

/** Solo para componentes que se muestran cuando meta ya cargó. */
export function M(): Meta {
  if (!meta) throw new Error('meta sin cargar');
  return meta;
}

export interface VehicleSel {
  makeId?: string;
  modelId?: string;
  year?: number;
  engine?: string;
}

export const makeName = (id?: string | null) => (id ? meta?.makes.find((m) => m.id === id)?.name : undefined);
export const model = (id?: string | null) => (id ? meta?.models.find((m) => m.id === id) : undefined);
export const engineLabel = (code?: string | null, withCode = true) =>
  code ? ((withCode ? meta?.engines[code]?.label : meta?.engines[code]?.short) ?? code) : '';

export function vehicleLabel(v: VehicleSel, engine = true): string {
  const base = [v.year, makeName(v.makeId), model(v.modelId)?.name].filter(Boolean).join(' ');
  return engine && v.engine ? `${base} · ${engineLabel(v.engine, false)}` : base;
}

export const yearsOfMake = (makeId: string) => meta?.makes.find((m) => m.id === makeId)?.years ?? [];
export const modelsOfMakeYear = (makeId: string, year: number) =>
  meta?.models.filter((m) => m.make_id === makeId && m.gens.some((g) => year >= g.start && year <= g.end)) ?? [];

export function enginesFor(modelId: string, year: number): string[] {
  const gens = model(modelId)?.gens.filter((g) => year >= g.start && year <= g.end) ?? [];
  return [...new Set(gens.flatMap((g) => g.engines))];
}

export const genFor = (modelId: string, year: number) => {
  const gens = model(modelId)?.gens.filter((g) => year >= g.start && year <= g.end) ?? [];
  return gens[gens.length - 1];
};

/** Parámetros de vehículo para la API. */
export const vehicleParams = (v?: VehicleSel | null) => (v ? { make: v.makeId, model: v.modelId, year: v.year, engine: v.engine } : {});
