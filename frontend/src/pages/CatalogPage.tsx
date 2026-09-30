import { Car, ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useApi } from '../api/client';
import { engineLabel } from '../api/meta';
import type { CatalogTree } from '../api/types';
import { fmtInt } from '../config';
import { href, linkClick } from '../lib/router';
import { saveVehicle, toast } from '../state/app';
import { PartGlyph } from '../components/PartGlyph';
import { ProductRow } from '../components/ProductCard';

const STEPS = 6;
const to = (segs: string[]) => `/catalogo/${segs.map(encodeURIComponent).join('/')}`;

/** Explorador Marca → Año → Modelo → Motor → Sistema → Pieza. El servidor arma cada columna. */
export function CatalogPage({ segs }: { segs: string[] }) {
  const { data } = useApi<CatalogTree>('/api/catalog', { path: segs.join('/') });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `Catálogo${data?.vehicle ? ` · ${data.vehicle.label}` : ''} · Lenin Auto Cars`;
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    el.querySelectorAll<HTMLElement>('[aria-current="true"]').forEach((a) => {
      const list = a.closest('ul');
      if (!list) return;
      const top = a.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + a.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 2;
    });
  }, [data]);

  const cols = data?.columns ?? [];
  const next = cols.find((c) => !c.selected) ?? cols[cols.length - 1];
  const v = data?.vehicle;
  const engine = segs[3] && segs[3] !== 'todos' ? segs[3] : undefined;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
      <p className="label-caps text-[11px] text-muted">Catálogo por vehículo</p>
      <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3rem)] leading-none font-extrabold uppercase">{v ? v.label : 'Elige tu vehículo'}</h1>
      {data?.ready && v && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">{engine ? engineLabel(engine) : 'Todos los motores'}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-ink"
            onClick={() => {
              saveVehicle({ makeId: v.make_id!, year: v.year!, modelId: v.model_id!, engine });
              toast('Listo: toda la tienda se filtra por este vehículo.');
            }}
          >
            <Car size={15} /> Usar en toda la tienda
          </button>
        </div>
      )}

      <div ref={scroller} className="scroll-thin mt-6 hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
        <div className="flex min-w-full">
          {cols.map((c) => (
            <div key={c.key} className="w-56 shrink-0 border-r border-line last:border-r-0">
              <p className="label-caps sticky top-0 border-b border-line bg-surface-2 px-3 py-2 text-[10px] text-muted">{c.title}</p>
              <ul className="scroll-thin h-[420px] overflow-y-auto p-1.5">
                {c.items.map((it) => {
                  const on = c.selected === it.id;
                  const link = to([...c.base, it.id]);
                  return (
                    <li key={it.id}>
                      <a
                        href={href(link)}
                        onClick={linkClick(link)}
                        aria-current={on ? 'true' : undefined}
                        className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[14px] transition ${on ? 'bg-ink text-surface' : 'hover:bg-surface-2'}`}
                      >
                        {it.icon && <PartGlyph cat={it.icon} className={`size-5 shrink-0 ${on ? 'text-accent' : 'text-link'}`} />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{it.label}</span>
                          {it.sub && <span className={`block truncate font-mono text-[11px] ${on ? 'text-surface-a70' : 'text-muted'}`}>{it.sub}</span>}
                        </span>
                        {it.count != null && (
                          <span className={`tabular font-mono text-[11px] ${on ? 'text-surface-a70' : 'text-muted'}`}>{fmtInt(it.count)}</span>
                        )}
                        <ChevronRight size={14} className={on ? 'text-accent' : 'text-line-strong'} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!data?.part_type && next && (
            <div className="bp-paper flex min-w-[240px] flex-1 items-center justify-center p-8 text-center">
              <div>
                <PartGlyph cat={segs[4] ?? 'motor'} className="mx-auto size-24 text-bp-ink" />
                <p className="mt-3 font-display text-2xl font-bold uppercase">
                  Paso {cols.length} de {STEPS}
                </p>
                <p className="text-sm text-bp-dim">Elige {next.title.toLowerCase()} para continuar.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 md:hidden">
        <ol className="mb-3 flex flex-wrap gap-1.5">
          {cols
            .filter((c) => c.selected)
            .map((c) => (
              <li key={c.key}>
                <a
                  href={href(to(c.base))}
                  onClick={linkClick(to(c.base))}
                  className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px]"
                >
                  <span className="text-muted">{c.title}:</span>{' '}
                  <b className="max-w-[9rem] truncate">{c.items.find((i) => i.id === c.selected)?.label ?? c.selected}</b>
                </a>
              </li>
            ))}
        </ol>
        {!data?.part_type && next && (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <p className="label-caps border-b border-line bg-surface-2 px-4 py-2 text-[10px] text-muted">Elige {next.title.toLowerCase()}</p>
            <ul className="divide-y divide-line">
              {next.items.map((it) => (
                <li key={it.id}>
                  <a href={href(to([...next.base, it.id]))} onClick={linkClick(to([...next.base, it.id]))} className="flex items-center gap-3 px-4 py-3">
                    {it.icon && <PartGlyph cat={it.icon} className="size-6 text-link" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{it.label}</span>
                      {it.sub && <span className="block font-mono text-[11px] text-muted">{it.sub}</span>}
                    </span>
                    {it.count != null && <span className="font-mono text-xs text-muted">{fmtInt(it.count)}</span>}
                    <ChevronRight size={16} className="text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {data?.part_type && (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-3xl font-extrabold uppercase">{data.part_type}</h2>
            <p className="tabular text-sm text-muted">
              {fmtInt(data.listing.reduce((n, g) => n + g.items.length, 0))} opciones · {v?.label}
            </p>
          </div>
          <div className="mt-4 space-y-6">
            {data.listing.map((g) => (
              <div key={g.position} className="overflow-hidden rounded-lg border border-line bg-surface">
                <p className="label-caps border-b border-line bg-bp px-4 py-2 text-[11px] text-bp-ink">{g.position}</p>
                {g.items.map((p) => (
                  <ProductRow key={p.id} p={p} fits={!p.universal} vehicleName={v?.label} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
