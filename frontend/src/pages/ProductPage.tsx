import { ArrowLeft, BadgeCheck, CircleCheck, CircleX, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '../api/client';
import { useMeta, vehicleLabel, vehicleParams } from '../api/meta';
import type { Product, ProductDetail } from '../api/types';
import { fmtMoney } from '../config';
import { href, linkClick, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { activeVehicle, addToCart, garage, toast, ui } from '../state/app';
import { BestValue, CopyPN, Price, Stars, StockLine, TIER_DOT, TierBadge } from '../components/bits';
import { PartPlate } from '../components/PartGlyph';
import { ProductCard } from '../components/ProductCard';

function JsonLd({ p, currency }: { p: Product; currency: string }) {
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${p.brand.name} ${p.title}`,
      sku: p.part_number,
      mpn: p.part_number,
      brand: { '@type': 'Brand', name: p.brand.name },
      category: p.category.name,
      aggregateRating: p.reviews ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviews } : undefined,
      offers: {
        '@type': 'Offer',
        priceCurrency: currency,
        price: p.price,
        availability: p.availability.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/BackOrder',
      },
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [p, currency]);
  return null;
}

function TrustPanel({ d }: { d: ProductDetail }) {
  const p = d.product;
  const t = d.brand_trust;
  const fairTone = p.fair_price.percentile <= 35 ? 'text-ok' : p.fair_price.percentile <= 70 ? 'text-ink' : 'text-warn';
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold uppercase">
        <ShieldCheck size={22} className="text-ok" /> Por qué confiar en esta pieza
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="label-caps text-[10px] text-muted">Confianza de marca</dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold">{t.grade}</span>
            <span className="tabular font-mono text-sm text-muted">{t.score}/100</span>
          </dd>
          <p className="mt-1 text-xs text-muted">
            ★ {t.rating.toFixed(2)} bayesiano en {t.reviews.toLocaleString('es')} reseñas · {t.in_stock_pct}% con stock
            {t.oem_supplier ? ' · proveedor de equipo original' : ''}
          </p>
        </div>
        <div>
          <dt className="label-caps text-[10px] text-muted">Calificación honesta</dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="tabular font-display text-4xl font-bold">{p.rating_adjusted.toFixed(2)}</span>
            <span className="text-sm text-muted">de {p.rating.toFixed(1)}★ crudo</span>
          </dd>
          <p className="mt-1 text-xs text-muted">Al menos {Math.round(p.satisfaction * 100)}% de clientes satisfechos (límite de Wilson, 95%).</p>
        </div>
        <div>
          <dt className="label-caps text-[10px] text-muted">Precio justo</dt>
          <dd className={`mt-1 font-display text-3xl font-bold ${fairTone}`}>{p.fair_price.label}</dd>
          <p className="mt-1 text-xs text-muted">
            Percentil {p.fair_price.percentile} de su mercado · mediana {fmtMoney(p.fair_price.median)}
          </p>
        </div>
      </dl>
      {d.certificate && (
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-ok/40 bg-ok-soft p-4">
          <BadgeCheck size={28} className="shrink-0 text-ok" />
          <div className="min-w-0 flex-1">
            <p className="label-caps text-[10px] text-ok">Certificado de compatibilidad · HMAC-SHA256</p>
            <p className="font-mono text-lg font-semibold tracking-wide">{d.certificate.code}</p>
            <p className="text-xs text-muted">
              {d.certificate.vehicle} · emitido {d.certificate.issued}
            </p>
          </div>
          <a
            href={href(`/verificar?t=${d.certificate.token}`)}
            onClick={linkClick(`/verificar?t=${d.certificate.token}`)}
            className="rounded-md border border-ok/50 px-3 py-2 text-sm font-semibold text-ok hover:bg-ok hover:text-surface"
          >
            Verificar firma
          </a>
        </div>
      )}
    </section>
  );
}

export function ProductPage({ id }: { id: string }) {
  const meta = useMeta()!;
  useStore(garage);
  const vehicle = activeVehicle();
  const [qty, setQty] = useState(1);
  const { data: d, error } = useApi<ProductDetail>(`/api/products/${encodeURIComponent(id)}`, vehicleParams(vehicle));

  useEffect(() => {
    if (d) document.title = `${d.product.brand.name} ${d.product.part_number} · ${d.product.title} · Lenin Auto Cars`;
    setQty(1);
  }, [d]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="font-display text-4xl font-extrabold uppercase">Pieza no encontrada</p>
        <p className="mt-2 text-muted">El enlace puede estar incompleto. Busca por número de parte para encontrarla.</p>
        <a href={href('/')} onClick={linkClick('/')} className="mt-6 inline-block font-semibold text-link">
          Volver al inicio
        </a>
      </div>
    );
  if (!d || d.product.id !== id) return <div className="mx-auto h-[60vh] max-w-[1400px] px-4 pt-6 sm:px-6" aria-busy="true" />;

  const p = d.product;
  const vName = vehicle ? vehicleLabel(vehicle, false) : '';
  const fit = d.fitment;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
      <JsonLd p={p} currency={meta.store.currency} />
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        <a href={href('/')} onClick={linkClick('/')} className="hover:text-link">
          Inicio
        </a>
        <span>/</span>
        <a href={href(searchUrl('', { cat: p.category.id }))} onClick={linkClick(searchUrl('', { cat: p.category.id }))} className="hover:text-link">
          {p.category.name}
        </a>
        <span>/</span>
        <a href={href(searchUrl('', { pt: p.part_type.id }))} onClick={linkClick(searchUrl('', { pt: p.part_type.id }))} className="hover:text-link">
          {p.part_type.name}
        </a>
        <span>/</span>
        <span className="font-mono text-ink-2">{p.part_number}</span>
      </nav>
      <button type="button" onClick={() => history.back()} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-link">
        <ArrowLeft size={15} /> Volver
      </button>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div className="min-w-0">
          <PartPlate cat={p.category.id} pt={p.part_type.id} pn={p.part_number} size="lg" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ['Categoría', p.category.name],
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
            <b className="tracking-wide uppercase">{p.brand.name}</b>
            <span className="text-muted">· {p.brand.origin}</span>
            <TierBadge tier={p.tier} long />
            {p.best_value && <BestValue />}
          </p>
          <h1 className="mt-2 font-display text-[clamp(2rem,3.4vw,2.9rem)] leading-[0.95] font-extrabold uppercase">{p.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CopyPN value={p.part_number} />
            <Stars rating={p.rating} reviews={p.reviews} adjusted={p.rating_adjusted} />
          </div>

          <div className="mt-6 rounded-xl border border-line bg-surface p-5">
            <Price p={p} size="lg" />
            <p className="mt-2 text-[13px] text-muted">{meta.tiers.find((t) => t.id === p.tier.id)?.blurb}</p>

            <div
              className={`mt-4 flex items-start gap-3 rounded-lg border p-3 text-sm ${
                fit.status === 'confirmada'
                  ? 'border-ok/40 bg-ok-soft'
                  : fit.status === 'no'
                    ? 'border-danger/40 bg-warn-soft'
                    : 'border-dashed border-line-strong'
              }`}
            >
              {fit.status === 'confirmada' ? (
                <CircleCheck size={18} className="mt-0.5 shrink-0 text-ok" />
              ) : fit.status === 'no' ? (
                <CircleX size={18} className="mt-0.5 shrink-0 text-danger" />
              ) : (
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p>
                  {fit.status === 'confirmada' && <b>Le queda a tu {vName}. </b>}
                  {fit.status === 'no' && <b>No es para tu {vName}. </b>}
                  {fit.reason} {fit.status === 'condicional' && <span className="tabular text-muted">(confianza {Math.round(fit.confidence * 100)}%)</span>}
                </p>
                {fit.status === 'no' && (
                  <a
                    className="font-semibold text-link"
                    href={href(searchUrl(p.part_type.name.toLowerCase()))}
                    onClick={linkClick(searchUrl(p.part_type.name.toLowerCase()))}
                  >
                    Ver {p.part_type.name.toLowerCase()} compatibles →
                  </a>
                )}
                {fit.status === 'sin-vehiculo' && (
                  <button type="button" className="font-semibold text-link" onClick={() => ui.set((u) => ({ ...u, garage: true }))}>
                    Elegir mi vehículo
                  </button>
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
                  toast(`Agregado: ${qty} × ${p.brand.name} ${p.part_number}`);
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
                  {meta.warehouses.map((w, i) => (
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

      <div className="mt-10">
        <TrustPanel d={d} />
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl font-bold uppercase">Especificaciones</h2>
          <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {[['Marca', p.brand.name], ['Número de parte', p.part_number], ['Tipo de pieza', p.part_type.name], ...p.specs].map(([k, v]) => (
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
            {(
              [
                ['Fabricante', [p.part_number]],
                ['OEM (equipo original)', p.oem],
                ['Referencia cruzada', p.xref],
              ] as const
            )
              .filter(([, list]) => list.length)
              .map(([label, list]) => (
                <div key={label}>
                  <p className="label-caps text-[10px] text-muted">{label}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {list.map((o) => (
                      <CopyPN key={o} value={o} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>

      {d.alternatives.length > 1 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold uppercase">Compara las opciones para esta pieza</h2>
          <p className="mt-1 text-sm text-muted">Mismo vehículo, misma posición: elige por precio, marca o garantía.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-surface-2 text-left">
                <tr className="label-caps text-[10px] text-muted">
                  <th className="px-4 py-2 font-medium">Nivel</th>
                  <th className="px-4 py-2 font-medium">Marca y número</th>
                  <th className="px-4 py-2 font-medium">Confianza</th>
                  <th className="px-4 py-2 font-medium">Disponibilidad</th>
                  <th className="px-4 py-2 text-right font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {d.alternatives.map((x) => (
                  <tr key={x.id} className={`border-t border-line ${x.id === p.id ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={`size-2 rounded-full ${TIER_DOT[x.tier.id]}`} />
                        {x.tier.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={href(`/p/${x.id}`)} onClick={linkClick(`/p/${x.id}`)} className="font-semibold hover:text-link">
                        {x.brand.name}
                      </a>{' '}
                      <span className="font-mono text-xs text-muted">{x.part_number}</span>
                      {x.id === p.id && <span className="ml-2 text-xs font-semibold">(estás aquí)</span>}
                      {x.best_value && <BestValue className="ml-2" />}
                    </td>
                    <td className="tabular px-4 py-3 text-muted">
                      {x.brand.grade} · ★ {x.rating_adjusted.toFixed(2)}
                    </td>
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

      {d.vehicles.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold uppercase">Vehículos compatibles</h2>
          <p className="mt-1 text-sm text-muted">
            {p.fit.startsWith('e:')
              ? `Se monta en el motor ${p.fit.slice(2)}, que comparten ${d.vehicles.length} generaciones de vehículos.`
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
                {d.vehicles.map((r) => {
                  const mine = vehicle && vehicle.modelId === r.model_id && vehicle.year >= r.years[0] && vehicle.year <= r.years[1];
                  return (
                    <tr key={`${r.model_id}-${r.generation}`} className={`border-t border-line ${mine ? 'bg-ok-soft' : ''}`}>
                      <td className="px-4 py-2.5">{r.make}</td>
                      <td className="px-4 py-2.5 font-medium">
                        {r.model}
                        {mine && <span className="ml-2 text-xs font-semibold text-ok">tu vehículo</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.generation}</td>
                      <td className="tabular px-4 py-2.5">
                        {r.years[0]}–{r.years[1]}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{r.engines.join(' / ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {d.related.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold uppercase">Completa el trabajo</h2>
          <p className="mt-1 text-sm text-muted">
            Lo que normalmente se cambia junto con {p.part_type.name.toLowerCase()}
            {vName ? ` en tu ${vName}` : ''}.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {d.related.map((r) => (
              <li key={r.id} className="flex">
                <ProductCard
                  p={r}
                  fits={!!vehicle && r.fit !== '*'}
                  vehicleName={vehicle ? meta.models.find((m) => m.id === vehicle.modelId)?.name : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
