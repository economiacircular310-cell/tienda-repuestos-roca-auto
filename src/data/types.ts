export type Tier = 'economico' | 'diario' | 'desempeno' | 'oem';
export type Fuel = 'Gasolina' | 'Diésel' | 'Híbrido';
export type Body = 'Sedán' | 'Hatchback' | 'SUV' | 'Pickup';
export type FitBasis = 'engine' | 'platform' | 'universal';

export interface Make {
  id: string;
  name: string;
  aliases: string[];
}

export interface Engine {
  code: string;
  liters: number;
  cyl: number;
  layout: 'I' | 'V';
  fuel: Fuel;
  turbo: boolean;
}

export interface Generation {
  id: string;
  code: string;
  modelId: string;
  from: number;
  to: number;
  engines: string[];
}

export interface Model {
  id: string;
  makeId: string;
  name: string;
  aliases: string[];
  body: Body;
  gens: Generation[];
}

/** Selección de vehículo, completa o parcial (del garaje o interpretada de la búsqueda). */
export interface VehicleQuery {
  makeId?: string;
  modelId?: string;
  year?: number;
  engine?: string;
}

export interface Category {
  id: string;
  name: string;
  short: string;
  blurb: string;
}

export interface SpecDef {
  k: string;
  v: string[];
}

export interface PartType {
  id: string;
  name: string;
  cat: string;
  syn: string[];
  basis: FitBasis;
  price: [number, number];
  positions?: string[];
  specs: SpecDef[];
  perf?: boolean;
  related?: string[];
  /** Variantes para piezas universales (viscosidad, tipo de foco, etc.). */
  variants?: string[];
}

export interface Brand {
  id: string;
  name: string;
  origin: string;
  tiers: Tier[];
  cats?: string[];
  types?: string[];
  oemMakes?: string[];
  pn: string;
}

export interface Warehouse {
  id: string;
  name: string;
  eta: [number, number];
}

export interface Product {
  /** Índice en el arreglo de inventario (estable entre hilo principal y worker). */
  i: number;
  id: string;
  partNumber: string;
  pnKey: string;
  brandId: string;
  partTypeId: string;
  catId: string;
  tier: Tier;
  position?: string;
  variant?: string;
  title: string;
  price: number;
  listPrice?: number;
  closeout: boolean;
  stock: number[];
  rating: number;
  reviews: number;
  /** 'g:<generación>', 'e:<código de motor>' o '*' (universal). */
  fit: string;
  oem: string[];
  xref: string[];
  specs: [string, string][];
  warranty: string;
  popularity: number;
}
