import { ArrowRight, Car, CircleAlert, CircleCheck, Hash, Loader2, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { get } from '../api/client';
import { genFor, engineLabel, useMeta, vehicleLabel, type VehicleSel } from '../api/meta';
import type { Vin } from '../api/types';
import { navigate, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { garage, pushRecent, saveVehicle, toast } from '../state/app';
import { VehiclePicker, isComplete } from './VehiclePicker';

type Tab = 'vehiculo' | 'parte' | 'vin';
const cleanVin = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 17);

export function Finder({ samples }: { samples: { label: string; value: string; note: string }[] }) {
  const meta = useMeta();
  const [tab, setTab] = useState<Tab>('vehiculo');
  const g = useStore(garage);
  const active = g.vehicles.find((v) => v.id === g.activeId);
  const [v, setV] = useState<VehicleSel>(active ? { makeId: active.makeId, year: active.year, modelId: active.modelId, engine: active.engine } : {});
  const [pn, setPn] = useState('');
  const [vin, setVin] = useState('');
  const [vinRes, setVinRes] = useState<Vin | null>(null);
  const [busy, setBusy] = useState(false);

  const tabs: { id: Tab; label: string; short: string; icon: typeof Car }[] = [
    { id: 'vehiculo', label: 'Por vehículo', short: 'Vehículo', icon: Car },
    { id: 'parte', label: 'N.º de parte u OEM', short: 'N.º de parte', icon: Hash },
    { id: 'vin', label: 'Por VIN', short: 'VIN', icon: ScanLine },
  ];

  const goVehicle = (sel: VehicleSel) => {
    if (!isComplete(sel)) return;
    const saved = saveVehicle({ makeId: sel.makeId!, modelId: sel.modelId!, year: sel.year!, engine: sel.engine });
    toast(`Comprando para tu ${vehicleLabel(saved, false)}`);
    navigate(searchUrl(''));
  };

  return (
    <div className="rounded-xl border border-bp-grid bg-bp/80 p-4 shadow-float backdrop-blur-sm sm:p-5">
      <div role="tablist" aria-label="Forma de búsqueda" className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-bp-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`finder-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`finder-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[13px] font-semibold transition ${
              tab === t.id ? 'bg-accent text-accent-ink' : 'text-bp-dim hover:text-bp-ink'
            }`}
          >
            <t.icon size={15} className="hidden shrink-0 sm:block" />
            <span className="truncate sm:hidden">{t.short}</span>
            <span className="hidden truncate sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'vehiculo' && (
        <form
          id="finder-panel-vehiculo"
          role="tabpanel"
          aria-labelledby="finder-tab-vehiculo"
          onSubmit={(e) => {
            e.preventDefault();
            goVehicle(v);
          }}
        >
          <VehiclePicker idPrefix="hero" value={v} onChange={setV} dark compact />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!isComplete(v)}
              className="inline-flex h-12 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-accent-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ver piezas compatibles <ArrowRight size={17} />
            </button>
            <p className="text-[13px] text-bp-dim">
              {isComplete(v)
                ? `${v.engine ? engineLabel(v.engine) : 'Todos los motores'} · generación ${genFor(v.modelId!, v.year!)?.code ?? ''}`
                : 'Guardamos tu vehículo y filtramos todo el catálogo por compatibilidad.'}
            </p>
          </div>
        </form>
      )}

      {tab === 'parte' && (
        <form
          id="finder-panel-parte"
          role="tabpanel"
          aria-labelledby="finder-tab-parte"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pn.trim()) return;
            pushRecent(pn);
            navigate(searchUrl(pn, { fit: '0' }));
          }}
        >
          <label htmlFor="finder-pn" className="label-caps mb-1 block text-[10px] text-bp-dim">
            Número de parte, OEM o de otra marca
          </label>
          <div className="flex gap-2">
            <input
              id="finder-pn"
              value={pn}
              onChange={(e) => setPn(e.target.value)}
              placeholder="Ej. 04465-02220, P 83 140…"
              className="h-12 min-w-0 flex-1 rounded-md border border-bp-grid bg-bp-2 px-3 font-mono text-[15px] text-bp-ink uppercase outline-none placeholder:text-bp-dim placeholder:normal-case focus:border-accent"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="h-12 rounded-md bg-accent px-5 font-semibold text-accent-ink hover:brightness-95">
              Buscar
            </button>
          </div>
          <p className="mt-3 text-[13px] text-bp-dim">Guiones, espacios y mayúsculas dan igual. Prueba:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {samples.map((ex) => (
              <li key={ex.value}>
                <button
                  type="button"
                  onClick={() => setPn(ex.value)}
                  className="rounded-md border border-bp-grid px-2.5 py-1.5 text-left transition hover:border-accent"
                  title={ex.note}
                >
                  <span className="label-caps block text-[9px] text-bp-dim">{ex.label}</span>
                  <span className="font-mono text-[13px] text-bp-ink">{ex.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </form>
      )}

      {tab === 'vin' && (
        <form
          id="finder-panel-vin"
          role="tabpanel"
          aria-labelledby="finder-tab-vin"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            get<Vin>(`/api/vin/${cleanVin(vin)}`, { online: true })
              .then(setVinRes)
              .catch(() => toast('No se pudo decodificar el VIN. Revisa la conexión.', 'info'))
              .finally(() => setBusy(false));
          }}
        >
          <label htmlFor="finder-vin" className="label-caps mb-1 flex justify-between text-[10px] text-bp-dim">
            <span>VIN · 17 caracteres (tarjeta de circulación o parabrisas)</span>
            <span className={`tabular ${cleanVin(vin).length === 17 ? 'text-accent' : ''}`}>{cleanVin(vin).length}/17</span>
          </label>
          <div className="flex gap-2">
            <input
              id="finder-vin"
              value={vin}
              onChange={(e) => {
                setVin(cleanVin(e.target.value));
                setVinRes(null);
              }}
              placeholder="Ej. 2T1BURHE3GC741258"
              maxLength={24}
              className="h-12 min-w-0 flex-1 rounded-md border border-bp-grid bg-bp-2 px-3 font-mono text-[15px] tracking-[0.12em] text-bp-ink uppercase outline-none placeholder:tracking-normal placeholder:text-bp-dim placeholder:normal-case focus:border-accent"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={cleanVin(vin).length !== 17 || busy}
              className="h-12 rounded-md bg-accent px-5 font-semibold text-accent-ink hover:brightness-95 disabled:opacity-40"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : 'Decodificar'}
            </button>
          </div>
          {vinRes && !vinRes.valid && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-accent">
              <CircleAlert size={14} /> {vinRes.error}
            </p>
          )}
          {!vinRes && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-bp-dim">
              Ejemplos:
              {meta?.sample_vins.map((s) => (
                <button
                  key={s.vin}
                  type="button"
                  onClick={() => setVin(s.vin)}
                  className="rounded border border-bp-grid px-2 py-1 font-mono text-[12px] text-bp-ink hover:border-accent"
                  title={s.label}
                >
                  {s.vin}
                </button>
              ))}
            </div>
          )}
          {vinRes?.valid && (
            <div className="mt-4 rounded-lg border border-bp-grid bg-bp-2 p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
                {[
                  ['Fabricante', vinRes.make ?? 'No identificado'],
                  ['Año modelo', vinRes.year ?? '—'],
                  ['Modelo', vinRes.model ?? 'Elígelo abajo'],
                  ['Origen', vinRes.region ?? '—'],
                ].map(([k, val]) => (
                  <div key={k}>
                    <dt className="label-caps text-[9px] text-bp-dim">{k}</dt>
                    <dd className="font-semibold">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-bp-dim">
                {vinRes.check_ok ? <CircleCheck size={13} className="text-accent" /> : <CircleAlert size={13} />}
                {vinRes.check_ok ? 'Dígito verificador correcto (ISO 3779).' : 'Dígito verificador no coincide (normal en VIN fuera de Norteamérica).'}
                {vinRes.online === 'fail' && ' Sin conexión con la NHTSA: decodificado localmente.'}
              </p>
              <button
                type="button"
                disabled={!vinRes.make_id}
                onClick={() => {
                  const sel = {
                    makeId: vinRes.make_id ?? undefined,
                    year: vinRes.year ?? undefined,
                    modelId: vinRes.model_id ?? undefined,
                    engine: vinRes.engine ?? undefined,
                  };
                  if (isComplete(sel)) goVehicle(sel);
                  else {
                    setV({ makeId: sel.makeId, year: sel.year });
                    setTab('vehiculo');
                  }
                }}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-40"
              >
                {vinRes.model_id ? 'Ver piezas para este vehículo' : 'Completar modelo y motor'} <ArrowRight size={15} />
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
