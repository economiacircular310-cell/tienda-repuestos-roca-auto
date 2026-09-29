import { Car, ChevronDown, CircleAlert, LayoutGrid, List, Loader2, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_BY_ID } from '../data/catalog';
import { getInventory } from '../data/inventory';
import type { Tier } from '../data/types';
import { MODEL_BY_ID, engineLabel, vehicleLabel } from '../data/vehicles';
import { fmtInt, fmtMoney } from '../config';
import { navigate, useRoute } from '../lib/router';
import { useStore } from '../lib/store';
import { useSearch } from '../search/client';
import { removeSpans, type Chip } from '../search/parser';
import type { FacetDim, FacetValue, Filters, SearchResponse, Sort } from '../search/types';
import { activeVehicle, garage, pushRecent, saveVehicle, toast, ui } from '../state/app';
import { TIER_DOT } from '../components/bits';
import { ProductCard, ProductRow } from '../components/ProductCard';
import { ChipView } from '../components/SearchPalette';
import { DiagnosisPanel } from '../components/Diagnosis';

const PARAM: Record<FacetDim, string> = { category: 'cat', partType: 'pt', brand: 'brand', tier: 'tier', position: 'pos' };
const DIM_TITLE: Record<FacetDim, string> = { category: 'Categoría', partType: 'Tipo de pieza', brand: 'Marca', tier: 'Nivel', position: 'Posición' };
const SORTS: { id: Sort; label: string }[] = [
  { id: 'relevancia', label: 'Más relevantes' },
  { id: 'precio-asc', label: 'Precio: menor a mayor' },
  { id: 'precio-desc', label: 'Precio: mayor a menor' },
  { id: 'valoracion', label: 'Mejor valorados' },
  { id: 'nivel', label: 'Nivel: económico → original' },
];
const PAGE = 24;

function useParams() {
  const route = useRoute();
  const qp = route.query;
  const list = (k: string) => qp.get(k)?.split(',').filter(Boolean) ?? [];
  const num = (k: string) => (qp.get(k) ? Number(qp.get(k)) : undefined);
  const set = (changes: Record<string, string | null>, opts: { keepPage?: boolean } = {}) => {
    const next = new URLSearchParams(qp);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!opts.keepPage) next.delete('n');
    const s = next.toString();
    navigate(`/buscar${s ? `?${s}` : ''}`, { replace: true });
  };
  return {
    q: qp.get('q') ?? '',
    filters: {
      category: list('cat'),
      partType: list('pt'),
      brand: list('brand'),
      tier: list('tier') as Tier[],
      position: list('pos'),
      priceMin: num('min'),
      priceMax: num('max'),
      inStock: qp.get('stock') === '1',
      onSale: qp.get('sale') === '1',
    } satisfies Filters,
    fitOnly: qp.get('fit') !== '0',
    sort: (qp.get('sort') as Sort) || 'relevancia',
    view: qp.get('view') === 'list' ? 'list' : 'grid',
    pages: Math.max(1, Number(qp.get('n') ?? 1)),
    list,
    set,
  };
}

function FacetGroup({ dim, values, onToggle }: { dim: FacetDim; values: FacetValue[]; onToggle: (v: FacetValue) => void }) {
  const [more, setMore] = useState(false);
  const shown = values.filter((v) => v.count > 0 || v.selected);
  if (!shown.length) return null;
  const limit = 7;
  const visible = more ? shown : shown.slice(0, limit);
  return (
    <details open className="group border-b border-line py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-sm font-semibold">
        {DIM_TITLE[dim]}
        <ChevronDown size={15} className="text-muted transition group-open:rotate-180" />
      </summary>
      <ul className="mt-1 space-y-0.5">
        {visible.map((v) => {
          const id = `f-${dim}-${v.value}`;
          return (
            <li key={v.value}>
              <label
                htmlFor={id}
                className={`flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-[13.5px] hover:bg-surface-2 ${v.count === 0 && !v.selected ? 'opacity-50' : ''}`}
              >
                <input id={id} type="checkbox" checked={v.selected} onChange={() => onToggle(v)} className="size-4 shrink-0 accent-[var(--ink)]" />
                {dim === 'tier' && <span className={`size-2 shrink-0 rounded-full ${TIER_DOT[v.value as Tier]}`} />}
                <span className="min-w-0 flex-1 truncate">{v.label}</span>
                <span className="tabular font-mono text-[11px] text-muted">{fmtInt(v.count)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {shown.length > limit && (
        <button type="button" onClick={() => setMore((m) => !m)} className="mt-1 px-1 text-[13px] font-semibold text-link">
          {more ? 'Mostrar menos' : `Mostrar ${shown.length - limit} más`}
        </button>
      )}
    </details>
  );
}

function PriceFacet({ data, min, max, onApply }: { data: SearchResponse; min?: number; max?: number; onApply: (min?: number, max?: number) => void }) {
  const [lo, setLo] = useState(min != null ? String(min) : '');
  const [hi, setHi] = useState(max != null ? String(max) : '');
  useEffect(() => {
    setLo(min != null ? String(min) : '');
    setHi(max != null ? String(max) : '');
  }, [min, max]);
  const { hist } = data.price;
  const peak = Math.max(1, ...hist);
  if (!hist.length) return null;
  const apply = () => onApply(lo ? Number(lo) : undefined, hi ? Number(hi) : undefined);
  const span = data.price.max - data.price.min || 1;
  return (
    <details open className="group border-b border-line py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-sm font-semibold">
        Precio
        <ChevronDown size={15} className="text-muted transition group-open:rotate-180" />
      </summary>
      <div className="mt-2 flex h-12 items-end gap-[2px]" aria-hidden="true">
        {hist.map((n, i) => {
          const from = data.price.min + (span / hist.length) * i;
          const to = from + span / hist.length;
          const inRange = (min == null || to >= min) && (max == null || from <= max);
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              title={`${fmtMoney(from)} – ${fmtMoney(to)}: ${n}`}
              onClick={() => onApply(Math.floor(from), Math.ceil(to))}
              className={`flex-1 rounded-t-sm transition hover:bg-link ${inRange ? 'bg-ink-2' : 'bg-line'}`}
              style={{ height: `${Math.max(4, (n / peak) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="tabular mt-1 flex justify-between font-mono text-[10px] text-muted">
        <span>{fmtMoney(data.price.min)}</span>
        <span>{fmtMoney(data.price.max)}</span>
      </div>
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label className="sr-only" htmlFor="price-min">
          Precio mínimo
        </label>
        <input
          id="price-min"
          inputMode="decimal"
          value={lo}
          onChange={(e) => setLo(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder="Mín"
          className="tabular h-9 w-full min-w-0 rounded border border-line-strong bg-surface px-2 text-sm"
        />
        <span className="text-muted">–</span>
        <label className="sr-only" htmlFor="price-max">
          Precio máximo
        </label>
        <input
          id="price-max"
          inputMode="decimal"
          value={hi}
          onChange={(e) => setHi(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder="Máx"
          className="tabular h-9 w-full min-w-0 rounded border border-line-strong bg-surface px-2 text-sm"
        />
        <button type="submit" className="h-9 rounded bg-ink px-3 text-sm font-semibold text-surface">
          Ok
        </button>
      </form>
    </details>
  );
}

export function SearchPage() {
  const P = useParams();
  useStore(garage);
  const vehicle = activeVehicle();
  const [showFilters, setShowFilters] = useState(false);
  const [draft, setDraft] = useState(P.q);
  const typingTimer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(P.q);
  }, [P.q]);

  const req = useMemo(
    () => ({ q: P.q, filters: P.filters, vehicle, fitOnly: P.fitOnly, sort: P.sort, pageSize: PAGE * P.pages }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [P.q, JSON.stringify(P.filters), vehicle?.id, P.fitOnly, P.sort, P.pages],
  );
  const { data, loading } = useSearch(req);
  const inv = getInventory();

  const title = P.q
    ? `«${P.q}»`
    : P.filters.category.length === 1
      ? CATEGORY_BY_ID.get(P.filters.category[0])!.name
      : P.filters.onSale
        ? 'Ofertas y liquidación'
        : 'Todo el catálogo';
  useEffect(() => {
    document.title = `${P.q || title} · Lenin Auto Cars`;
  }, [P.q, title]);

  const onType = (v: string) => {
    setDraft(v);
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => P.set({ q: v.trim() ? v : null }), 140);
  };

  const chipFor = (dim: FacetDim, v: FacetValue): Chip | undefined =>
    data?.chips.find(
      (c) =>
        c.label === v.label &&
        ((dim === 'partType' && c.kind === 'partType') ||
          (dim === 'category' && c.kind === 'category') ||
          (dim === 'brand' && c.kind === 'brand') ||
          (dim === 'tier' && c.kind === 'tier')),
    );

  const toggle = (dim: FacetDim) => (v: FacetValue) => {
    const key = PARAM[dim];
    const cur = P.list(key);
    if (v.selected && !cur.includes(v.value)) {
      // Selección que vino de la frase: se quita borrando esas palabras
      const chip = chipFor(dim, v);
      if (chip) P.set({ q: removeSpans(P.q, chip.spans) || null });
      return;
    }
    const next = cur.includes(v.value) ? cur.filter((x) => x !== v.value) : [...cur, v.value];
    P.set({ [key]: next.join(',') || null });
  };

  const urlChips: { label: string; clear: () => void }[] = [];
  if (data) {
    for (const dim of Object.keys(PARAM) as FacetDim[]) {
      for (const val of P.list(PARAM[dim])) {
        const label = data.facets[dim].find((f) => f.value === val)?.label ?? val;
        urlChips.push({ label, clear: () => toggle(dim)({ value: val, label, count: 0, selected: true }) });
      }
    }
  }
  if (P.filters.priceMin != null || P.filters.priceMax != null)
    urlChips.push({
      label: `${P.filters.priceMin != null ? fmtMoney(P.filters.priceMin) : '$0'} – ${P.filters.priceMax != null ? fmtMoney(P.filters.priceMax) : 'máx'}`,
      clear: () => P.set({ min: null, max: null }),
    });
  if (P.filters.inStock) urlChips.push({ label: 'En stock', clear: () => P.set({ stock: null }) });
  if (P.filters.onSale) urlChips.push({ label: 'En oferta', clear: () => P.set({ sale: null }) });

  const vName = data?.vehicle?.modelId ? MODEL_BY_ID.get(data.vehicle.modelId)?.name : undefined;
  const hasMore = data ? data.items.length < data.total : false;

  const facetsPanel = data && (
    <div>
      <div className="border-b border-line py-3">
        <label htmlFor="f-stock" className="flex cursor-pointer items-center gap-2.5 px-1 py-1 text-[13.5px]">
          <input
            id="f-stock"
            type="checkbox"
            checked={P.filters.inStock}
            onChange={(e) => P.set({ stock: e.target.checked ? '1' : null })}
            className="size-4 accent-[var(--ink)]"
          />
          <span className="flex-1">En stock para envío inmediato</span>
          <span className="tabular font-mono text-[11px] text-muted">{fmtInt(data.inStockCount)}</span>
        </label>
        <label htmlFor="f-sale" className="flex cursor-pointer items-center gap-2.5 px-1 py-1 text-[13.5px]">
          <input
            id="f-sale"
            type="checkbox"
            checked={P.filters.onSale}
            onChange={(e) => P.set({ sale: e.target.checked ? '1' : null })}
            className="size-4 accent-[var(--ink)]"
          />
          <span className="flex-1">Ofertas y liquidación</span>
          <span className="tabular font-mono text-[11px] text-muted">{fmtInt(data.onSaleCount)}</span>
        </label>
      </div>
      <FacetGroup dim="category" values={data.facets.category} onToggle={toggle('category')} />
      <FacetGroup dim="partType" values={data.facets.partType} onToggle={toggle('partType')} />
      <FacetGroup dim="tier" values={data.facets.tier} onToggle={toggle('tier')} />
      <PriceFacet
        data={data}
        min={P.filters.priceMin}
        max={P.filters.priceMax}
        onApply={(min, max) => P.set({ min: min != null ? String(min) : null, max: max != null ? String(max) : null })}
      />
      <FacetGroup dim="brand" values={data.facets.brand} onToggle={toggle('brand')} />
      <FacetGroup dim="position" values={data.facets.position} onToggle={toggle('position')} />
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pushRecent(draft);
          P.set({ q: draft.trim() || null });
        }}
        className="flex items-center gap-3 rounded-xl border-2 border-ink bg-surface px-4 focus-within:border-link"
      >
        <Search size={20} className="shrink-0" />
        <label htmlFor="results-q" className="sr-only">
          Buscar
        </label>
        <input
          ref={inputRef}
          id="results-q"
          value={draft}
          onChange={(e) => onType(e.target.value)}
          placeholder="Refina: «delanteras», «bosch», «menos de 80», otro vehículo…"
          className="h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <Loader2 size={18} className="animate-spin text-muted" />}
        <span className="tabular hidden font-mono text-[11px] text-muted sm:block">{data ? `${data.tookMs.toFixed(1)} ms` : ''}</span>
      </form>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(1.9rem,3.6vw,2.8rem)] leading-none font-extrabold break-words uppercase">{title}</h1>
          <p className="tabular mt-1 text-sm text-muted">{data ? `${fmtInt(data.total)} ${data.total === 1 ? 'pieza' : 'piezas'}` : 'Buscando…'}</p>
        </div>
      </div>

      {data && (
        <div className="mt-4 space-y-3">
          {data.vehicle && P.fitOnly ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ok/40 bg-ok-soft px-4 py-3 text-sm">
              <Car size={18} className="text-ok" />
              <span className="min-w-0 flex-1">
                Solo piezas compatibles con <b>{vehicleLabel(data.vehicle, { engine: false }) || 'tu vehículo'}</b>
                {data.vehicle.engine && <span className="text-muted"> · {engineLabel(data.vehicle.engine)}</span>}
                {data.vehicleSource === 'query' && <span className="text-muted"> (de tu búsqueda)</span>}
                {data.hiddenByFitment > 0 && <span className="text-muted"> · {fmtInt(data.hiddenByFitment)} no compatibles ocultas</span>}
              </span>
              {data.vehicleSource === 'query' && data.vehicle.modelId && data.vehicle.year && (
                <button
                  type="button"
                  className="font-semibold text-link"
                  onClick={() => {
                    const v = data.vehicle!;
                    saveVehicle({ makeId: v.makeId!, modelId: v.modelId!, year: v.year!, engine: v.engine });
                    toast('Vehículo guardado en tu garaje');
                  }}
                >
                  Guardar en mi garaje
                </button>
              )}
              {data.vehicleSource === 'garage' && (
                <button type="button" className="font-semibold text-link" onClick={() => ui.set((u) => ({ ...u, garage: true }))}>
                  Cambiar vehículo
                </button>
              )}
              <button type="button" className="font-semibold text-link" onClick={() => P.set({ fit: '0' })}>
                Ver todo el catálogo
              </button>
            </div>
          ) : data.vehicle && !P.fitOnly ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
              <CircleAlert size={17} className="text-warn" />
              <span className="flex-1">Estás viendo todo el catálogo. Las piezas que le quedan a tu {vName ?? 'vehículo'} llevan la marca «Compatible».</span>
              <button type="button" className="font-semibold text-link" onClick={() => P.set({ fit: null })}>
                Solo compatibles
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-3 text-sm">
              <Car size={18} className="text-muted" />
              <span className="flex-1">¿Para qué vehículo? Elígelo y te mostramos solo lo que le queda.</span>
              <button
                type="button"
                className="rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-ink"
                onClick={() => ui.set((u) => ({ ...u, garage: true }))}
              >
                Elegir vehículo
              </button>
            </div>
          )}

          {(data.chips.length > 0 || urlChips.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {data.chips.map((c, k) => (
                <ChipView key={`${c.kind}-${c.label}-${k}`} chip={c} onRemove={() => P.set({ q: removeSpans(P.q, c.spans) || null })} />
              ))}
              {urlChips.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink py-0.5 pr-1 pl-2.5 text-[12px] font-medium text-surface"
                >
                  {c.label}
                  <button type="button" onClick={c.clear} className="rounded-full p-0.5 hover:bg-surface/20" aria-label={`Quitar ${c.label}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {urlChips.length > 0 && (
                <button
                  type="button"
                  className="ml-1 text-[13px] font-semibold text-link"
                  onClick={() => P.set({ cat: null, pt: null, brand: null, tier: null, pos: null, min: null, max: null, stock: null, sale: null })}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {data.pnMatch && (
            <p className="rounded-lg bg-ink px-4 py-3 text-sm text-surface">
              {data.pnMatch.kind === 'oem'
                ? `Número OEM ${data.pnMatch.raw.toUpperCase()}: ${data.pnMatch.count} piezas equivalentes de distintas marcas y niveles.`
                : data.pnMatch.kind === 'xref'
                  ? `Referencia cruzada ${data.pnMatch.raw.toUpperCase()}: estas son las equivalentes que vendemos.`
                  : `Número de parte exacto ${data.pnMatch.raw.toUpperCase()}.`}
            </p>
          )}
          {(data.corrections.length > 0 || data.autoCorrected) && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Sparkles size={14} className="text-warn" />
              {data.autoCorrected
                ? `Mostrando resultados para «${data.autoCorrected}».`
                : `Entendí ${data.corrections.map((c) => `«${c.from}» como ${c.to}`).join(', ')}.`}
            </p>
          )}
          {data.relaxed && <p className="text-sm text-muted">Ninguna pieza tiene todas las palabras; mostramos las que coinciden con alguna.</p>}
          {data.diagnosis && (
            <div className="max-w-3xl">
              <DiagnosisPanel d={data.diagnosis} vehicleName={data.vehicle ? vehicleLabel(data.vehicle, { engine: false }) : undefined} />
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Filtros">
          <div className="scroll-thin sticky top-40 max-h-[calc(100vh-11rem)] overflow-y-auto pr-2">{facetsPanel}</div>
        </aside>

        <section aria-label="Resultados" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(true)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold lg:hidden"
            >
              <SlidersHorizontal size={15} /> Filtros
            </button>
            <label htmlFor="sort-select" className="ml-auto text-sm text-muted">
              Ordenar
            </label>
            <select
              id="sort-select"
              value={P.sort}
              onChange={(e) => P.set({ sort: e.target.value === 'relevancia' ? null : e.target.value })}
              className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Vista">
              <button
                type="button"
                onClick={() => P.set({ view: null }, { keepPage: true })}
                className={`rounded p-1.5 ${P.view === 'grid' ? 'bg-ink text-surface' : 'text-muted'}`}
                aria-label="Cuadrícula"
                aria-pressed={P.view === 'grid'}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => P.set({ view: 'list' }, { keepPage: true })}
                className={`rounded p-1.5 ${P.view === 'list' ? 'bg-ink text-surface' : 'text-muted'}`}
                aria-label="Lista"
                aria-pressed={P.view === 'list'}
              >
                <List size={16} />
              </button>
            </div>
          </div>

          {data && data.total === 0 && (
            <div className="rounded-xl border border-line bg-surface px-6 py-14 text-center">
              <p className="font-display text-3xl font-extrabold uppercase">No encontramos esa pieza</p>
              <p className="mx-auto mt-2 max-w-md text-muted">
                {data.hiddenByFitment > 0
                  ? `Hay ${fmtInt(data.hiddenByFitment)} piezas que coinciden pero no son para ${vehicleLabel(data.vehicle ?? {}, { engine: false }) || 'este vehículo'}.`
                  : 'Revisa la ortografía, prueba un sinónimo o busca por número OEM. También puedes quitar algún filtro.'}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {data.hiddenByFitment > 0 && (
                  <button type="button" className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink" onClick={() => P.set({ fit: '0' })}>
                    Ver las {fmtInt(data.hiddenByFitment)} piezas
                  </button>
                )}
                {urlChips.length > 0 && (
                  <button
                    type="button"
                    className="rounded-md border border-line-strong px-4 py-2 font-semibold"
                    onClick={() => P.set({ cat: null, pt: null, brand: null, tier: null, pos: null, min: null, max: null, stock: null, sale: null })}
                  >
                    Quitar filtros
                  </button>
                )}
              </div>
            </div>
          )}

          {data && data.total > 0 && (
            <>
              {P.view === 'list' ? (
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  {data.items.map((h) => (
                    <ProductRow key={h.i} p={inv[h.i]} fits={h.fits} terms={data.highlights} vehicleName={vName} />
                  ))}
                </div>
              ) : (
                <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {data.items.map((h) => (
                    <li key={h.i} className="flex">
                      <ProductCard p={inv[h.i]} fits={h.fits} terms={data.highlights} vehicleName={vName} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-8 flex flex-col items-center gap-2">
                <p className="tabular text-sm text-muted">
                  Mostrando {fmtInt(data.items.length)} de {fmtInt(data.total)}
                </p>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => P.set({ n: String(P.pages + 1) }, { keepPage: true })}
                    className="h-11 rounded-md border-2 border-ink px-6 font-semibold hover:bg-ink hover:text-surface"
                  >
                    Cargar {Math.min(PAGE, data.total - data.items.length)} más
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {showFilters && (
        <div className="fixed inset-0 z-[65] lg:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
          <button type="button" className="absolute inset-0 bg-bp/60" onClick={() => setShowFilters(false)} aria-label="Cerrar filtros" tabIndex={-1} />
          <div className="anim-slide absolute top-0 right-0 flex h-full w-[88%] max-w-sm flex-col bg-surface pt-[env(safe-area-inset-top,0px)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-display text-2xl font-bold uppercase">Filtros</p>
              <button type="button" onClick={() => setShowFilters(false)} className="rounded p-1.5 hover:bg-surface-2" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4">{facetsPanel}</div>
            <div className="border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
              <button type="button" onClick={() => setShowFilters(false)} className="h-12 w-full rounded-md bg-accent font-semibold text-accent-ink">
                Ver {data ? fmtInt(data.total) : ''} piezas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
