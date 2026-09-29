import { ArrowRight, Headset, PackageCheck, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BRANDS, CATEGORIES, TIERS, WAREHOUSES } from '../data/catalog';
import { fitmentOf, fits, getInventory } from '../data/inventory';
import type { Product, Tier } from '../data/types';
import { MAKES, MODEL_BY_ID, fitKeysFor, modelsOf, vehicleLabel } from '../data/vehicles';
import { fmtInt, fmtMoney } from '../config';
import { href, linkClick, navigate, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { useEngineStats, useSearch } from '../search/client';
import { removeSpans } from '../search/parser';
import { activeVehicle, garage, openPalette } from '../state/app';
import { BlueprintCar, ZONES } from '../components/BlueprintCar';
import { Finder } from '../components/Finder';
import { PartGlyph } from '../components/PartGlyph';
import { ProductCard } from '../components/ProductCard';
import { ChipView } from '../components/SearchPalette';
import { Highlight, TIER_DOT, TierBadge } from '../components/bits';
import { DiagnosisPanel } from '../components/Diagnosis';
import { SYMPTOMS, diagnoseSymptom } from '../search/diagnosis';
import { defaultKm, planService } from '../lib/service';

function useActive() {
  useStore(garage);
  return activeVehicle();
}

function Hero() {
  const vehicle = useActive();
  const stats = useEngineStats();
  const [hover, setHover] = useState<string | null>(null);
  const { data } = useSearch({ q: '', vehicle, pageSize: 0 });
  const counts = useMemo(() => (data ? Object.fromEntries(data.facets.category.map((f) => [f.value, f.count])) : null), [data]);
  const vName = vehicle ? vehicleLabel(vehicle, { engine: false }) : undefined;

  return (
    <section className="bp-paper relative overflow-hidden border-b border-bp-grid">
      <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 pt-10 pb-10 sm:px-6 lg:pt-12 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-10">
        <div className="anim-rise min-w-0">
          <p className="label-caps flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-bp-dim">
            <span className="text-accent">● En línea</span>
            <span className="tabular">{stats ? fmtInt(stats.products) : '20 000+'} referencias</span>
            <span className="tabular">{stats ? fmtInt(stats.vehicles) : '1 500+'} configuraciones de vehículo</span>
          </p>
          <h1 className="mt-4 font-display text-[clamp(2.8rem,6.4vw,5.2rem)] leading-[0.92] font-extrabold tracking-[-0.01em] text-bp-ink uppercase">
            La pieza exacta
            <br />
            para tu auto,
            <br />
            <span className="mt-2 inline-block bg-accent px-2 pt-1 leading-[0.9] text-accent-ink">a la primera.</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-bp-ink/85">
            Escribe como hablas en el mostrador —<i>«balatas delanteras hilux 2018»</i>— o busca por número de parte, código OEM o VIN. Respuesta en
            milisegundos, solo con piezas que le quedan a tu vehículo.
          </p>
          <div className="mt-7">
            <Finder />
          </div>
        </div>

        <div className="min-w-0">
          <div className="relative">
            <BlueprintCar counts={counts} active={hover} onHover={setHover} vehicleName={vName} onSelect={(cat) => navigate(searchUrl('', { cat }))} />
          </div>
          <ol className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
            {ZONES.map((z) => {
              const c = CATEGORIES.find((x) => x.id === z.cat)!;
              const to = searchUrl('', { cat: z.cat });
              return (
                <li key={z.cat}>
                  <a
                    href={href(to)}
                    onClick={linkClick(to)}
                    onMouseEnter={() => setHover(z.cat)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(z.cat)}
                    onBlur={() => setHover(null)}
                    className={`flex items-center gap-2 rounded px-1.5 py-1 text-[13px] transition ${hover === z.cat ? 'bg-accent text-accent-ink' : 'text-bp-ink hover:text-accent'}`}
                  >
                    <span className="tabular w-5 font-mono text-[11px] opacity-70">{String(z.n).padStart(2, '0')}</span>
                    <span className="flex-1 truncate">{c.short}</span>
                    <span className="tabular font-mono text-[11px] opacity-70">{counts ? fmtInt(counts[z.cat] ?? 0) : '…'}</span>
                  </a>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[12px] text-bp-dim">
            {vName ? `Conteos para tu ${vName}. ` : 'Elige tu vehículo y los conteos se ajustan a él. '}Toca un número para ver ese sistema.
          </p>
        </div>
      </div>

      <div className="border-t border-bp-grid bg-bp/60">
        <dl className="mx-auto grid max-w-[1400px] grid-cols-2 px-4 sm:px-6 lg:grid-cols-4">
          {[
            { k: 'Referencias en inventario', v: stats ? fmtInt(stats.products) : '…' },
            { k: 'Marcas de fabricante', v: stats ? String(stats.brands) : '…' },
            { k: 'Vehículos año-modelo-motor', v: stats ? fmtInt(stats.vehicles) : '…' },
            { k: 'Respuesta media de búsqueda', v: stats ? `${stats.medianQueryMs.toLocaleString('es', { maximumFractionDigits: 1 })} ms` : 'midiendo…' },
          ].map((s, i) => (
            <div key={s.k} className={`py-5 ${i % 2 ? 'pl-5' : ''} ${i > 0 ? 'lg:border-l lg:border-bp-grid lg:pl-6' : ''}`}>
              <dt className="label-caps text-[10px] text-bp-dim">{s.k}</dt>
              <dd className="tabular mt-1 font-display text-[2.1rem] leading-none font-bold text-bp-ink">{s.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const DEMOS = [
  'pastillas delanteras corolla 2016 menos de 60',
  'toyta corrola balatas',
  'amortiguador trasero hilux 2.8',
  'bomba de agua g4fc',
  'faro izquierdo original versa 2019',
  'croche ranger diesel',
];

function NaturalLanguage() {
  const [q, setQ] = useState(DEMOS[0]);
  const [demo, setDemo] = useState(0);
  const [typing, setTyping] = useState(true);
  const [user, setUser] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = DEMOS[demo];
    if (reduce) {
      setQ(target);
      const t = setTimeout(() => setDemo((d) => (d + 1) % DEMOS.length), 4200);
      return () => clearTimeout(t);
    }
    let i = 0;
    setTyping(true);
    const tick = setInterval(() => {
      i++;
      setQ(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(tick);
        setTyping(false);
      }
    }, 42);
    const next = setTimeout(() => setDemo((d) => (d + 1) % DEMOS.length), target.length * 42 + 3000);
    return () => {
      clearInterval(tick);
      clearTimeout(next);
    };
  }, [demo, user]);

  const { data } = useSearch({ q, pageSize: 3 });
  const inv = getInventory();

  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className="label-caps text-[11px] text-muted">Motor de búsqueda</p>
          <h2 className="mt-2 font-display text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[0.95] font-extrabold uppercase">Escribe como le hablas al mostrador</h2>
          <p className="mt-4 max-w-[36rem] text-[16px] text-ink-2">
            El buscador separa tu frase en vehículo, pieza, posición, nivel y precio, y filtra el inventario antes de que termines de escribir. Todo corre en tu
            navegador.
          </p>
          <dl className="mt-8 grid gap-5 sm:grid-cols-2">
            {[
              ['Sinónimos de toda la región', 'Balatas, pastillas y zapatas. Mofle y silenciador. Croche, clutch y embrague.'],
              ['Errores de tipeo', '«toyta corrola» se corrige solo a Toyota Corolla.'],
              ['Número de parte en cualquier formato', '0 986 494 525, 0986-494-525 y 0986494525 son lo mismo. Un OEM trae todas las equivalentes.'],
              ['Precio y posición en la frase', '«delanteras», «lado copiloto», «menos de 60», «original».'],
            ].map(([t, d]) => (
              <div key={t} className="border-l-2 border-accent pl-4">
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-1 text-sm text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2">
            <span className="label-caps text-[10px] text-muted">Pruébalo · consulta en vivo</span>
            <span className="tabular font-mono text-[11px] text-muted">
              {data ? `${fmtInt(data.total)} resultados · ${data.tookMs.toFixed(1)} ms` : 'cargando índice…'}
            </span>
          </div>
          <form
            className="flex items-center gap-2 border-b border-line px-4"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(searchUrl(q));
            }}
          >
            <span className="font-mono text-accent-ink">
              <span className="rounded-sm bg-accent px-1 font-bold">›</span>
            </span>
            <label htmlFor="nl-demo" className="sr-only">
              Consulta de ejemplo
            </label>
            <input
              ref={inputRef}
              id="nl-demo"
              value={q}
              onFocus={() => setUser(true)}
              onChange={(e) => {
                setUser(true);
                setQ(e.target.value);
              }}
              className={`h-14 min-w-0 flex-1 bg-transparent font-mono text-[15px] outline-none ${typing && !user ? 'caret-transparent' : ''}`}
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-sm font-semibold text-surface">
              Ver todo <ArrowRight size={14} />
            </button>
          </form>
          <div className="min-h-[3.25rem] border-b border-line px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {data?.chips.map((c, k) => (
                <ChipView
                  key={`${c.kind}-${c.label}-${k}`}
                  chip={c}
                  onRemove={() => {
                    setUser(true);
                    setQ(removeSpans(q, c.spans));
                  }}
                />
              ))}
              {data?.text && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[12px] text-muted">
                  <span className="label-caps text-[9px]">Texto</span>
                  {data.text}
                </span>
              )}
              {data && !data.chips.length && !data.text && <span className="text-sm text-muted">Escribe algo para ver cómo lo interpreta.</span>}
            </div>
            {data?.corrections.length ? (
              <p className="mt-2 text-xs text-muted">Corregido: {data.corrections.map((c) => `«${c.from}» → ${c.to}`).join(', ')}</p>
            ) : null}
          </div>
          <ul className="divide-y divide-line">
            {data?.items.map((h) => {
              const p = inv[h.i];
              const to = `/p/${p.id}`;
              return (
                <li key={p.id}>
                  <a href={href(to)} onClick={linkClick(to)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="bp-paper grid size-12 shrink-0 place-items-center rounded">
                      <PartGlyph cat={p.catId} pt={p.partTypeId} className="size-9 text-bp-ink" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[11px] text-muted">
                        <b className="text-ink-2 uppercase">{BRANDS.find((b) => b.id === p.brandId)!.name}</b>
                        <span className="font-mono">{p.partNumber}</span>
                        <TierBadge tier={p.tier} />
                      </span>
                      <span className="block truncate text-sm">
                        <Highlight text={p.title} terms={data.highlights} />
                        {p.position && <span className="text-muted"> · {p.position}</span>}
                      </span>
                    </span>
                    <span className="tabular font-display text-xl font-bold">{fmtMoney(p.price)}</span>
                  </a>
                </li>
              );
            })}
            {data && data.total === 0 && <li className="px-4 py-6 text-sm text-muted">Sin resultados para esa combinación. Quita un filtro tocando su ×.</li>}
          </ul>
          <div className="flex flex-wrap gap-2 border-t border-line bg-surface-2 px-4 py-3">
            {DEMOS.map((d, k) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setUser(true);
                  setDemo(k);
                  setQ(d);
                }}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${q === d ? 'border-ink bg-ink text-surface' : 'border-line-strong hover:border-ink'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const HOME_SYMPTOMS = ['ruido-frenar', 'calienta', 'no-arranca', 'falla-motor', 'check-engine', 'golpeteo', 'ac', 'vibra-frenar'];

function Workshop() {
  const vehicle = useActive();
  const [sym, setSym] = useState(HOME_SYMPTOMS[0]);
  const d = useMemo(() => diagnoseSymptom(sym, vehicle?.year), [sym, vehicle?.year]);
  const plan = useMemo(() => (vehicle ? planService(vehicle, defaultKm(vehicle.year)) : null), [vehicle?.id]);
  const vName = vehicle ? vehicleLabel(vehicle, { engine: false }) : undefined;
  const km = plan?.km ?? 60000;
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <p className="label-caps text-[11px] text-muted">Taller inteligente</p>
      <h2 className="mt-2 max-w-3xl font-display text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[0.95] font-extrabold uppercase">
        Dinos qué hace tu auto. Te decimos qué pieza revisar.
      </h2>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div>
            <p className="text-sm text-ink-2">
              Elige un síntoma o escríbelo en el buscador («chilla al frenar», «se calienta»). Estimamos la causa con un modelo bayesiano que combina el síntoma
              con el desgaste esperado según la edad {vName ? `de tu ${vName}` : 'del vehículo'}.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {HOME_SYMPTOMS.map((id) => {
                const s = SYMPTOMS.find((x) => x.id === id)!;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setSym(id)}
                      aria-pressed={sym === id}
                      className={`rounded-full border px-3 py-1.5 text-[13px] transition ${sym === id ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface hover:border-ink'}`}
                    >
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => navigate(searchUrl(SYMPTOMS.find((x) => x.id === sym)!.phrases[0]))}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-ink"
            >
              Ver piezas para este síntoma <ArrowRight size={16} />
            </button>
          </div>
          {d && <DiagnosisPanel d={d} vehicleName={vName} />}
        </div>

        <a
          href={href('/servicio')}
          onClick={linkClick('/servicio')}
          className="bp-paper group flex flex-col justify-between rounded-xl p-6 transition hover:ring-2 hover:ring-accent"
        >
          <div>
            <p className="label-caps text-[10px] text-bp-dim">Plan de mantenimiento</p>
            <p className="mt-2 font-display text-3xl leading-none font-bold uppercase">
              {vName ? `Servicio de ${fmtInt(km)} km para tu ${vName}` : 'Tu próximo servicio, armado solo'}
            </p>
            <div className="mt-5 flex gap-[3px]" aria-hidden="true">
              {String(km)
                .padStart(6, '0')
                .split('')
                .map((dg, i) => (
                  <span
                    key={i}
                    className={`grid h-11 w-8 place-items-center rounded-sm font-mono text-2xl font-semibold ${i >= 4 ? 'bg-bp-ink text-bp' : 'bg-bp-2 text-bp-ink ring-1 ring-bp-grid'}`}
                  >
                    {dg}
                  </span>
                ))}
            </div>
          </div>
          <div className="mt-6">
            {plan ? (
              <>
                <p className="text-sm text-bp-dim">
                  {plan.lines.length} tareas ·{' '}
                  {plan.lines
                    .map((l) => l.name.toLowerCase())
                    .slice(0, 4)
                    .join(', ')}
                  …
                </p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-sm text-bp-dim">desde</span>
                  <span className="tabular font-display text-4xl font-bold">{fmtMoney(plan.totals.eco)}</span>
                </p>
              </>
            ) : (
              <p className="text-sm text-bp-dim">Kilometraje + vehículo = lista exacta de piezas y tres paquetes con precio cerrado.</p>
            )}
            <span className="mt-4 inline-flex items-center gap-1.5 font-semibold text-accent">
              Armar mi plan <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </span>
          </div>
        </a>
      </div>
    </section>
  );
}

function Categories() {
  const vehicle = useActive();
  const { data } = useSearch({ q: '', vehicle, pageSize: 0 });
  const counts = data ? Object.fromEntries(data.facets.category.map((f) => [f.value, f.count])) : {};
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-[11px] text-muted">Catálogo</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-none font-extrabold uppercase">
            {vehicle ? `Para tu ${vehicleLabel(vehicle, { engine: false })}` : 'Compra por sistema'}
          </h2>
        </div>
        <a href={href('/catalogo')} onClick={linkClick('/catalogo')} className="text-sm font-semibold text-link">
          Explorar por marca, año y modelo →
        </a>
      </div>
      <ul className="mt-8 grid grid-flow-dense grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {CATEGORIES.map((c, i) => {
          const to = searchUrl('', { cat: c.id });
          const big = i === 0;
          return (
            <li key={c.id} className={big ? 'col-span-2 md:row-span-2' : ''}>
              <a
                href={href(to)}
                onClick={linkClick(to)}
                className={`group flex h-full flex-col rounded-lg border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-ink hover:shadow-card ${big ? 'bp-paper border-bp-grid sm:p-6' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <PartGlyph cat={c.id} className={`${big ? 'size-28 text-bp-ink sm:size-40' : 'size-14 text-link'} transition group-hover:scale-105`} />
                  <span className={`tabular font-mono text-[11px] ${big ? 'text-bp-dim' : 'text-muted'}`}>{data ? fmtInt(counts[c.id] ?? 0) : '…'}</span>
                </div>
                <div className="mt-auto pt-4">
                  <h3 className={`font-display font-bold uppercase ${big ? 'text-4xl text-bp-ink' : 'text-xl'}`}>{c.name}</h3>
                  <p className={`mt-0.5 text-[13px] ${big ? 'text-bp-dim' : 'text-muted'}`}>{c.blurb}</p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tiers() {
  const vehicle = useActive();
  const group = useMemo(() => {
    const inv = getInventory();
    const keys = vehicle ? fitKeysFor(vehicle) : null;
    const byGroup = new Map<string, Product[]>();
    for (const p of inv) {
      if (p.partTypeId !== 'pastillas-freno' || p.position !== 'Delantero' || !fits(p, keys)) continue;
      const k = p.fit;
      byGroup.set(k, [...(byGroup.get(k) ?? []), p]);
    }
    const tiersIn = (g: Product[]) => new Set(g.map((x) => x.tier)).size;
    const popular = [
      'g:toyota-corolla-e170',
      'g:toyota-hilux-an120',
      'g:nissan-versa-n17',
      'g:hyundai-accent-rb',
      'g:kia-rio-ub',
      'g:chevrolet-aveo-t250',
      'g:honda-civic-fc',
    ];
    const preferred = vehicle ? undefined : popular.map((k) => byGroup.get(k)).find((g) => g && tiersIn(g) === 4);
    const full = [...byGroup.values()].sort((a, b) => tiersIn(b) - tiersIn(a))[0];
    return preferred ?? full ?? [];
  }, [vehicle]);
  const fit = group[0] ? fitmentOf(group[0])[0] : undefined;
  const title = fit ? `${MODEL_BY_ID.get(fit.modelId)!.name} ${fit.from}–${fit.to}` : '';

  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div>
          <p className="label-caps text-[11px] text-muted">Cuatro niveles, una misma pieza</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-[0.95] font-extrabold uppercase">Tú decides cuánto pagar</h2>
          <p className="mt-4 text-ink-2">
            Cada pieza viene en varias opciones, del precio más bajo al equipo original. Ejemplo real del inventario: pastillas de freno delanteras para {title}
            .
          </p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((t) => {
            const opts = group.filter((p) => p.tier === t.id).sort((a, b) => a.price - b.price);
            const p = opts[0];
            return (
              <li key={t.id} className="flex flex-col rounded-lg border border-line bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${TIER_DOT[t.id as Tier]}`} />
                  <h3 className="font-display text-xl font-bold uppercase">{t.name}</h3>
                </div>
                <p className="mt-2 text-[13px] text-muted">{t.blurb}</p>
                <p className="mt-2 text-xs text-muted">Garantía {t.warranty}</p>
                <div className="mt-auto border-t border-line pt-3">
                  {p ? (
                    <a href={href(`/p/${p.id}`)} onClick={linkClick(`/p/${p.id}`)} className="group block">
                      <span className="block text-[12px] font-bold uppercase">{BRANDS.find((b) => b.id === p.brandId)!.name}</span>
                      <span className="block truncate text-xs text-muted">{p.specs.find(([k]) => k === 'Material')?.[1]}</span>
                      <span className="tabular mt-1 block font-display text-3xl font-bold group-hover:text-link">{fmtMoney(p.price)}</span>
                    </a>
                  ) : (
                    <span className="text-sm text-muted">Sin opción en este nivel para este vehículo</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Deals() {
  const vehicle = useActive();
  const { data } = useSearch({ q: '', vehicle, filters: { onSale: true, inStock: true }, sort: 'valoracion', pageSize: 10 });
  const inv = getInventory();
  if (!data || !data.items.length) return null;
  const vName = vehicle ? MODEL_BY_ID.get(vehicle.modelId)?.name : undefined;
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-[11px] text-muted">Ofertas y liquidación</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-none font-extrabold uppercase">
            {vName ? `Bajaron de precio para tu ${vName}` : 'Bajaron de precio esta semana'}
          </h2>
        </div>
        <a href={href(searchUrl('', { sale: '1' }))} onClick={linkClick(searchUrl('', { sale: '1' }))} className="text-sm font-semibold text-link">
          Ver {fmtInt(data.total)} ofertas →
        </a>
      </div>
      <ul className="scroll-thin -mx-4 mt-8 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        {data.items.map((h) => (
          <li key={h.i} className="w-[240px] shrink-0 snap-start">
            <ProductCard p={inv[h.i]} fits={h.fits} vehicleName={vName} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Makes() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <p className="label-caps text-[11px] text-muted">Catálogo por vehículo</p>
      <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-none font-extrabold uppercase">Marca → año → modelo → motor</h2>
      <p className="mt-3 max-w-2xl text-ink-2">
        El árbol clásico de los catálogos de repuestos, rediseñado: cuatro clics y ves cada sistema de tu vehículo con sus opciones y precios.
      </p>
      <ul className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {MAKES.map((m) => {
          const to = `/catalogo/${m.id}`;
          const models = modelsOf(m.id);
          return (
            <li key={m.id} className="bg-surface">
              <a href={href(to)} onClick={linkClick(to)} className="group flex h-full flex-col p-5 hover:bg-surface-2">
                <span className="font-display text-3xl font-extrabold uppercase group-hover:text-link">{m.name}</span>
                <span className="mt-1 line-clamp-2 text-[13px] text-muted">{models.map((x) => x.name).join(' · ')}</span>
              </a>
            </li>
          );
        })}
        <li className="bp-paper sm:col-span-1 lg:col-span-3">
          <a href={href('/catalogo')} onClick={linkClick('/catalogo')} className="flex h-full flex-col justify-between gap-3 p-5">
            <span className="font-display text-3xl font-extrabold text-accent uppercase">Todo el árbol</span>
            <span className="text-[13px] text-bp-dim">
              {fmtInt(MAKES.reduce((n, m) => n + modelsOf(m.id).length, 0))} modelos · abrir el explorador de catálogo →
            </span>
          </a>
        </li>
      </ul>
    </section>
  );
}

function Brands() {
  const list = [...BRANDS, ...BRANDS];
  return (
    <section className="mt-20 overflow-hidden border-y border-line bg-surface py-8" aria-label="Marcas que vendemos">
      <p className="label-caps mb-5 text-center text-[11px] text-muted">{BRANDS.length} marcas de fabricante · equipo original y reposición</p>
      <div className="marquee flex w-max gap-12 whitespace-nowrap">
        {list.map((b, i) => (
          <a
            key={`${b.id}-${i}`}
            href={href(searchUrl('', { brand: b.id }))}
            onClick={linkClick(searchUrl('', { brand: b.id }))}
            className={`font-display text-3xl text-ink-2 uppercase transition hover:text-link ${i % 3 === 0 ? 'font-extrabold' : i % 3 === 1 ? 'font-semibold tracking-wide' : 'font-bold italic'}`}
            aria-hidden={i >= BRANDS.length}
            tabIndex={i >= BRANDS.length ? -1 : undefined}
          >
            {b.name}
          </a>
        ))}
      </div>
    </section>
  );
}

function Service() {
  const items = [
    {
      icon: ShieldCheck,
      t: 'Compatibilidad garantizada',
      d: 'Si la compraste para tu vehículo registrado y no le queda, la cambiamos o te devolvemos el dinero.',
    },
    { icon: Truck, t: `Despacho desde ${WAREHOUSES.length} almacenes`, d: 'Cada ficha muestra existencias por almacén y el tiempo real de entrega.' },
    { icon: RotateCcw, t: 'Devoluciones en 30 días', d: 'Pieza sin instalar y en su empaque: devolución sin preguntas.' },
    { icon: Headset, t: 'Asesoría de un técnico', d: '¿Dudas entre dos piezas? Escríbenos con tu VIN y te confirmamos.' },
  ];
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <li key={it.t} className="flex gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-ink">
              <it.icon size={20} />
            </span>
            <div>
              <h3 className="font-semibold">{it.t}</h3>
              <p className="mt-1 text-sm text-muted">{it.d}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="flex items-center gap-4">
          <PackageCheck size={36} className="shrink-0 text-link" />
          <div>
            <p className="font-display text-3xl font-extrabold uppercase">¿Ya sabes qué necesitas?</p>
            <p className="text-sm text-muted">Pega el número de parte, el OEM o describe la pieza. Nosotros hacemos el resto.</p>
          </div>
        </div>
        <button type="button" onClick={() => openPalette()} className="inline-flex h-12 items-center gap-2 rounded-md bg-ink px-5 font-semibold text-surface">
          Abrir buscador <span className="font-mono text-xs opacity-70">Ctrl K</span>
        </button>
      </div>
    </section>
  );
}

export function HomePage() {
  useEffect(() => {
    document.title = 'Lenin Auto Cars · Repuestos para tu vehículo';
  }, []);
  return (
    <>
      <Hero />
      <NaturalLanguage />
      <Workshop />
      <Categories />
      <Tiers />
      <Deals />
      <Makes />
      <Brands />
      <Service />
    </>
  );
}
