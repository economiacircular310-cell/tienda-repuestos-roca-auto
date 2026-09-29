import { Check, CircleCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import { BRAND_BY_ID } from '../data/catalog';
import type { Product } from '../data/types';
import { href, linkClick } from '../lib/router';
import { addToCart, toast } from '../state/app';
import { bestValueIds } from '../lib/value';
import { Highlight, Price, Stars, StockLine, TierBadge } from './bits';
import { PartPlate } from './PartGlyph';

function AddButton({ p, wide = false }: { p: Product; wide?: boolean }) {
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(p.id);
        setAdded(true);
        toast(`Agregado: ${BRAND_BY_ID.get(p.brandId)!.name} ${p.partNumber}`);
        setTimeout(() => setAdded(false), 1500);
      }}
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition active:scale-[0.98] ${
        added ? 'bg-ok text-surface' : 'bg-accent text-accent-ink hover:brightness-95'
      } ${wide ? 'w-full' : ''}`}
      aria-label={`Agregar ${p.title} al carrito`}
    >
      {added ? <Check size={16} /> : <Plus size={16} />}
      {added ? 'Agregado' : 'Agregar'}
    </button>
  );
}

export function FitNote({ fits, universal, vehicleName }: { fits: boolean; universal: boolean; vehicleName?: string }) {
  if (fits)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
        <CircleCheck size={13} /> Compatible{vehicleName ? ` con tu ${vehicleName}` : ''}
      </span>
    );
  if (universal) return <span className="text-xs text-muted">Universal · verifica la especificación</span>;
  return null;
}

export function ProductCard({ p, fits, terms = [], vehicleName }: { p: Product; fits: boolean; terms?: string[]; vehicleName?: string }) {
  const brand = BRAND_BY_ID.get(p.brandId)!;
  const to = `/p/${p.id}`;
  return (
    <article className="group relative flex w-full min-w-0 flex-col rounded-lg border border-line bg-surface p-3 transition hover:border-line-strong hover:shadow-card">
      <a href={href(to)} onClick={linkClick(to)} className="absolute inset-0 z-0 rounded-lg" aria-label={`${brand.name} ${p.title}`} />
      <PartPlate cat={p.catId} pt={p.partTypeId} pn={p.partNumber} className="pointer-events-none" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-bold tracking-wide text-ink-2 uppercase">{brand.name}</span>
        <span className="flex shrink-0 items-center gap-1">
          {bestValueIds().has(p.id) && <BestValue />}
          <TierBadge tier={p.tier} />
        </span>
      </div>
      <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[15px] leading-snug font-medium">
        <Highlight text={p.title} terms={terms} />
      </h3>
      <p className="mt-0.5 truncate text-xs text-muted">
        {p.position ?? p.variant ?? p.specs.find(([k]) => k !== 'Posición')?.[1]}
        <span className="font-mono"> · {p.partNumber}</span>
      </p>
      <div className="mt-2 min-h-[1.25rem]">
        <FitNote fits={fits} universal={p.fit === '*'} vehicleName={vehicleName} />
      </div>
      <div className="mt-1">
        <Stars rating={p.rating} reviews={p.reviews} compact />
      </div>
      <div className="mt-auto pt-3">
        <Price p={p} />
        <div className="mt-1.5">
          <StockLine p={p} />
        </div>
        <div className="relative z-10 mt-3">
          <AddButton p={p} wide />
        </div>
      </div>
    </article>
  );
}

/** Fila densa estilo catálogo mayorista (vista lista y explorador). */
export function ProductRow({ p, fits, terms = [], vehicleName }: { p: Product; fits: boolean; terms?: string[]; vehicleName?: string }) {
  const brand = BRAND_BY_ID.get(p.brandId)!;
  const to = `/p/${p.id}`;
  return (
    <article className="relative grid grid-cols-[64px_1fr] items-center gap-x-4 gap-y-2 border-b border-line px-3 py-3 last:border-b-0 hover:bg-surface-2 sm:grid-cols-[72px_minmax(0,1fr)_auto_auto]">
      <a href={href(to)} onClick={linkClick(to)} className="absolute inset-0" aria-label={`${brand.name} ${p.title}`} />
      <PartPlate cat={p.catId} pt={p.partTypeId} size="sm" className="pointer-events-none w-16 sm:w-[72px]" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-[12px] tracking-wide uppercase">{brand.name}</b>
          <span className="pn-tag text-[11px]">{p.partNumber}</span>
          <TierBadge tier={p.tier} />
          {bestValueIds().has(p.id) && <BestValue />}
        </div>
        <p className="mt-1 truncate text-[14px] font-medium">
          <Highlight text={p.title} terms={terms} />
          {p.position && <span className="text-muted"> · {p.position}</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {p.specs
            .filter(([k]) => k !== 'Posición')
            .slice(0, 3)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ')}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3">
          <FitNote fits={fits} universal={p.fit === '*'} vehicleName={vehicleName} />
          <StockLine p={p} />
        </div>
      </div>
      <div className="col-start-2 sm:col-start-auto sm:text-right">
        <Price p={p} size="sm" />
      </div>
      <div className="relative z-10 col-start-2 sm:col-start-auto">
        <AddButton p={p} />
      </div>
    </article>
  );
}

export function BestValue({ className = '' }: { className?: string }) {
  return (
    <span
      className={`label-caps inline-flex items-center gap-1 rounded-sm bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-ink ${className}`}
      title="La mejor combinación de valoración, garantía y precio entre las opciones de esta pieza"
    >
      ★ Mejor valor
    </span>
  );
}

export { AddButton };
