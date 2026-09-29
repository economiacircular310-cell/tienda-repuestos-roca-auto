import { Check, CircleCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '../api/types';
import { href, linkClick } from '../lib/router';
import { addToCart, toast } from '../state/app';
import { BestValue, Highlight, Price, Stars, StockLine, TierBadge } from './bits';
import { PartPlate } from './PartGlyph';

export function AddButton({ p, wide = false }: { p: Product; wide?: boolean }) {
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(p.id);
        setAdded(true);
        toast(`Agregado: ${p.brand.name} ${p.part_number}`);
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

export function ProductCard({ p, fits, marks, vehicleName }: { p: Product; fits: boolean; marks?: [number, number][]; vehicleName?: string }) {
  const to = `/p/${p.id}`;
  return (
    <article className="group relative flex w-full min-w-0 flex-col rounded-lg border border-line bg-surface p-3 transition hover:border-line-strong hover:shadow-card">
      <a href={href(to)} onClick={linkClick(to)} className="absolute inset-0 z-0 rounded-lg" aria-label={`${p.brand.name} ${p.title}`} />
      <PartPlate cat={p.category.id} pt={p.part_type.id} pn={p.part_number} className="pointer-events-none" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-bold tracking-wide text-ink-2 uppercase">{p.brand.name}</span>
        <span className="flex shrink-0 items-center gap-1">
          {p.best_value && <BestValue />}
          <TierBadge tier={p.tier} />
        </span>
      </div>
      <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[15px] leading-snug font-medium">
        <Highlight text={p.title} marks={marks} />
      </h3>
      <p className="mt-0.5 truncate text-xs text-muted">
        {p.position ?? p.variant ?? p.specs.find(([k]) => k !== 'Posición')?.[1]}
        <span className="font-mono"> · {p.part_number}</span>
      </p>
      <div className="mt-2 min-h-[1.25rem]">
        <FitNote fits={fits} universal={p.universal} vehicleName={vehicleName} />
      </div>
      <div className="mt-1">
        <Stars rating={p.rating} reviews={p.reviews} adjusted={p.rating_adjusted} compact />
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

export function ProductRow({ p, fits, marks, vehicleName }: { p: Product; fits: boolean; marks?: [number, number][]; vehicleName?: string }) {
  const to = `/p/${p.id}`;
  return (
    <article className="relative grid grid-cols-[64px_1fr] items-center gap-x-4 gap-y-2 border-b border-line px-3 py-3 last:border-b-0 hover:bg-surface-2 sm:grid-cols-[72px_minmax(0,1fr)_auto_auto]">
      <a href={href(to)} onClick={linkClick(to)} className="absolute inset-0" aria-label={`${p.brand.name} ${p.title}`} />
      <PartPlate cat={p.category.id} pt={p.part_type.id} size="sm" className="pointer-events-none w-16 sm:w-[72px]" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-[12px] tracking-wide uppercase">{p.brand.name}</b>
          <span className="pn-tag text-[11px]">{p.part_number}</span>
          <TierBadge tier={p.tier} />
          {p.best_value && <BestValue />}
        </div>
        <p className="mt-1 truncate text-[14px] font-medium">
          <Highlight text={p.title} marks={marks} />
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
          <FitNote fits={fits} universal={p.universal} vehicleName={vehicleName} />
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
