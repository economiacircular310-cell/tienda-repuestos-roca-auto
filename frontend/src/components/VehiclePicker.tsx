import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { enginesFor, engineLabel, modelsOfMakeYear, useMeta, yearsOfMake, type VehicleSel } from '../api/meta';

function Field(props: {
  id: string;
  label: string;
  step: number;
  value: string;
  disabled?: boolean;
  dark?: boolean;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const { id, label, step, value, disabled, dark, onChange, children } = props;
  return (
    <label htmlFor={id} className={`relative block min-w-0 ${disabled ? 'opacity-50' : ''}`}>
      <span className={`label-caps mb-1 flex items-center gap-1.5 text-[10px] ${dark ? 'text-bp-dim' : 'text-muted'}`}>
        <span
          className={`inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold ${
            value ? 'bg-accent text-accent-ink' : dark ? 'border border-bp-dim text-bp-dim' : 'border border-line-strong'
          }`}
        >
          {step}
        </span>
        {label}
      </span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border pr-8 pl-3 text-[15px] font-medium transition outline-none focus:border-link focus:ring-2 focus:ring-link-a30 disabled:cursor-not-allowed ${
          dark ? 'border-bp-grid bg-bp-2 text-bp-ink' : 'border-line-strong bg-surface text-ink'
        }`}
      >
        {children}
      </select>
      <ChevronDown size={16} className={`pointer-events-none absolute right-2.5 bottom-3.5 ${dark ? 'text-bp-dim' : 'text-muted'}`} />
    </label>
  );
}

export function VehiclePicker({
  value,
  onChange,
  idPrefix,
  dark,
  compact,
}: {
  value: VehicleSel;
  onChange: (v: VehicleSel) => void;
  idPrefix: string;
  dark?: boolean;
  compact?: boolean;
}) {
  const meta = useMeta();
  if (!meta) return null;
  const years = value.makeId ? yearsOfMake(value.makeId) : [];
  const models = value.makeId && value.year ? modelsOfMakeYear(value.makeId, value.year) : [];
  const engines = value.modelId && value.year ? enginesFor(value.modelId, value.year) : [];
  const setModel = (modelId: string) => {
    const eng = modelId && value.year ? enginesFor(modelId, value.year) : [];
    onChange({ ...value, modelId: modelId || undefined, engine: eng.length === 1 ? eng[0] : undefined });
  };
  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
      <Field id={`${idPrefix}-make`} label="Marca" step={1} value={value.makeId ?? ''} dark={dark} onChange={(v) => onChange({ makeId: v || undefined })}>
        <option value="">Elige marca</option>
        {meta.makes.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Field>
      <Field
        id={`${idPrefix}-year`}
        label="Año"
        step={2}
        value={value.year ? String(value.year) : ''}
        disabled={!value.makeId}
        dark={dark}
        onChange={(v) => onChange({ makeId: value.makeId, year: v ? Number(v) : undefined })}
      >
        <option value="">Año</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Field>
      <Field id={`${idPrefix}-model`} label="Modelo" step={3} value={value.modelId ?? ''} disabled={!value.year} dark={dark} onChange={setModel}>
        <option value="">Modelo</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Field>
      <Field
        id={`${idPrefix}-engine`}
        label="Motor"
        step={4}
        value={value.engine ?? ''}
        disabled={!value.modelId}
        dark={dark}
        onChange={(v) => onChange({ ...value, engine: v || undefined })}
      >
        <option value="">{engines.length ? 'Todos los motores' : 'Motor'}</option>
        {engines.map((e) => (
          <option key={e} value={e}>
            {engineLabel(e)}
          </option>
        ))}
      </Field>
    </div>
  );
}

export const isComplete = (v: VehicleSel) => !!(v.makeId && v.year && v.modelId);
