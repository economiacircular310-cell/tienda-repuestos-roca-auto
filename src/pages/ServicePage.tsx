import { Car, Check, Gauge } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BRAND_BY_ID } from '../data/catalog';
import type { VehicleQuery } from '../data/types';
import { engineLabel, vehicleLabel } from '../data/vehicles';
import { fmtInt, fmtMoney } from '../config';
import { href, linkClick } from '../lib/router';
import { useStore } from '../lib/store';
import { defaultKm, milestones, planService, type PackId } from '../lib/service';
import { activeVehicle, addToCart, garage, saveVehicle, toast, ui } from '../state/app';
import { TierBadge } from '../components/bits';
import { VehiclePicker, isComplete } from '../components/VehiclePicker';

const PACKS: { id: PackId; name: string; blurb: string }[] = [
  { id: 'eco', name: 'Económico', blurb: 'Lo más barato con existencias' },
  { id: 'rec', name: 'Recomendado', blurb: 'Mejor índice de valor en cada pieza' },
  { id: 'pro', name: 'Premium', blurb: 'Alto desempeño u original' },
];

/** Odómetro: 6 dígitos mecánicos, el guiño del plan de mantenimiento. */
function Odometer({ km }: { km: number }) {
  const digits = String(km).padStart(6, '0').split('');
  return (
    <div className="inline-flex items-end gap-2" aria-label={`${fmtInt(km)} kilómetros`}>
      <div className="flex gap-[3px] rounded-md bg-ink p-1.5">
        {digits.map((d, i) => (
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
  const [v, setV] = useState<VehicleQuery>(active ? { makeId: active.makeId, year: active.year, modelId: active.modelId, engine: active.engine } : {});
  const [km, setKm] = useState(defaultKm(active?.year));
  const [pack, setPack] = useState<PackId>('rec');

  useEffect(() => {
    document.title = 'Plan de mantenimiento · Lenin Auto Cars';
  }, []);
  useEffect(() => {
    if (active) {
      setV({ makeId: active.makeId, year: active.year, modelId: active.modelId, engine: active.engine });
      setKm(defaultKm(active.year));
    }
  }, [active?.id]);

  const ready = isComplete(v);
  const plan = useMemo(() => (ready ? planService(v, km) : null), [ready, v.makeId, v.year, v.modelId, v.engine, km]);
  const next = useMemo(() => milestones(km, 8), [km]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
      <p className="label-caps text-[11px] text-muted">Taller · plan de mantenimiento</p>
      <h1 className="mt-1 font-display text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[0.95] font-extrabold uppercase">Tu próximo servicio, armado solo</h1>
      <p className="mt-3 max-w-2xl text-ink-2">
        Dinos el vehículo y el kilometraje. Calculamos qué toca cambiar según los intervalos de fábrica, elegimos las piezas compatibles y te damos tres
        paquetes con precio cerrado.
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
            <Odometer km={plan?.km ?? km} />
            <input
              id="svc-km"
              type="range"
              min={10000}
              max={250000}
              step={10000}
              value={km}
              onChange={(e) => setKm(Number(e.target.value))}
              className="mt-4 w-full accent-[var(--accent)]"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
              <span>10 000</span>
              <span>250 000</span>
            </div>
            {v.year && <p className="mt-2 text-xs text-muted">Sugerido por antigüedad: {fmtInt(defaultKm(v.year))} km (15 000 km al año).</p>}
          </div>
          <div className="border-t border-line pt-5">
            <p className="text-sm font-semibold">Próximos servicios</p>
            <ol className="mt-3 space-y-1.5">
              {next.map((m) => (
                <li key={m.km}>
                  <button
                    type="button"
                    onClick={() => setKm(m.km)}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm ${m.km === plan?.km ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-surface-2'}`}
                  >
                    <span className="tabular w-20 font-mono text-xs">{fmtInt(m.km)}</span>
                    <span className="flex flex-1 flex-wrap gap-1">
                      {m.tasks.length > 2 ? (
                        <>
                          <span className="rounded-sm bg-ink px-1.5 text-[11px] text-surface">{m.tasks.length} tareas</span>
                          {m.tasks.some((t) => t.pt === 'kit-distribucion') && (
                            <span className="rounded-sm bg-danger px-1.5 text-[11px] text-surface">distribución</span>
                          )}
                          {m.tasks.some((t) => t.pt === 'bujia') && <span className="rounded-sm border border-line-strong px-1.5 text-[11px]">bujías</span>}
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
        </div>

        <div className="min-w-0">
          {!plan ? (
            <div className="bp-paper grid h-full min-h-[320px] place-items-center rounded-xl p-8 text-center">
              <div>
                <p className="font-display text-3xl font-bold uppercase">Elige marca, año y modelo</p>
                <p className="mt-2 text-bp-dim">El plan aparece aquí con las piezas exactas para tu motor.</p>
                {!active && (
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
                    Servicio de <b className="tabular">{fmtInt(plan.km)} km</b> · {vehicleLabel(v, { engine: false })}
                    {plan.engine && <span className="text-muted"> · {engineLabel(plan.engine)}</span>}
                  </p>
                  <p className="text-xs text-muted">{plan.lines.length} tareas</p>
                </div>
                <ul className="divide-y divide-line">
                  {plan.lines.map((l) => {
                    const p = l.picks[pack];
                    return (
                      <li key={l.task.pt} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {l.name}
                            {l.task.position && <span className="font-normal text-muted"> · {l.task.position}</span>}
                            {l.qty > 1 && <span className="ml-1 font-mono text-xs text-muted">× {l.qty}</span>}
                          </p>
                          <p className="text-xs text-muted">
                            Cada {fmtInt(l.task.every)} km · {l.task.why}
                          </p>
                          {p && (
                            <a
                              href={href(`/p/${p.id}`)}
                              onClick={linkClick(`/p/${p.id}`)}
                              className="mt-1 inline-flex max-w-full items-center gap-2 text-xs hover:text-link"
                            >
                              <b className="uppercase">{BRAND_BY_ID.get(p.brandId)!.name}</b>
                              <span className="font-mono">{p.partNumber}</span>
                              <TierBadge tier={p.tier} />
                              {p.variant && <span className="truncate text-muted">{p.variant}</span>}
                            </a>
                          )}
                        </div>
                        <span className="tabular font-display text-xl font-bold">{p ? fmtMoney(p.price * l.qty) : '—'}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-4">
                  <p>
                    Total paquete {PACKS.find((x) => x.id === pack)!.name.toLowerCase()}:{' '}
                    <b className="tabular font-display text-2xl">{fmtMoney(plan.totals[pack])}</b>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      for (const l of plan.lines) if (l.picks[pack]) addToCart(l.picks[pack]!.id, l.qty);
                      toast(`Paquete de ${fmtInt(plan.km)} km agregado al carrito`);
                      ui.set((u) => ({ ...u, cart: true }));
                    }}
                    className="h-11 rounded-md bg-accent px-5 font-semibold text-accent-ink hover:brightness-95"
                  >
                    Agregar paquete al carrito
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
