import { Car, Check, Gauge, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '../api/client';
import { vehicleParams, type VehicleSel } from '../api/meta';
import type { Pack, ServicePlan } from '../api/types';
import { fmtInt, fmtMoney } from '../config';
import { href, linkClick } from '../lib/router';
import { useStore } from '../lib/store';
import { activeVehicle, addToCart, garage, saveVehicle, toast, ui } from '../state/app';
import { TierBadge } from '../components/bits';
import { VehiclePicker, isComplete } from '../components/VehiclePicker';

const PACKS: { id: Pack; name: string; blurb: string }[] = [
  { id: 'eco', name: 'Económico', blurb: 'Lo más barato con existencias' },
  { id: 'rec', name: 'Recomendado', blurb: 'Mejor índice de valor en cada pieza' },
  { id: 'pro', name: 'Premium', blurb: 'Alto desempeño u original' },
];

function Odometer({ km }: { km: number }) {
  return (
    <div className="inline-flex items-end gap-2" aria-label={`${fmtInt(km)} kilómetros`}>
      <div className="flex gap-[3px] rounded-md bg-ink p-1.5">
        {String(km)
          .padStart(6, '0')
          .split('')
          .map((d, i) => (
            <span
              key={i}
              className={`grid h-12 w-8 place-items-center rounded-sm font-mono text-3xl font-semibold ${i >= 4 ? 'bg-surface text-ink' : 'bg-bp text-bp-ink'}`}
            >
              {d}
            </span>
          ))}
      </div>
      <span className="pb-1 font-mono text-sm text-muted">km</span>
    </div>
  );
}

export function ServicePage() {
  useStore(garage);
  const active = activeVehicle();
  const [v, setV] = useState<VehicleSel>(active ? { makeId: active.makeId, year: active.year, modelId: active.modelId, engine: active.engine } : {});
  const [km, setKm] = useState<number | null>(null);
  const [pack, setPack] = useState<Pack>('rec');
  const [useBudget, setUseBudget] = useState(false);
  const [budget, setBudget] = useState(150);

  useEffect(() => {
    document.title = 'Plan de mantenimiento · Lenin Auto Cars';
  }, []);
  useEffect(() => {
    if (active) {
      setV({ makeId: active.makeId, year: active.year, modelId: active.modelId, engine: active.engine });
      setKm(null);
    }
  }, [active?.id]);

  const ready = isComplete(v);
  const { data: plan } = useApi<ServicePlan>(ready ? '/api/service-plan' : null, {
    ...vehicleParams(v),
    km: km ?? undefined,
    budget: useBudget ? budget : undefined,
    pack,
  });
  const shownKm = plan?.km ?? km ?? 60000;
  const later = new Set(plan?.budget?.later ?? []);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
      <p className="label-caps text-[11px] text-muted">Taller · plan de mantenimiento</p>
      <h1 className="mt-1 font-display text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[0.95] font-extrabold uppercase">Tu próximo servicio, armado solo</h1>
      <p className="mt-3 max-w-2xl text-ink-2">
        El servidor calcula qué toca según los intervalos de fábrica, elige piezas compatibles en tres paquetes y, si le das un presupuesto, resuelve una
        mochila 0/1 para decidir qué hacer hoy y qué puede esperar, con la seguridad primero.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5 rounded-xl border border-line bg-surface p-5">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Car size={16} /> Vehículo
            </p>
            <VehiclePicker idPrefix="svc" value={v} onChange={setV} compact />
            {ready && active?.modelId !== v.modelId && (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-link"
                onClick={() => {
                  saveVehicle({ makeId: v.makeId!, year: v.year!, modelId: v.modelId!, engine: v.engine });
                  toast('Vehículo guardado en tu garaje');
                }}
              >
                Guardar en mi garaje
              </button>
            )}
          </div>
          <div className="border-t border-line pt-5">
            <label htmlFor="svc-km" className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Gauge size={16} /> Kilometraje actual
            </label>
            <Odometer km={shownKm} />
            <input
              id="svc-km"
              type="range"
              min={10000}
              max={250000}
              step={10000}
              value={shownKm}
              onChange={(e) => setKm(Number(e.target.value))}
              className="mt-4 w-full accent-[var(--accent)]"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
              <span>10 000</span>
              <span>250 000</span>
            </div>
            {km === null && v.year && <p className="mt-2 text-xs text-muted">Estimado por antigüedad (15 000 km al año). Muévelo si conoces el real.</p>}
          </div>
          <div className="border-t border-line pt-5">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold" htmlFor="svc-use-budget">
              <input
                id="svc-use-budget"
                type="checkbox"
                checked={useBudget}
                onChange={(e) => setUseBudget(e.target.checked)}
                className="size-4 accent-[var(--ink)]"
              />
              <Wallet size={16} /> Tengo un presupuesto
            </label>
            {useBudget && (
              <div className="mt-3">
                <label htmlFor="svc-budget" className="tabular font-display text-3xl font-bold">
                  {fmtMoney(budget)}
                </label>
                <input
                  id="svc-budget"
                  type="range"
                  min={40}
                  max={600}
                  step={10}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="mt-2 w-full accent-[var(--accent)]"
                />
                {plan?.budget && (
                  <p className="mt-2 text-sm text-muted">
                    Hoy: <b className="text-ink">{fmtMoney(plan.budget.total)}</b> · importancia cubierta{' '}
                    <b className="tabular text-ink">
                      {plan.budget.priority_kept}/{plan.budget.priority_total}
                    </b>
                    {plan.budget.later.length > 0 && ` · ${plan.budget.later.length} tareas pueden esperar`}
                  </p>
                )}
              </div>
            )}
          </div>
          {plan && (
            <div className="border-t border-line pt-5">
              <p className="text-sm font-semibold">Próximos servicios</p>
              <ol className="mt-3 space-y-1.5">
                {plan.milestones.map((m) => (
                  <li key={m.km}>
                    <button
                      type="button"
                      onClick={() => setKm(m.km)}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm ${m.km === plan.km ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-surface-2'}`}
                    >
                      <span className="tabular w-20 font-mono text-xs">{fmtInt(m.km)}</span>
                      <span className="flex flex-1 flex-wrap gap-1">
                        {m.tasks.length > 2 ? (
                          <>
                            <span className="rounded-sm bg-ink px-1.5 text-[11px] text-surface">{m.tasks.length} tareas</span>
                            {m.tasks.includes('Kit de distribución') && (
                              <span className="rounded-sm bg-danger px-1.5 text-[11px] text-surface">distribución</span>
                            )}
                            {m.tasks.includes('Bujía') && <span className="rounded-sm border border-line-strong px-1.5 text-[11px]">bujías</span>}
                          </>
                        ) : (
                          <span className="text-[12px] text-muted">Aceite y filtro</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="min-w-0">
          {!ready || !plan ? (
            <div className="bp-paper grid h-full min-h-[320px] place-items-center rounded-xl p-8 text-center">
              <div>
                <p className="font-display text-3xl font-bold uppercase">{ready ? 'Calculando…' : 'Elige marca, año y modelo'}</p>
                <p className="mt-2 text-bp-dim">El plan aparece aquí con las piezas exactas para tu motor.</p>
                {!active && !ready && (
                  <button
                    type="button"
                    className="mt-4 rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
                    onClick={() => ui.set((u) => ({ ...u, garage: true }))}
                  >
                    Abrir mi garaje
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Paquete">
                {PACKS.map((pk) => (
                  <button
                    key={pk.id}
                    type="button"
                    role="radio"
                    aria-checked={pack === pk.id}
                    onClick={() => setPack(pk.id)}
                    className={`rounded-xl border-2 p-4 text-left transition ${pack === pk.id ? 'border-ink bg-surface shadow-card' : 'border-line bg-surface hover:border-line-strong'}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-display text-xl font-bold uppercase">{pk.name}</span>
                      {pack === pk.id && <Check size={16} />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{pk.blurb}</span>
                    <span className="tabular mt-3 block font-display text-3xl font-bold">{fmtMoney(plan.totals[pk.id])}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-3">
                  <p className="text-sm">
                    Servicio de <b className="tabular">{fmtInt(plan.km)} km</b> · {plan.vehicle}
                    {plan.engine && <span className="text-muted"> · {plan.engine}</span>}
                  </p>
                  <p className="text-xs text-muted">{plan.lines.length} tareas</p>
                </div>
                <ul className="divide-y divide-line">
                  {plan.lines.map((l) => {
                    const p = l.picks[pack];
                    const wait = later.has(l.part_type_id);
                    return (
                      <li key={l.part_type_id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 ${wait ? 'opacity-55' : ''}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {l.name}
                            {l.position && <span className="font-normal text-muted"> · {l.position}</span>}
                            {l.qty > 1 && <span className="ml-1 font-mono text-xs text-muted">× {l.qty}</span>}
                            {wait && <span className="ml-2 rounded-sm bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">puede esperar</span>}
                          </p>
                          <p className="text-xs text-muted">
                            Cada {fmtInt(l.every)} km · {l.why} · prioridad {l.priority}/10
                          </p>
                          <a
                            href={href(`/p/${p.id}`)}
                            onClick={linkClick(`/p/${p.id}`)}
                            className="mt-1 inline-flex max-w-full items-center gap-2 text-xs hover:text-link"
                          >
                            <b className="uppercase">{p.brand.name}</b>
                            <span className="font-mono">{p.part_number}</span>
                            <TierBadge tier={p.tier} />
                            {p.variant && <span className="truncate text-muted">{p.variant}</span>}
                          </a>
                        </div>
                        <span className="tabular font-display text-xl font-bold">{fmtMoney(l.cost[pack])}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-4">
                  <p>
                    {plan.budget ? 'Lo que conviene hacer hoy' : `Total paquete ${PACKS.find((x) => x.id === pack)!.name.toLowerCase()}`}:{' '}
                    <b className="tabular font-display text-2xl">{fmtMoney(plan.budget ? plan.budget.total : plan.totals[pack])}</b>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      for (const l of plan.lines) if (!later.has(l.part_type_id)) addToCart(l.picks[pack].id, l.qty);
                      toast(`Servicio de ${fmtInt(plan.km)} km agregado al carrito`);
                      ui.set((u) => ({ ...u, cart: true }));
                    }}
                    className="h-11 rounded-md bg-accent px-5 font-semibold text-accent-ink hover:brightness-95"
                  >
                    Agregar al carrito
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
