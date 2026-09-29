import { ArrowRight, BadgeCheck, Headset, PackageCheck, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../api/client';
import { useMeta, vehicleLabel, vehicleParams } from '../api/meta';
import type { Diagnosis, Home, SearchResult, TierId } from '../api/types';
import { fmtInt, fmtMoney } from '../config';
import { href, linkClick, navigate, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { activeVehicle, garage, openPalette } from '../state/app';
import { BlueprintCar, ZONES } from '../components/BlueprintCar';
import { DiagnosisPanel } from '../components/Diagnosis';
import { Finder } from '../components/Finder';
import { PartGlyph } from '../components/PartGlyph';
import { ProductCard } from '../components/ProductCard';
import { ChipView } from '../components/SearchPalette';
import { Highlight, TIER_DOT, TierBadge } from '../components/bits';

function useActive() {
  useStore(garage);
  return activeVehicle();
}

function Hero({ home }: { home: Home | null }) {
  const meta = useMeta()!;
  const vehicle = useActive();
  const [hover, setHover] = useState<string | null>(null);
  const counts = home?.category_counts ?? null;
  const stats = home?.stats ?? meta.stats;
  const vName = vehicle ? vehicleLabel(vehicle, false) : undefined;

  return (
    <section className="bp-paper relative overflow-hidden border-b border-bp-grid">
      <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 pt-10 pb-10 sm:px-6 lg:pt-12 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-10">
        <div className="anim-rise min-w-0">
          <p className="label-caps flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-bp-dim">
            <span className="text-accent">● Motor en Python</span>
            <span className="tabular">{fmtInt(stats.products)} referencias</span>
            <span className="tabular">{fmtInt(stats.vehicles)} configuraciones de vehículo</span>
          </p>
          <h1 className="mt-4 font-display text-[clamp(2.8rem,6.4vw,5.2rem)] leading-[0.92] font-extrabold tracking-[-0.01em] text-bp-ink uppercase">
            La pieza exacta
            <br />
            para tu auto,
            <br />
            <span className="mt-2 inline-block bg-accent px-2 pt-1 leading-[0.9] text-accent-ink">certificada.</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-bp-ink/85">
            Escribe como hablas —<i>«me chilla al frenar el versa»</i>— o busca por número de parte, OEM o VIN. Cada pieza compatible sale con un certificado
            firmado que cualquiera puede verificar.
          </p>
          <div className="mt-7">
            <Finder samples={home?.part_number_samples ?? []} />
          </div>
        </div>

        <div className="min-w-0">
          <BlueprintCar counts={counts} active={hover} onHover={setHover} vehicleName={vName} onSelect={(cat) => navigate(searchUrl('', { cat }))} />
          <ol className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
            {ZONES.map((z) => {
              const c = meta.categories.find((x) => x.id === z.cat)!;
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
            { k: 'Referencias en inventario', v: fmtInt(stats.products) },
            { k: 'Marcas con índice de confianza', v: String(stats.brands) },
            { k: 'Vehículos año-modelo-motor', v: fmtInt(stats.vehicles) },
            { k: 'Consulta media en el servidor', v: `${stats.median_query_ms.toLocaleString('es', { maximumFractionDigits: 1 })} ms` },
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
  'me chilla y vibra al frenar versa 2014',
  'toyta corrola balatas',
  'amortiwador trasero hilux 2.8',
  'bomba de agua g4fc',
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
    const target = DEMOS[demo];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    const next = setTimeout(() => setDemo((d) => (d + 1) % DEMOS.length), target.length * 42 + 3200);
    return () => {
      clearInterval(tick);
      clearTimeout(next);
    };
  }, [demo, user]);

  const settled = user || !typing;
  const { data } = useApi<SearchResult>(settled && q.trim() ? '/api/search' : null, { q, size: 3 });

  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className="label-caps text-[11px] text-muted">Motor de búsqueda · Python</p>
          <h2 className="mt-2 font-display text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[0.95] font-extrabold uppercase">Escribe como le hablas al mostrador</h2>
          <p className="mt-4 max-w-[36rem] text-[16px] text-ink-2">
            El servidor separa tu frase en vehículo, pieza, posición, síntoma y precio, y busca con los mismos algoritmos que usan los grandes buscadores.
          </p>
          <dl className="mt-8 grid gap-5 sm:grid-cols-2">
            {[
              ['BM25F', 'El modelo de relevancia de Lucene y Elasticsearch, con pesos por campo.'],
              ['SymSpell + fonética española', '«amortiguadr» y «amortiwador» encuentran «amortiguador»; «balbula», «válvula».'],
              ['Reciprocal Rank Fusion + MMR', 'Mezcla relevancia, calidad bayesiana y stock, y diversifica marcas y niveles.'],
              ['Número de parte y OEM', 'En cualquier formato; un OEM trae todas las equivalentes.'],
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
            <span className="label-caps text-[10px] text-muted">Pruébalo · consulta en vivo a la API</span>
            <span className="tabular font-mono text-[11px] text-muted">{data ? `${fmtInt(data.total)} resultados · ${data.took_ms.toFixed(1)} ms` : '…'}</span>
          </div>
          <form
            className="flex items-center gap-2 border-b border-line px-4"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(searchUrl(q));
            }}
          >
            <span className="rounded-sm bg-accent px-1 font-mono font-bold text-accent-ink">›</span>
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
              className="h-14 min-w-0 flex-1 bg-transparent font-mono text-[15px] outline-none"
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
                    setQ(c.without);
                  }}
                />
              ))}
              {data?.text && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[12px] text-muted">
                  <span className="label-caps text-[9px]">Texto</span>
                  {data.text}
                </span>
              )}
            </div>
            {data && data.corrections.length > 0 && (
              <p className="mt-2 text-xs text-muted">Entendí: {data.corrections.map((c) => `«${c.written}» → ${c.understood} (${c.channel})`).join(', ')}</p>
            )}
          </div>
          {data?.diagnosis && (
            <div className="border-b border-line p-3">
              <DiagnosisPanel d={data.diagnosis} compact />
            </div>
          )}
          <ul className="divide-y divide-line">
            {data?.items.map(({ product: p, marks }) => (
              <li key={p.id}>
                <a href={href(`/p/${p.id}`)} onClick={linkClick(`/p/${p.id}`)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="bp-paper grid size-12 shrink-0 place-items-center rounded">
                    <PartGlyph cat={p.category.id} pt={p.part_type.id} className="size-9 text-bp-ink" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[11px] text-muted">
                      <b className="text-ink-2 uppercase">{p.brand.name}</b>
                      <span className="font-mono">{p.part_number}</span>
                      <TierBadge tier={p.tier} />
                    </span>
                    <span className="block truncate text-sm">
                      <Highlight text={p.title} marks={marks} />
                      {p.position && <span className="text-muted"> · {p.position}</span>}
                    </span>
                  </span>
                  <span className="tabular font-display text-xl font-bold">{fmtMoney(p.price)}</span>
                </a>
              </li>
            ))}
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

function Workshop({ home }: { home: Home | null }) {
  const meta = useMeta()!;
  const vehicle = useActive();
  const [picked, setPicked] = useState<string[]>([HOME_SYMPTOMS[0]]);
  const { data: d } = useApi<Diagnosis | null>('/api/diagnosis', { symptoms: picked.join(','), ...vehicleParams(vehicle) });
  const vName = vehicle ? vehicleLabel(vehicle, false) : undefined;
  const plan = home?.service ?? null;
  const km = plan?.km ?? 60000;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? (p.length > 1 ? p.filter((x) => x !== id) : p) : [...p, id].slice(-3)));

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
              Marca uno o varios síntomas. El servidor aplica Bayes ingenuo sobre pesos de taller y modela el desgaste con una distribución de Weibull según la
              edad {vName ? `de tu ${vName}` : 'del vehículo'}.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {HOME_SYMPTOMS.map((id) => {
                const s = meta.symptoms.find((x) => x.id === id)!;
                const on = picked.includes(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1.5 text-[13px] transition ${on ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface hover:border-ink'}`}
                    >
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => navigate(searchUrl(picked.map((id) => meta.symptoms.find((x) => x.id === id)!.example).join(' y ')))}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-ink"
            >
              Ver piezas para estos síntomas <ArrowRight size={16} />
            </button>
          </div>
          {d && <DiagnosisPanel d={d} vehicleName={vName} />}
        </div>

        <a
          href={href('/servicio')}
          onClick={linkClick('/servicio')}
          className="group bp-paper flex flex-col justify-between rounded-xl p-6 transition hover:ring-2 hover:ring-accent"
        >
          <div>
            <p className="label-caps text-[10px] text-bp-dim">Plan de mantenimiento · optimizador de presupuesto</p>
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
              <p className="text-sm text-bp-dim">Vehículo + kilometraje + presupuesto = lista exacta de piezas, tres paquetes y qué conviene posponer.</p>
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

function Categories({ home }: { home: Home | null }) {
  const meta = useMeta()!;
  const vehicle = useActive();
  const counts = home?.category_counts ?? {};
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-[11px] text-muted">Catálogo</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-none font-extrabold uppercase">
            {vehicle ? `Para tu ${vehicleLabel(vehicle, false)}` : 'Compra por sistema'}
          </h2>
        </div>
        <a href={href('/catalogo')} onClick={linkClick('/catalogo')} className="text-sm font-semibold text-link">
          Explorar por marca, año y modelo →
        </a>
      </div>
      <ul className="mt-8 grid grid-flow-dense grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {meta.categories.map((c, i) => {
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
                  <span className={`tabular font-mono text-[11px] ${big ? 'text-bp-dim' : 'text-muted'}`}>{home ? fmtInt(counts[c.id] ?? 0) : '…'}</span>
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

function Tiers({ home }: { home: Home | null }) {
  const meta = useMeta()!;
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div>
          <p className="label-caps text-[11px] text-muted">Cuatro niveles, una misma pieza</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-[0.95] font-extrabold uppercase">Tú decides cuánto pagar</h2>
          <p className="mt-4 text-ink-2">
            Cada pieza viene en varias opciones, del precio más bajo al equipo original. Ejemplo real del inventario: {home?.tier_showcase_title ?? '…'}.
          </p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {meta.tiers.map((t) => {
            const p = home?.tier_showcase[t.id as TierId] ?? null;
            return (
              <li key={t.id} className="flex flex-col rounded-lg border border-line bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${TIER_DOT[t.id]}`} />
                  <h3 className="font-display text-xl font-bold uppercase">{t.name}</h3>
                </div>
                <p className="mt-2 text-[13px] text-muted">{t.blurb}</p>
                <p className="mt-2 text-xs text-muted">Garantía {t.warranty}</p>
                <div className="mt-auto border-t border-line pt-3">
                  {p ? (
                    <a href={href(`/p/${p.id}`)} onClick={linkClick(`/p/${p.id}`)} className="group block">
                      <span className="block text-[12px] font-bold uppercase">{p.brand.name}</span>
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

function Deals({ home }: { home: Home | null }) {
  const vehicle = useActive();
  if (!home || !home.deals.length) return null;
  const vName = vehicle ? vehicleLabel({ modelId: vehicle.modelId }, false) : undefined;
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
          Ver {fmtInt(home.deals_total)} ofertas →
        </a>
      </div>
      <ul className="scroll-thin -mx-4 mt-8 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        {home.deals.map((p) => (
          <li key={p.id} className="w-[240px] shrink-0 snap-start">
            <ProductCard p={p} fits={!!vehicle && !p.universal} vehicleName={vName} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Trust() {
  const meta = useMeta()!;
  const top = [...meta.brands].sort((a, b) => b.trust - a.trust).slice(0, 8);
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className="label-caps text-[11px] text-muted">Confianza medible</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-[0.95] font-extrabold uppercase">
            No te pedimos que confíes. Te lo demostramos.
          </h2>
          <ul className="mt-6 space-y-4 text-sm">
            {[
              [
                'Certificado de compatibilidad firmado',
                'HMAC-SHA256: si alguien cambia una letra del vehículo o la pieza, la firma deja de coincidir. Verifícalo tú mismo.',
              ],
              ['Calificación honesta', 'Promedio bayesiano y límite de Wilson: 5★ con 2 reseñas no le gana a 4,7★ con 900.'],
              ['Precio justo', 'Te decimos en qué percentil de su mercado está cada precio.'],
              ['Índice de confianza de marca', 'Calificación, garantía, disponibilidad y si es proveedor de equipo original.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <BadgeCheck size={20} className="mt-0.5 shrink-0 text-ok" />
                <span>
                  <b className="block">{t}</b>
                  <span className="text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ul>
          <a
            href={href('/verificar')}
            onClick={linkClick('/verificar')}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 font-semibold text-surface"
          >
            Verificar un certificado <ArrowRight size={16} />
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <p className="label-caps border-b border-line bg-surface-2 px-4 py-2 text-[10px] text-muted">
            Índice de confianza de marca · calculado con {fmtInt(meta.stats.products)} referencias
          </p>
          <ul className="divide-y divide-line">
            {top.map((b) => (
              <li key={b.id}>
                <a
                  href={href(searchUrl('', { brand: b.id }))}
                  onClick={linkClick(searchUrl('', { brand: b.id }))}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_3.5rem] items-center gap-4 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-xl font-bold uppercase">{b.name}</span>
                    <span className="text-xs text-muted">{b.origin}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-ok" style={{ width: `${b.trust}%` }} />
                  </span>
                  <span className="tabular text-right font-display text-2xl font-bold">
                    {b.grade}
                    <span className="block font-mono text-[10px] font-normal text-muted">{b.trust}/100</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Service() {
  const items = [
    {
      icon: ShieldCheck,
      t: 'Compatibilidad certificada',
      d: 'Si la compraste para tu vehículo registrado y no le queda, la cambiamos o te devolvemos el dinero.',
    },
    { icon: Truck, t: 'Envíos consolidados', d: 'El servidor calcula el mínimo de paquetes entre almacenes y el plazo real.' },
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
            <p className="text-sm text-muted">Pega el número de parte, el OEM o describe el síntoma. Nosotros hacemos el resto.</p>
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
  const vehicle = useActive();
  const { data: home } = useApi<Home>('/api/home', vehicleParams(vehicle));
  useEffect(() => {
    document.title = 'Lenin Auto Cars · Repuestos certificados para tu vehículo';
  }, []);
  return (
    <>
      <Hero home={home} />
      <NaturalLanguage />
      <Workshop home={home} />
      <Trust />
      <Categories home={home} />
      <Tiers home={home} />
      <Deals home={home} />
      <Service />
    </>
  );
}
