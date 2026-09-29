import { ArrowLeft, CircleCheck, CircleX, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BRAND_BY_ID, CATEGORY_BY_ID, PART_TYPE_BY_ID, TIERS, TIER_BY_ID, WAREHOUSES } from '../data/catalog';
import { fitmentOf, fits, getInventory, productById } from '../data/inventory';
import type { Product } from '../data/types';
import { MAKE_BY_ID, MODEL_BY_ID, engineLabel, fitKeysFor, vehicleLabel } from '../data/vehicles';
import { STORE, fmtMoney } from '../config';
import { href, linkClick, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { activeVehicle, addToCart, garage, toast, ui } from '../state/app';
import { CopyPN, Price, Stars, StockLine, TIER_DOT, TierBadge, stockInfo } from '../components/bits';
import { PartPlate } from '../components/PartGlyph';
import { BestValue, ProductCard } from '../components/ProductCard';
import { bestValueIds } from '../lib/value';

function JsonLd({ p }: { p: Product }) {
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${BRAND_BY_ID.get(p.brandId)!.name} ${p.title}`,
      sku: p.partNumber,
      mpn: p.partNumber,
      brand: { '@type': 'Brand', name: BRAND_BY_ID.get(p.brandId)!.name },
      category: CATEGORY_BY_ID.get(p.catId)!.name,
      aggregateRating: p.reviews ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviews } : undefined,
      offers: {
        '@type': 'Offer',
        priceCurrency: STORE.currency,
        price: p.price,
        availability: stockInfo(p).ok ? 'https://schema.org/InStock' : 'https://schema.org/BackOrder',
      },
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [p]);
  return null;
}

export function ProductPage({ id }: { id: string }) {
  const p = productById(id);
  useStore(garage);
  const vehicle = activeVehicle();
  const [qty, setQty] = useState(1);

  const inv = getInventory();
  const alternatives = useMemo(
    () => (p ? inv.filter((x) => x.fit === p.fit && x.partTypeId === p.partTypeId && x.position === p.position && x.variant === p.variant) : []),
    [p, inv],
  );
  const related = useMemo(() => {
    if (!p) return [];
    const types = PART_TYPE_BY_ID.get(p.partTypeId)!.related ?? [];
    const keys = vehicle
      ? fitKeysFor(vehicle)
      : new Set(
          fitmentOf(p).flatMap((r) => [`g:${MODEL_BY_ID.get(r.modelId)!.gens.find((g) => g.code === r.genCode)!.id}`, ...r.engines.map((e) => `e:${e}`)]),
        );
    const out: Product[] = [];
    for (const t of types) {
      const cands = inv.filter((x) => x.partTypeId === t && fits(x, keys)).sort((a, b) => b.popularity - a.popularity);
      if (cands[0]) out.push(cands[0]);
      if (cands[1] && out.length < 4) out.push(cands[1]);
    }
    return out.slice(0, 4);
  }, [p, vehicle, inv]);

  useEffect(() => {
    if (p) document.title = `${BRAND_BY_ID.get(p.brandId)!.name} ${p.partNumber} · ${p.title} · Lenin Auto Cars`;
    setQty(1);
  }, [p]);

  if (!p) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="font-display text-4xl font-extrabold uppercase">Pieza no encontrada</p>
        <p className="mt-2 text-muted">El enlace puede estar incompleto. Busca por número de parte para encontrarla.</p>
        <a href={href('/')} onClick={linkClick('/')} className="mt-6 inline-block font-semibold text-link">
          Volver al inicio
        </a>
      </div>
    );
  }

  const brand = BRAND_BY_ID.get(p.brandId)!;
  const pt = PART_TYPE_BY_ID.get(p.partTypeId)!;
  const cat = CATEGORY_BY_ID.get(p.catId)!;
  const tier = TIER_BY_ID.get(p.tier)!;
  const rows = fitmentOf(p);
  const keys = vehicle ? fitKeysFor(vehicle) : null;
  const fitsActive = vehicle ? fits(p, keys) : null;
  const vName = vehicle ? vehicleLabel(vehicle, { engine: false }) : '';

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
      <JsonLd p={p} />
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        <a href={href('/')} onClick={linkClick('/')} className="hover:text-link">
          Inicio
        </a>
        <span>/</span>
        <a href={href(searchUrl('', { cat: cat.id }))} onClick={linkClick(searchUrl('', { cat: cat.id }))} className="hover:text-link">
          {cat.name}
        </a>
        <span>/</span>
        <a href={href(searchUrl('', { pt: pt.id }))} onClick={linkClick(searchUrl('', { pt: pt.id }))} className="hover:text-link">
          {pt.name}
        </a>
        <span>/</span>
        <span className="font-mono text-ink-2">{p.partNumber}</span>
      </nav>
      <button type="button" onClick={() => history.back()} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-link">
        <ArrowLeft size={15} /> Volver
      </button>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div className="min-w-0">
          <PartPlate cat={p.catId} pt={p.partTypeId} pn={p.partNumber} size="lg" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ['Categoría', cat.short],
              ['Posición', p.position ?? p.variant ?? '—'],
              ['Garantía', p.warranty],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-line bg-surface px-3 py-2">
                <p className="label-caps text-[9px] text-muted">{k}</p>
                <p className="truncate text-sm font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <b className="tracking-wide uppercase">{brand.name}</b>
            <span className="text-muted">· {brand.origin}</span>
            <TierBadge tier={p.tier} long />
            {bestValueIds().has(p.id) && <BestValue />}
          </p>
          <h1 className="mt-2 font-display text-[clamp(2rem,3.4vw,2.9rem)] leading-[0.95] font-extrabold uppercase">{p.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CopyPN value={p.partNumber} />
            <Stars rating={p.rating} reviews={p.reviews} />
          </div>

          <div className="mt-6 rounded-xl border border-line bg-surface p-5">
            <Price p={p} size="lg" />
            <p className="mt-2 text-[13px] text-muted">{tier.blurb}</p>

            <div
              className={`mt-4 flex items-start gap-3 rounded-lg border p-3 text-sm ${
                fitsActive === true ? 'border-ok/40 bg-ok-soft' : fitsActive === false ? 'border-danger/40 bg-warn-soft' : 'border-dashed border-line-strong'
              }`}
            >
              {fitsActive === true ? (
                <CircleCheck size={18} className="mt-0.5 shrink-0 text-ok" />
              ) : fitsActive === false ? (
                <CircleX size={18} className="mt-0.5 shrink-0 text-danger" />
              ) : (
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-muted" />
              )}
              <div className="min-w-0 flex-1">
                {fitsActive === true && (
                  <p>
                    <b>
                      {p.fit === '*' ? 'Pieza universal' : 'Le queda a tu'} {p.fit === '*' ? '' : vName}
                    </b>
                    {p.fit === '*' ? ': verifica la especificación del manual de tu vehículo.' : '. Compatibilidad garantizada.'}
                  </p>
                )}
                {fitsActive === false && (
                  <p>
                    <b>No es para tu {vName}.</b>{' '}
                    <a className="font-semibold text-link" href={href(searchUrl(pt.name.toLowerCase()))} onClick={linkClick(searchUrl(pt.name.toLowerCase()))}>
                      Ver {pt.name.toLowerCase()} compatibles →
                    </a>
                  </p>
                )}
                {fitsActive === null && (
                  <p>
                    ¿Le queda a tu auto?{' '}
                    <button type="button" className="font-semibold text-link" onClick={() => ui.set((u) => ({ ...u, garage: true }))}>
                      Elige tu vehículo
                    </button>{' '}
                    y lo confirmamos.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="inline-flex h-12 items-center rounded-md border border-line-strong">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-3 hover:bg-surface-2" aria-label="Menos">
                  <Minus size={15} />
                </button>
                <span className="tabular w-8 text-center font-semibold" aria-live="polite">
                  {qty}
                </span>
                <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} className="px-3 py-3 hover:bg-surface-2" aria-label="Más">
                  <Plus size={15} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  addToCart(p.id, qty);
                  toast(`Agregado: ${qty} × ${brand.name} ${p.partNumber}`);
                }}
                className="h-12 flex-1 rounded-md bg-accent px-6 font-semibold text-accent-ink hover:brightness-95"
              >
                Agregar al carrito
              </button>
              <button
                type="button"
                onClick={() => {
                  addToCart(p.id, qty);
                  ui.set((u) => ({ ...u, cart: true }));
                }}
                className="h-12 rounded-md border-2 border-ink px-5 font-semibold hover:bg-ink hover:text-surface"
              >
                Comprar ya
              </button>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Truck size={16} /> Existencias por almacén
              </p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {WAREHOUSES.map((w, i) => (
                    <tr key={w.id} className="border-b border-line last:border-b-0">
                      <td className="py-1.5">{w.name}</td>
                      <td className={`tabular py-1.5 text-right ${p.stock[i] ? 'text-ok' : 'text-muted'}`}>{p.stock[i] ? `${p.stock[i]} disp.` : 'Agotado'}</td>
                      <td className="tabular py-1.5 text-right text-muted">{p.stock[i] ? `${w.eta[0]}–${w.eta[1]} días` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2">
                <StockLine p={p} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl font-bold uppercase">Especificaciones</h2>
          <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {[['Marca', brand.name], ['Número de parte', p.partNumber], ['Tipo de pieza', pt.name], ...p.specs].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-2.5 text-sm">
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold uppercase">Números de referencia</h2>
          <p className="mt-1 text-sm text-muted">Búscala con cualquiera de estos números. Toca uno para copiarlo.</p>
          <div className="mt-3 space-y-3 rounded-lg border border-line bg-surface p-4">
            <div>
              <p className="label-caps text-[10px] text-muted">Fabricante</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <CopyPN value={p.partNumber} />
              </div>
            </div>
            {p.oem.length > 0 && (
              <div>
                <p className="label-caps text-[10px] text-muted">OEM (equipo original)</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {p.oem.map((o) => (
                    <CopyPN key={o} value={o} />
                  ))}
                </div>
              </div>
            )}
            {p.xref.length > 0 && (
              <div>
                <p className="label-caps text-[10px] text-muted">Referencia cruzada</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {p.xref.map((o) => (
                    <CopyPN key={o} value={o} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {alternatives.length > 1 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold uppercase">Compara las opciones para esta pieza</h2>
          <p className="mt-1 text-sm text-muted">Mismo vehículo, misma posición: elige por precio, marca o garantía.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-2 text-left">
                <tr className="label-caps text-[10px] text-muted">
                  <th className="px-4 py-2 font-medium">Nivel</th>
                  <th className="px-4 py-2 font-medium">Marca y número</th>
                  <th className="px-4 py-2 font-medium">Detalle</th>
                  <th className="px-4 py-2 font-medium">Disponibilidad</th>
                  <th className="px-4 py-2 text-right font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {[...alternatives]
                  .sort((a, b) => TIERS.findIndex((t) => t.id === a.tier) - TIERS.findIndex((t) => t.id === b.tier) || a.price - b.price)
                  .map((x) => (
                    <tr key={x.id} className={`border-t border-line ${x.id === p.id ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className={`size-2 rounded-full ${TIER_DOT[x.tier]}`} />
                          {TIER_BY_ID.get(x.tier)!.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={href(`/p/${x.id}`)} onClick={linkClick(`/p/${x.id}`)} className="font-semibold hover:text-link">
                          {BRAND_BY_ID.get(x.brandId)!.name}
                        </a>{' '}
                        <span className="font-mono text-xs text-muted">{x.partNumber}</span>
                        {x.id === p.id && <span className="ml-2 text-xs font-semibold">(estás aquí)</span>}
                        {bestValueIds().has(x.id) && <BestValue className="ml-2" />}
                      </td>
                      <td className="px-4 py-3 text-muted">{x.specs.filter(([k]) => k !== 'Posición')[0]?.[1]}</td>
                      <td className="px-4 py-3">
                        <StockLine p={x} />
                      </td>
                      <td className="tabular px-4 py-3 text-right font-display text-lg font-bold">{fmtMoney(x.price)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold uppercase">Vehículos compatibles</h2>
          <p className="mt-1 text-sm text-muted">
            {p.fit.startsWith('e:')
              ? `Se monta en el motor ${engineLabel(p.fit.slice(2))}, que comparten ${rows.length} ${rows.length === 1 ? 'generación' : 'generaciones'} de vehículos.`
              : 'Específica para esta generación de carrocería.'}
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-2 text-left">
                <tr className="label-caps text-[10px] text-muted">
                  <th className="px-4 py-2 font-medium">Marca</th>
                  <th className="px-4 py-2 font-medium">Modelo</th>
                  <th className="px-4 py-2 font-medium">Generación</th>
                  <th className="px-4 py-2 font-medium">Años</th>
                  <th className="px-4 py-2 font-medium">Motor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const mine = vehicle && vehicle.modelId === r.modelId && vehicle.year >= r.from && vehicle.year <= r.to;
                  return (
                    <tr key={`${r.modelId}-${r.genCode}`} className={`border-t border-line ${mine ? 'bg-ok-soft' : ''}`}>
                      <td className="px-4 py-2.5">{MAKE_BY_ID.get(r.makeId)!.name}</td>
                      <td className="px-4 py-2.5 font-medium">
                        {MODEL_BY_ID.get(r.modelId)!.name}
                        {mine && <span className="ml-2 text-xs font-semibold text-ok">tu vehículo</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.genCode}</td>
                      <td className="tabular px-4 py-2.5">
                        {r.from}–{r.to}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{r.engines.map((e) => engineLabel(e)).join(' / ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold uppercase">Completa el trabajo</h2>
          <p className="mt-1 text-sm text-muted">
            Lo que normalmente se cambia junto con {pt.name.toLowerCase()}
            {vName ? ` en tu ${vName}` : ''}.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {related.map((r) => (
              <li key={r.id} className="flex">
                <ProductCard p={r} fits={!!vehicle && r.fit !== '*'} vehicleName={vehicle ? MODEL_BY_ID.get(vehicle.modelId)?.name : undefined} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
