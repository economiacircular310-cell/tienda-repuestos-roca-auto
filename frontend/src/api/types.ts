/** Espejo de backend/lenin_auto/schemas.py (contrato de la API). */

export type TierId = 'economico' | 'diario' | 'desempeno' | 'oem';
export type Pack = 'eco' | 'rec' | 'pro';
export type Sort = 'relevancia' | 'precio-asc' | 'precio-desc' | 'valoracion' | 'nivel';

export interface Ref {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  part_number: string;
  title: string;
  brand: Ref & { origin: string; trust: number; grade: string };
  part_type: Ref;
  category: Ref;
  tier: Ref & { id: TierId; short: string };
  position: string | null;
  variant: string | null;
  price: number;
  list_price: number | null;
  discount_pct: number;
  closeout: boolean;
  stock: number[];
  availability: { in_stock: boolean; total: number; low: boolean; text: string; warehouse: string | null; eta: [number, number] | null };
  rating: number;
  reviews: number;
  rating_adjusted: number;
  satisfaction: number;
  fit: string;
  oem: string[];
  xref: string[];
  specs: [string, string][];
  warranty: string;
  best_value: boolean;
  fair_price: { percentile: number; label: string; median: number };
}

export interface Hit {
  product: Product;
  fits: boolean;
  marks: [number, number][];
}

export interface Chip {
  kind: 'vehicle' | 'engine' | 'fuel' | 'partType' | 'category' | 'brand' | 'position' | 'tier' | 'price' | 'partNumber' | 'symptom';
  label: string;
  without: string;
  corrected: boolean;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface VehicleOut {
  make_id: string | null;
  model_id: string | null;
  year: number | null;
  engine: string | null;
  fuel: string | null;
  label: string;
}

export interface Diagnosis {
  label: string;
  advice: string;
  km: number;
  km_estimated: boolean;
  symptoms: Ref[];
  causes: { part_type_id: string; name: string; p: number; wear: number }[];
}

export type FacetDim = 'category' | 'partType' | 'brand' | 'tier' | 'position';

export interface SearchResult {
  q: string;
  total: number;
  items: Hit[];
  facets: Record<FacetDim, FacetValue[]>;
  price: { min: number; max: number; hist: number[] };
  in_stock_count: number;
  on_sale_count: number;
  chips: Chip[];
  text: string;
  corrections: { written: string; understood: string; channel: string }[];
  vehicle: VehicleOut | null;
  vehicle_source: 'query' | 'garage' | null;
  hidden_by_fitment: number;
  relaxed: boolean;
  pn_match: { kind: 'pn' | 'oem' | 'xref'; raw: string; count: number } | null;
  diagnosis: Diagnosis | null;
  suggestions: string[];
  took_ms: number;
}

export interface ProductDetail {
  product: Product;
  fitment: { status: 'confirmada' | 'condicional' | 'universal' | 'no' | 'sin-vehiculo'; confidence: number; reason: string };
  vehicles: { make_id: string; make: string; model_id: string; model: string; generation: string; years: [number, number]; engines: string[] }[];
  alternatives: Product[];
  related: Product[];
  brand_trust: { score: number; grade: string; rating: number; reviews: number; references: number; in_stock_pct: number; oem_supplier: boolean };
  certificate: { code: string; token: string; vehicle: string; issued: string } | null;
}

export interface Verify {
  valid: boolean;
  code: string | null;
  product: Product | null;
  vehicle: string | null;
  issued: string | null;
}

export interface ShipItem {
  id: string;
  part_number: string;
  qty: number;
}

export interface Cart {
  lines: { product: Product; qty: number; total: number }[];
  missing: string[];
  subtotal: number;
  shipping: number;
  total: number;
  free_shipping_left: number;
  shipments: { warehouse: Ref; eta: [number, number]; items: ShipItem[] }[];
  backorder: ShipItem[];
  eta: [number, number] | null;
}

export interface ServicePlan {
  km: number;
  vehicle: string;
  engine: string | null;
  lines: {
    part_type_id: string;
    name: string;
    every: number;
    why: string;
    priority: number;
    position: string | null;
    qty: number;
    picks: Record<Pack, Product>;
    cost: Record<Pack, number>;
  }[];
  totals: Record<Pack, number>;
  milestones: { km: number; tasks: string[] }[];
  budget: { pack: Pack; budget: number; now: string[]; later: string[]; total: number; priority_kept: number; priority_total: number } | null;
}

export interface Vin {
  vin: string;
  valid: boolean;
  error: string | null;
  make_id: string | null;
  make: string | null;
  region: string | null;
  year: number | null;
  check_ok: boolean | null;
  model_id: string | null;
  model: string | null;
  engine: string | null;
  online: string | null;
}

export interface Column {
  key: string;
  title: string;
  base: string[];
  selected: string | null;
  items: { id: string; label: string; sub: string | null; count: number | null; icon: string | null }[];
}

export interface CatalogTree {
  vehicle: VehicleOut | null;
  ready: boolean;
  columns: Column[];
  part_type: string | null;
  listing: { position: string; items: Product[] }[];
}

export interface Stats {
  products: number;
  brands: number;
  vehicles: number;
  part_types: number;
  build_ms: number;
  median_query_ms: number;
}

export interface Home {
  stats: Stats;
  category_counts: Record<string, number>;
  deals: Product[];
  deals_total: number;
  tier_showcase_title: string;
  tier_showcase: Record<TierId, Product | null>;
  part_number_samples: { label: string; value: string; note: string }[];
  service: ServicePlan | null;
}

export interface Meta {
  store: { name: string; currency: string; locale: string; free_shipping_from: number; shipping_flat: number; email: string; whatsapp: string };
  makes: { id: string; name: string; years: number[] }[];
  models: { id: string; make_id: string; name: string; body: string; gens: { code: string; start: number; end: number; engines: string[] }[] }[];
  engines: Record<string, { label: string; short: string; fuel: string; cyl: number }>;
  categories: { id: string; name: string; short: string; blurb: string }[];
  part_types: { id: string; name: string; cat: string; syn: string[] }[];
  tiers: { id: TierId; name: string; short: string; blurb: string; warranty: string }[];
  brands: { id: string; name: string; origin: string; trust: number; grade: string }[];
  warehouses: { id: string; name: string; eta: [number, number] }[];
  symptoms: { id: string; label: string; example: string }[];
  sample_vins: { label: string; vin: string }[];
  stats: Stats;
}

export interface OrderLine {
  product_id: string;
  part_number: string;
  title: string;
  brand: string;
  qty: number;
  unit_price: number;
  total: number;
  fitment: string;
  certificate: { code: string; token: string; vehicle: string; issued: string } | null;
}

export type OrderStatus = 'recibido' | 'preparando' | 'enviado' | 'entregado' | 'cancelado';

export interface Order {
  code: string;
  status: OrderStatus;
  created_at: string;
  customer_name: string;
  vehicle: string | null;
  lines: OrderLine[];
  subtotal: number;
  shipping: number;
  total: number;
  shipments: Cart['shipments'];
  delivery: [string, string] | null;
  events: { at: string; status: OrderStatus; note: string }[];
}
