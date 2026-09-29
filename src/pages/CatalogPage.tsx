import { Car, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { CATEGORY_BY_ID, PART_TYPE_BY_ID } from '../data/catalog';
import { getInventory } from '../data/inventory';
import type { Product, VehicleQuery } from '../data/types';
import { MAKES, MAKE_BY_ID, MODEL_BY_ID, engineLabel, enginesFor, genFor, modelsOfMakeYear, vehicleLabel, yearsOfMake } from '../data/vehicles';
import { fmtInt } from '../config';
import { href, linkClick } from '../lib/router';
import { useSearch } from '../search/client';
import { saveVehicle, toast } from '../state/app';
import { PartGlyph } from '../components/PartGlyph';
import { ProductRow } from '../components/ProductCard';

const ALL = 'todos';

interface Col {
  key: string;
  title: string;
  items: { id: string; label: string; sub?: string; count?: number; icon?: string }[];
  selected?: string;
  base: string[];
}

export function CatalogPage({ segs }: { segs: string[] }) {
  const [makeId, yearS, modelId, engineS, catId, ptId] = segs;
  const year = yearS ? Number(yearS) : undefined;
  const engine = engineS && engineS !== ALL ? engineS : undefined;
  const vehicle: VehicleQuery | null = makeId && year && modelId ? { makeId, year, modelId, engine } : null;
  const vehicleReady = !!(vehicle && engineS);

  const { data: catData } = useSearch(vehicleReady ? { q: '', vehicle, pageSize: 0 } : null);
  const { data: ptData } = useSearch(vehicleReady && catId ? { q: '', vehicle, filters: { category: [catId] }, pageSize: 0 } : null);
  const { data: list } = useSearch(vehicleReady && ptId ? { q: '', vehicle, filters: { partType: [ptId] }, sort: 'nivel', pageSize: 300 } : null);

  useEffect(() => {
    document.title = `Catálogo${vehicle ? ` · ${vehicleLabel(vehicle)}` : ''} · Lenin Auto Cars`;
  }, [vehicle?.makeId, vehicle?.year, vehicle?.modelId, vehicle?.engine]);

  const cols: Col[] = useMemo(() => {
    const out: Col[] = [{ key: 'make', title: 'Marca', base: [], selected: makeId, items: MAKES.map((m) => ({ id: m.id, label: m.name })) }];
    if (makeId)
      out.push({ key: 'year', title: 'Año', base: [makeId], selected: yearS, items: yearsOfMake(makeId).map((y) => ({ id: String(y), label: String(y) })) });
    if (makeId && year)
      out.push({
        key: 'model',
        title: 'Modelo',
        base: [makeId, String(year)],
        selected: modelId,
        items: modelsOfMakeYear(makeId, year).map((m) => ({ id: m.id, label: m.name, sub: `${m.body} · ${genFor(m.id, year)?.code ?? ''}` })),
      });
    if (makeId && year && modelId) {
      const engs = enginesFor(modelId, year);
      out.push({
        key: 'engine',
        title: 'Motor',
        base: [makeId, String(year), modelId],
        selected: engineS,
        items: [...engs.map((e) => ({ id: e, label: engineLabel(e, false), sub: e })), ...(engs.length > 1 ? [{ id: ALL, label: 'Todos los motores' }] : [])],
      });
    }
    if (vehicleReady)
      out.push({
        key: 'cat',
        title: 'Sistema',
        base: [makeId, String(year), modelId, engineS],
        selected: catId,
        items: (catData?.facets.category ?? [])
          .filter((f) => f.count > 0)
          .map((f) => ({ id: f.value, label: CATEGORY_BY_ID.get(f.value)!.name, count: f.count, icon: f.value })),
      });
    if (vehicleReady && catId)
      out.push({
        key: 'pt',
        title: 'Pieza',
        base: [makeId, String(year), modelId, engineS, catId],
        selected: ptId,
        items: (ptData?.facets.partType ?? [])
          .filter((f) => f.count > 0 && PART_TYPE_BY_ID.get(f.value)?.cat === catId)
          .map((f) => ({ id: f.value, label: f.label, count: f.count })),
      });
    return out;
  }, [makeId, yearS, year, modelId, engineS, vehicleReady, catId, ptId, catData, ptData]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    // Cada columna muestra su elemento elegido aunque la lista sea larga
    el.querySelectorAll<HTMLElement>('[aria-current="true"]').forEach((a) => {
      const list = a.closest('ul');
      if (!list) return;
      const top = a.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + a.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 2;
    });
  }, [cols.length, segs.join('/')]);

  const inv = getInventory();
  const groups = useMemo(() => {
    if (!list) return [];
    const map = new Map<string, Product[]>();
    for (const h of list.items) {
      const p = inv[h.i];
      const k = p.position ?? p.variant ?? 'Todas';
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return [...map.entries()];
  }, [list, inv]);

  const nextCol = cols.find((c) => !c.selected) ?? cols[cols.length - 1];
  const crumbs = cols.filter((c) => c.selected);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
      <p className="label-caps text-[11px] text-muted">Catálogo por vehículo</p>
      <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3rem)] leading-none font-extrabold uppercase">
        {vehicle ? vehicleLabel(vehicle, { engine: false }) : 'Elige tu vehículo'}
      </h1>
      {vehicleReady && vehicle && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">{engine ? engineLabel(engine) : 'Todos los motores'}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-ink"
            onClick={() => {
              saveVehicle({ makeId: vehicle.makeId!, year: vehicle.year!, modelId: vehicle.modelId!, engine });
              toast('Listo: toda la tienda se filtra por este vehículo.');
            }}
          >
            <Car size={15} /> Usar en toda la tienda
          </button>
        </div>
      )}

      {/* Escritorio: columnas tipo Finder */}
      <div ref={scroller} className="scroll-thin mt-6 hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
        <div className="flex min-w-full">
          {cols.map((c) => (
            <div key={c.key} className="w-56 shrink-0 border-r border-line last:border-r-0">
              <p className="label-caps sticky top-0 border-b border-line bg-surface-2 px-3 py-2 text-[10px] text-muted">{c.title}</p>
              <ul className="scroll-thin h-[420px] overflow-y-auto p-1.5">
                {c.items.length === 0 && <li className="px-2 py-2 text-sm text-muted">Cargando…</li>}
                {c.items.map((it) => {
                  const to = `/catalogo/${[...c.base, it.id].map(encodeURIComponent).join('/')}`;
                  const on = c.selected === it.id;
                  return (
                    <li key={it.id}>
                      <a
                        href={href(to)}
                        onClick={linkClick(to)}
                        className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[14px] transition ${on ? 'bg-ink text-surface' : 'hover:bg-surface-2'}`}
                        aria-current={on ? 'true' : undefined}
                      >
                        {it.icon && <PartGlyph cat={it.icon} className={`size-5 shrink-0 ${on ? 'text-accent' : 'text-link'}`} />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{it.label}</span>
                          {it.sub && <span className={`block truncate font-mono text-[11px] ${on ? 'text-surface/70' : 'text-muted'}`}>{it.sub}</span>}
                        </span>
                        {it.count != null && (
                          <span className={`tabular font-mono text-[11px] ${on ? 'text-surface/70' : 'text-muted'}`}>{fmtInt(it.count)}</span>
                        )}
                        <ChevronRight size={14} className={on ? 'text-accent' : 'text-line-strong'} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!ptId && (
            <div className="bp-paper flex min-w-[240px] flex-1 items-center justify-center p-8 text-center">
              <div>
                <PartGlyph cat={catId ?? 'motor'} className="mx-auto size-24 text-bp-ink" />
                <p className="mt-3 font-display text-2xl font-bold uppercase">Paso {cols.length} de 6</p>
                <p className="text-sm text-bp-dim">Elige {nextCol.title.toLowerCase()} para continuar.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Móvil: un paso a la vez */}
      <div className="mt-5 md:hidden">
        {crumbs.length > 0 && (
          <ol className="mb-3 flex flex-wrap gap-1.5">
            {crumbs.map((c) => {
              const to = `/catalogo/${c.base.map(encodeURIComponent).join('/')}`;
              const label = c.items.find((i) => i.id === c.selected)?.label ?? c.selected;
              return (
                <li key={c.key}>
                  <a
                    href={href(to)}
                    onClick={linkClick(to)}
                    className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px]"
                  >
                    <span className="text-muted">{c.title}:</span> <b className="max-w-[9rem] truncate">{label}</b>
                  </a>
                </li>
              );
            })}
          </ol>
        )}
        {!ptId && (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <p className="label-caps border-b border-line bg-surface-2 px-4 py-2 text-[10px] text-muted">Elige {nextCol.title.toLowerCase()}</p>
            <ul className="divide-y divide-line">
              {nextCol.items.map((it) => {
                const to = `/catalogo/${[...nextCol.base, it.id].map(encodeURIComponent).join('/')}`;
                return (
                  <li key={it.id}>
                    <a href={href(to)} onClick={linkClick(to)} className="flex items-center gap-3 px-4 py-3">
                      {it.icon && <PartGlyph cat={it.icon} className="size-6 text-link" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{it.label}</span>
                        {it.sub && <span className="block font-mono text-[11px] text-muted">{it.sub}</span>}
                      </span>
                      {it.count != null && <span className="font-mono text-xs text-muted">{fmtInt(it.count)}</span>}
                      <ChevronRight size={16} className="text-muted" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {ptId && list && (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-3xl font-extrabold uppercase">{PART_TYPE_BY_ID.get(ptId)?.name}</h2>
            <p className="tabular text-sm text-muted">
              {fmtInt(list.total)} opciones · {MAKE_BY_ID.get(makeId)!.name} {MODEL_BY_ID.get(modelId)!.name} {year}
            </p>
          </div>
          <div className="mt-4 space-y-6">
            {groups.map(([pos, items]) => (
              <div key={pos} className="overflow-hidden rounded-lg border border-line bg-surface">
                <p className="label-caps border-b border-line bg-bp px-4 py-2 text-[11px] text-bp-ink">{pos}</p>
                {items.map((p) => (
                  <ProductRow key={p.id} p={p} fits={p.fit !== '*'} vehicleName={MODEL_BY_ID.get(modelId)!.name} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
