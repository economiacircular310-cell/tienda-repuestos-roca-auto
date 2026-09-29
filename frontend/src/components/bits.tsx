import { Check, Copy, ShieldCheck, Star } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Product, TierId } from '../api/types';
import { fmtMoney } from '../config';

export const TIER_STYLE: Record<TierId, string> = {
  economico: 'border-t-eco/60 text-t-eco',
  diario: 'border-t-daily/60 text-t-daily',
  desempeno: 'border-t-perf/60 text-t-perf',
  oem: 'border-t-oem bg-t-oem text-surface',
};

export const TIER_DOT: Record<TierId, string> = {
  economico: 'bg-t-eco',
  diario: 'bg-t-daily',
  desempeno: 'bg-t-perf',
  oem: 'bg-accent ring-1 ring-t-oem',
};

export function TierBadge({ tier, long = false }: { tier: Product['tier']; long?: boolean }) {
  return (
    <span className={`label-caps inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-semibold ${TIER_STYLE[tier.id]}`}>
      {long ? tier.name : tier.short}
    </span>
  );
}

export function BestValue({ className = '' }: { className?: string }) {
  return (
    <span
      className={`label-caps inline-flex items-center gap-1 rounded-sm bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-ink ${className}`}
      title="La mejor combinación de calificación bayesiana, garantía y precio entre las opciones de esta pieza"
    >
      ★ Mejor valor
    </span>
  );
}

export function Stars({ rating, reviews, adjusted, compact = false }: { rating: number; reviews?: number; adjusted?: number; compact?: boolean }) {
  const size = compact ? 11 : 13;
  if (reviews === 0) return <span className="text-xs text-muted">Sin reseñas aún</span>;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted"
      title={adjusted != null ? `Calificación ajustada por número de reseñas (promedio bayesiano): ${adjusted.toFixed(2)}` : undefined}
    >
      <span className="relative inline-flex" aria-label={`${rating} de 5 estrellas`}>
        <span className="flex text-line-strong">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={size} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
        <span className="absolute inset-0 flex overflow-hidden text-accent" style={{ width: `${(rating / 5) * 100}%` }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={size} fill="currentColor" strokeWidth={0} className="shrink-0" />
          ))}
        </span>
      </span>
      <span className="tabular">{rating.toFixed(1)}</span>
      {reviews != null && <span className="tabular">({reviews})</span>}
    </span>
  );
}

export function Price({ p, size = 'md' }: { p: Pick<Product, 'price' | 'list_price' | 'closeout' | 'discount_pct'>; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-base' : 'text-2xl';
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`tabular font-display leading-none font-bold tracking-tight ${cls}`}>{fmtMoney(p.price)}</span>
      {p.list_price && (
        <>
          <span className="tabular text-sm text-muted line-through">{fmtMoney(p.list_price)}</span>
          <span className="tabular rounded-sm bg-accent px-1 text-[11px] font-bold text-accent-ink">−{p.discount_pct}%</span>
        </>
      )}
      {p.closeout && <span className="label-caps rounded-sm bg-ink px-1.5 py-px text-[10px] font-semibold text-surface">Liquidación</span>}
    </div>
  );
}

export function StockLine({ p }: { p: Pick<Product, 'availability'> }) {
  const a = p.availability;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${a.in_stock ? 'text-ok' : 'text-warn'}`}>
      <span className={`size-1.5 rounded-full ${a.in_stock ? 'bg-ok' : 'bg-warn'}`} />
      {a.text}
    </span>
  );
}

/** Resalta los rangos que calculó el servidor (palabras que coinciden con la búsqueda). */
export function Highlight({ text, marks = [] }: { text: string; marks?: [number, number][] }) {
  if (!marks.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let pos = 0;
  marks.forEach(([a, b], i) => {
    if (a > pos) out.push(<span key={`t${i}`}>{text.slice(pos, a)}</span>);
    out.push(
      <mark key={`m${i}`} className="hl">
        {text.slice(a, b)}
      </mark>,
    );
    pos = b;
  });
  if (pos < text.length) out.push(<span key="end">{text.slice(pos)}</span>);
  return <>{out}</>;
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
      title="Copiar"
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

/** Nota de confianza de la marca (A+ … D), calculada en el servidor. */
export function TrustGrade({ brand }: { brand: Product['brand'] }) {
  const tone = brand.trust >= 80 ? 'text-ok border-ok/40' : brand.trust >= 60 ? 'text-ink-2 border-line-strong' : 'text-warn border-warn/40';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[10px] font-semibold ${tone}`}
      title={`Índice de confianza de marca ${brand.trust}/100`}
    >
      <ShieldCheck size={11} /> {brand.grade}
    </span>
  );
}
