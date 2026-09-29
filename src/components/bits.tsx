import { Check, Copy, Star } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { TIER_BY_ID, WAREHOUSES } from '../data/catalog';
import type { Product, Tier } from '../data/types';
import { STORE, fmtMoney } from '../config';
import { fold, stem } from '../search/text';

export const TIER_STYLE: Record<Tier, string> = {
  economico: 'border-t-eco/60 text-t-eco',
  diario: 'border-t-daily/60 text-t-daily',
  desempeno: 'border-t-perf/60 text-t-perf',
  oem: 'border-t-oem bg-t-oem text-surface',
};

export const TIER_DOT: Record<Tier, string> = {
  economico: 'bg-t-eco',
  diario: 'bg-t-daily',
  desempeno: 'bg-t-perf',
  oem: 'bg-accent ring-1 ring-t-oem',
};

export function TierBadge({ tier, long = false }: { tier: Tier; long?: boolean }) {
  const t = TIER_BY_ID.get(tier)!;
  return (
    <span className={`label-caps inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-semibold ${TIER_STYLE[tier]}`} title={t.blurb}>
      {long ? t.name : t.short}
    </span>
  );
}

export function Stars({ rating, reviews, compact = false }: { rating: number; reviews?: number; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" aria-label={`${rating} de 5 estrellas`}>
      <span className="relative inline-flex">
        <span className="flex text-line-strong">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={compact ? 11 : 13} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
        <span className="absolute inset-0 flex overflow-hidden text-accent" style={{ width: `${(rating / 5) * 100}%` }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={compact ? 11 : 13} fill="currentColor" strokeWidth={0} className="shrink-0" />
          ))}
        </span>
      </span>
      <span className="tabular">{rating.toFixed(1)}</span>
      {reviews != null && <span className="tabular">({reviews})</span>}
    </span>
  );
}

export function Price({ p, size = 'md' }: { p: Pick<Product, 'price' | 'listPrice' | 'closeout'>; size?: 'sm' | 'md' | 'lg' }) {
  const off = p.listPrice ? Math.round((1 - p.price / p.listPrice) * 100) : 0;
  const cls = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-base' : 'text-2xl';
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`tabular font-display leading-none font-bold tracking-tight ${cls}`}>{fmtMoney(p.price)}</span>
      {p.listPrice && (
        <>
          <span className="tabular text-sm text-muted line-through">{fmtMoney(p.listPrice)}</span>
          <span className="tabular rounded-sm bg-accent px-1 text-[11px] font-bold text-accent-ink">−{off}%</span>
        </>
      )}
      {p.closeout && <span className="label-caps rounded-sm bg-ink px-1.5 py-px text-[10px] font-semibold text-surface">Liquidación</span>}
    </div>
  );
}

export function stockInfo(p: Pick<Product, 'stock'>) {
  const idx = p.stock.findIndex((s) => s > 0);
  const total = p.stock.reduce((a, b) => a + b, 0);
  if (idx < 0) return { ok: false, total: 0, text: 'Bajo pedido · 5–8 días', where: '' };
  const fastest = WAREHOUSES.map((w, i) => ({ w, s: p.stock[i] }))
    .filter((x) => x.s > 0)
    .sort((a, b) => a.w.eta[0] - b.w.eta[0])[0];
  return { ok: true, total, text: `Llega en ${fastest.w.eta[0]}–${fastest.w.eta[1]} días`, where: fastest.w.name };
}

export function StockLine({ p }: { p: Pick<Product, 'stock'> }) {
  const s = stockInfo(p);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${s.ok ? 'text-ok' : 'text-warn'}`}>
      <span className={`size-1.5 rounded-full ${s.ok ? 'bg-ok' : 'bg-warn'}`} />
      {s.ok ? (s.total < 5 ? `Últimas ${s.total} unidades · ` : 'En stock · ') : ''}
      {s.text}
    </span>
  );
}

/** Resalta en el texto las palabras cuyo lema empieza con algún término buscado. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const parts = text.split(/(\s+|·)/);
  return (
    <>
      {parts.map((w, i) => {
        const s = stem(fold(w.replace(/[^\p{L}\p{N}]/gu, '')));
        const hit = s.length > 1 && terms.some((t) => t.length > 1 && (s.startsWith(t) || (t.length > 3 && t.startsWith(s))));
        return hit ? (
          <mark key={i} className="hl">
            {w}
          </mark>
        ) : (
          <span key={i}>{w}</span>
        );
      })}
    </>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-b-2 border-line-strong bg-surface-2 px-1.5 py-px font-mono text-[10px] font-medium text-muted">{children}</kbd>;
}

export function CopyPN({ value, className = '' }: { value: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`pn-tag inline-flex items-center gap-1.5 hover:border-ink ${className}`}
      title="Copiar número de parte"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          })
          .catch(() => undefined);
      }}
    >
      {value}
      {done ? <Check size={12} className="text-ok" /> : <Copy size={11} className="text-muted" />}
    </button>
  );
}

export const freeShippingLeft = (subtotal: number) => Math.max(0, STORE.freeShippingFrom - subtotal);
