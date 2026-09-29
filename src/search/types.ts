import type { Tier, VehicleQuery } from '../data/types';
import type { Diagnosis } from './diagnosis';
import type { Chip, PNKind } from './parser';

export type Sort = 'relevancia' | 'precio-asc' | 'precio-desc' | 'valoracion' | 'nivel';
export type FacetDim = 'category' | 'partType' | 'brand' | 'tier' | 'position';

export interface Filters {
  category?: string[];
  partType?: string[];
  brand?: string[];
  tier?: Tier[];
  position?: string[];
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  onSale?: boolean;
}

export interface SearchRequest {
  q: string;
  filters?: Filters;
  /** Vehículo del garaje. Si la consulta menciona otro vehículo, manda la consulta. */
  vehicle?: VehicleQuery | null;
  /** Mostrar solo piezas compatibles con el vehículo (por defecto sí). */
  fitOnly?: boolean;
  sort?: Sort;
  page?: number;
  pageSize?: number;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface Hit {
  i: number;
  score: number;
  /** Compatible confirmado con el vehículo activo (no universal). */
  fits: boolean;
}

export interface SearchResponse {
  q: string;
  total: number;
  items: Hit[];
  facets: Record<FacetDim, FacetValue[]>;
  price: { min: number; max: number; hist: number[] };
  inStockCount: number;
  onSaleCount: number;
  chips: Chip[];
  text: string;
  corrections: { from: string; to: string }[];
  vehicle: VehicleQuery | null;
  vehicleSource: 'query' | 'garage' | null;
  hiddenByFitment: number;
  autoCorrected?: string;
  relaxed?: boolean;
  pnMatch?: { kind: PNKind; raw: string; count: number };
  diagnosis?: Diagnosis;
  highlights: string[];
  suggestions: string[];
  tookMs: number;
}

export interface EngineStats {
  products: number;
  brands: number;
  vehicles: number;
  partTypes: number;
  buildMs: number;
  medianQueryMs: number;
  mode: 'worker' | 'main';
}
