import { Stethoscope } from 'lucide-react';
import { fmtInt } from '../config';
import { href, linkClick, searchUrl } from '../lib/router';
import type { Diagnosis } from '../search/diagnosis';

/** Barras de probabilidad de causa: el resultado del modelo bayesiano, legible. */
export function DiagnosisPanel({ d, vehicleName, compact = false }: { d: Diagnosis; vehicleName?: string; compact?: boolean }) {
  const top = d.causes.slice(0, compact ? 3 : 6);
  return (
    <section className={`overflow-hidden rounded-xl border border-line bg-surface ${compact ? '' : 'shadow-card'}`} aria-label="Diagnóstico">
      <div className="flex items-start gap-3 border-b border-line bg-bp px-4 py-3 text-bp-ink">
        <Stethoscope size={20} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="label-caps text-[10px] text-bp-dim">Diagnóstico orientativo</p>
          <p className="font-display text-xl leading-tight font-bold uppercase">{d.label}</p>
          <p className="mt-0.5 text-[12px] text-bp-dim">
            Causas más probables {vehicleName ? `para tu ${vehicleName}` : ''} con ~{fmtInt(d.km)} km {d.kmEstimated ? 'estimados por su antigüedad' : ''}
          </p>
        </div>
      </div>
      <ol className="divide-y divide-line">
        {top.map((c, i) => {
          const pct = Math.round(c.p * 100);
          const to = searchUrl('', { pt: c.partTypeId });
          return (
            <li key={c.partTypeId}>
              <a
                href={href(to)}
                onClick={linkClick(to)}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_3rem] items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
              >
                <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span className={`block h-full rounded-full ${i === 0 ? 'bg-accent' : 'bg-ink-2'}`} style={{ width: `${pct}%` }} />
                  </span>
                </span>
                <span className="tabular text-right font-display text-xl font-bold">{pct}%</span>
              </a>
            </li>
          );
        })}
      </ol>
      {!compact && (
        <p className="border-t border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          {d.advice} <span className="text-muted">Confirma con un técnico antes de comprar.</span>
        </p>
      )}
    </section>
  );
}
