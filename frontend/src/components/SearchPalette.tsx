import { ArrowRight, Clock, CornerDownLeft, Mic, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../api/client';
import { useMeta, vehicleLabel, vehicleParams } from '../api/meta';
import type { Chip, SearchResult } from '../api/types';
import { fmtInt, fmtMoney } from '../config';
import { navigate, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { activeVehicle, garage, pushRecent, recent, ui } from '../state/app';
import { Highlight, Kbd, TierBadge } from './bits';
import { DiagnosisPanel } from './Diagnosis';
import { PartGlyph } from './PartGlyph';

export const CHIP_STYLE: Record<Chip['kind'], { tag: string; cls: string }> = {
  vehicle: { tag: 'Vehículo', cls: 'border-ok/40 bg-ok-soft text-ok' },
  engine: { tag: 'Motor', cls: 'border-ok/40 bg-ok-soft text-ok' },
  fuel: { tag: 'Combustible', cls: 'border-ok/40 bg-ok-soft text-ok' },
  partType: { tag: 'Pieza', cls: 'border-ink/30 bg-surface-2 text-ink' },
  category: { tag: 'Categoría', cls: 'border-ink/30 bg-surface-2 text-ink' },
  brand: { tag: 'Marca', cls: 'border-link/40 bg-surface-2 text-link' },
  position: { tag: 'Posición', cls: 'border-accent bg-accent-soft text-ink' },
  tier: { tag: 'Nivel', cls: 'border-accent bg-accent-soft text-ink' },
  price: { tag: 'Precio', cls: 'border-accent bg-accent-soft text-ink' },
  partNumber: { tag: 'N.º parte', cls: 'border-ink bg-ink text-surface font-mono' },
  symptom: { tag: 'Síntoma', cls: 'border-danger/50 bg-warn-soft text-danger' },
};

export function ChipView({ chip, onRemove }: { chip: Pick<Chip, 'kind' | 'label' | 'corrected'>; onRemove?: () => void }) {
  const st = CHIP_STYLE[chip.kind];
  return (
    <span className={`anim-pop inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 text-[12px] font-medium ${st.cls}`}>
      <span className="label-caps text-[9px] opacity-70">{st.tag}</span>
      <span className="truncate">{chip.label}</span>
      {chip.corrected && <Sparkles size={11} aria-label="corregido" />}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-ink/10" aria-label={`Quitar ${chip.label}`}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

const TRY = [
  'pastillas delanteras corolla 2016 menos de 60',
  'me chilla y vibra al frenar versa 2014',
  'toyta corrola balatas',
  'amortiwador trasero hilux 2.8',
  'bomba de agua g4fc',
  'faro izquierdo original versa',
];

type Item =
  | { kind: 'suggest'; text: string }
  | { kind: 'pt'; value: string; label: string; count: number }
  | { kind: 'product'; n: number }
  | { kind: 'all' }
  | { kind: 'recent'; text: string }
  | { kind: 'try'; text: string }
  | { kind: 'cat'; id: string };

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
};

export function SearchPalette() {
  const { palette, paletteSeed } = useStore(ui);
  const recents = useStore(recent);
  useStore(garage);
  const meta = useMeta();
  const vehicle = activeVehicle();
  const [q, setQ] = useState('');
  const [fitOnly, setFitOnly] = useState(true);
  const [sel, setSel] = useState(0);
  const [moved, setMoved] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (palette) {
      returnFocus.current = document.activeElement;
      setQ(paletteSeed);
      setVoiceError('');
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      (returnFocus.current as HTMLElement | null)?.focus?.();
    }
  }, [palette, paletteSeed]);

  const { data } = useApi<SearchResult>(palette && q.trim() ? '/api/search' : null, { q, ...vehicleParams(vehicle), fit: fitOnly, size: 6 });
  const res = q.trim() ? data : null;

  const items: Item[] = useMemo(() => {
    if (!q.trim()) {
      return [
        ...recents.map((text) => ({ kind: 'recent' as const, text })),
        ...TRY.map((text) => ({ kind: 'try' as const, text })),
        ...(meta?.categories ?? []).slice(0, 6).map((c) => ({ kind: 'cat' as const, id: c.id })),
      ];
    }
    if (!res) return [];
    const askedType = res.chips.some((c) => c.kind === 'partType') || !!res.diagnosis;
    const pts = askedType ? [] : res.facets.partType.filter((f) => f.count > 0 && !f.selected).slice(0, 4);
    return [
      ...res.suggestions.slice(0, 4).map((text) => ({ kind: 'suggest' as const, text })),
      ...pts.map((f) => ({ kind: 'pt' as const, value: f.value, label: f.label, count: f.count })),
      ...res.items.map((_, n) => ({ kind: 'product' as const, n })),
      ...(res.total ? [{ kind: 'all' as const }] : []),
    ];
  }, [q, res, recents, meta]);

  useEffect(() => {
    setSel(0);
    setMoved(false);
  }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!palette) return null;

  const close = () => ui.set((u) => ({ ...u, palette: false }));
  const goAll = (query: string, extra: Record<string, string> = {}) => {
    pushRecent(query);
    close();
    navigate(searchUrl(query, { ...extra, ...(fitOnly ? {} : { fit: '0' }) }));
  };
  const activate = (it: Item | undefined) => {
    if (!it) return goAll(q);
    switch (it.kind) {
      case 'suggest':
      case 'recent':
      case 'try':
        setQ(it.text);
        inputRef.current?.focus();
        return;
      case 'pt':
        return goAll(q, { pt: it.value });
      case 'product':
        pushRecent(q);
        close();
        return navigate(`/p/${res!.items[it.n].product.id}`);
      case 'cat':
        close();
        return navigate(searchUrl('', { cat: it.id }));
      case 'all':
        return goAll(q);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setMoved(true);
      setSel((s) => (e.key === 'ArrowDown' ? Math.min(items.length - 1, s + 1) : Math.max(0, s - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[sel];
      if (q.trim() && (!moved || !it)) goAll(q);
      else activate(it);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab' && items[sel]?.kind === 'suggest') {
      e.preventDefault();
      setQ(`${(items[sel] as { text: string }).text} `);
    }
  };

  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  const Speech = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const listen = () => {
    if (!Speech) return;
    try {
      const rec = new Speech();
      rec.lang = meta?.store.locale ?? 'es-419';
      rec.interimResults = true;
      rec.onresult = (e) => setQ(Array.from(e.results, (r) => r[0].transcript).join(''));
      rec.onerror = () => setVoiceError('No se pudo usar el micrófono. Revisa el permiso del navegador o escribe tu búsqueda.');
      rec.onend = () => setListening(false);
      setListening(true);
      setVoiceError('');
      rec.start();
    } catch {
      setListening(false);
      setVoiceError('Tu navegador no permite dictado por voz aquí.');
    }
  };

  let idx = -1;
  const row = (it: Item, content: React.ReactNode, key: string) => {
    idx++;
    const my = idx;
    return (
      <li key={key} role="option" aria-selected={sel === my} id={`pal-${my}`}>
        <button
          type="button"
          data-idx={my}
          onMouseMove={() => {
            if (sel !== my) setSel(my);
            setMoved(true);
          }}
          onClick={() => activate(it)}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${sel === my ? 'bg-surface-2 ring-1 ring-line-strong' : ''}`}
        >
          {content}
        </button>
      </li>
    );
  };
  const groupTitle = (t: string) => <li className="label-caps px-3 pt-3 pb-1 text-[10px] text-muted">{t}</li>;
  const of = <K extends Item['kind']>(k: K) => items.filter((i): i is Extract<Item, { kind: K }> => i.kind === k);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[max(env(safe-area-inset-top,0px),3vh)] pb-3 sm:pt-[8vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar repuestos"
    >
      <button type="button" className="absolute inset-0 bg-bp/70 backdrop-blur-[2px]" aria-label="Cerrar búsqueda" onClick={close} tabIndex={-1} />
      <div className="anim-pop relative flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={20} className="shrink-0 text-ink" />
          <input
            ref={inputRef}
            id="palette-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Pieza, vehículo, síntoma, n.º de parte u OEM… escribe como hablas"
            className="h-16 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items.length ? `pal-${sel}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Borrar texto">
              <X size={16} />
            </button>
          )}
          {Speech && (
            <button
              type="button"
              onClick={listen}
              className={`rounded-md p-2 ${listening ? 'bg-danger text-surface' : 'text-ink-2 hover:bg-surface-2'}`}
              aria-label="Buscar por voz"
            >
              <Mic size={18} />
            </button>
          )}
          <span className="hidden sm:block">
            <Kbd>Esc</Kbd>
          </span>
        </div>

        {res && (res.chips.length > 0 || res.vehicle_source === 'garage') && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface-2/60 px-4 py-2.5">
            <span className="label-caps mr-1 text-[10px] text-muted">Entendí</span>
            {res.vehicle_source === 'garage' && vehicle && (
              <ChipView chip={{ kind: 'vehicle', label: `${vehicleLabel(vehicle, false)} · garaje`, corrected: false }} />
            )}
            {res.chips.map((c, k) => (
              <ChipView key={`${c.kind}-${c.label}-${k}`} chip={c} onRemove={() => setQ(c.without)} />
            ))}
          </div>
        )}
        {voiceError && <p className="border-b border-line bg-warn-soft px-4 py-2 text-sm text-warn">{voiceError}</p>}

        <div ref={listRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2" id="palette-list">
          <ul role="listbox" aria-label="Resultados">
            {!q.trim() && (
              <>
                {recents.length > 0 && groupTitle('Búsquedas recientes')}
                {of('recent').map((it) =>
                  row(
                    it,
                    <>
                      <Clock size={15} className="text-muted" />
                      <span className="flex-1 truncate">{it.text}</span>
                    </>,
                    `r-${it.text}`,
                  ),
                )}
                {groupTitle('Prueba escribir así')}
                {of('try').map((it) =>
                  row(
                    it,
                    <>
                      <Sparkles size={15} className="text-muted" />
                      <span className="flex-1 truncate font-mono text-[13px]">{it.text}</span>
                      <ArrowRight size={14} className="text-muted" />
                    </>,
                    `t-${it.text}`,
                  ),
                )}
                {groupTitle('Categorías')}
                <li>
                  <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {of('cat').map((it) => {
                      const c = meta!.categories.find((x) => x.id === it.id)!;
                      return row(
                        it,
                        <>
                          <PartGlyph cat={c.id} className="size-7 shrink-0 text-link" />
                          <span className="truncate text-sm font-medium">{c.name}</span>
                        </>,
                        `c-${c.id}`,
                      );
                    })}
                  </ul>
                </li>
              </>
            )}

            {res && (
              <>
                {res.pn_match && (
                  <li className="mx-2 my-2 rounded-md border border-ink bg-ink px-3 py-2 text-sm text-surface">
                    {res.pn_match.kind === 'oem' ? 'Número OEM' : res.pn_match.kind === 'xref' ? 'Referencia cruzada' : 'Número de parte'}{' '}
                    <b className="font-mono">{res.pn_match.raw.toUpperCase()}</b> · {res.pn_match.count}{' '}
                    {res.pn_match.count === 1 ? 'pieza' : 'piezas equivalentes'}
                  </li>
                )}
                {res.diagnosis && (
                  <li className="px-2 py-2">
                    <DiagnosisPanel d={res.diagnosis} compact vehicleName={res.vehicle?.label} />
                  </li>
                )}
                {res.corrections.length > 0 && (
                  <li className="px-3 py-1.5 text-sm text-muted">
                    <Sparkles size={13} className="mr-1 inline text-warn" />
                    Entendí {res.corrections.map((c) => `«${c.written}» como «${c.understood}» (${c.channel})`).join(', ')}
                  </li>
                )}
                {of('suggest').length > 0 && groupTitle('Completar')}
                {of('suggest').map((it) =>
                  row(
                    it,
                    <>
                      <Search size={15} className="text-muted" />
                      <span className="flex-1 truncate">
                        <span className="text-muted">{q}</span>
                        <b>{it.text.slice(q.length)}</b>
                      </span>
                      <span className="hidden sm:block">
                        <Kbd>Tab</Kbd>
                      </span>
                    </>,
                    `s-${it.text}`,
                  ),
                )}
                {of('pt').length > 0 && groupTitle(res.vehicle && fitOnly ? 'Tipos de pieza compatibles' : 'Tipos de pieza')}
                {of('pt').map((it) =>
                  row(
                    it,
                    <>
                      <PartGlyph cat={meta?.part_types.find((p) => p.id === it.value)?.cat ?? 'motor'} pt={it.value} className="size-7 shrink-0 text-link" />
                      <span className="flex-1 truncate font-medium">{it.label}</span>
                      <span className="tabular text-xs text-muted">{fmtInt(it.count)}</span>
                    </>,
                    `p-${it.value}`,
                  ),
                )}
                {of('product').length > 0 && groupTitle('Productos')}
                {of('product').map((it) => {
                  const h = res.items[it.n];
                  const p = h.product;
                  return row(
                    it,
                    <>
                      <span className="bp-paper grid size-11 shrink-0 place-items-center rounded">
                        <PartGlyph cat={p.category.id} pt={p.part_type.id} className="size-8 text-bp-ink" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[11px] text-muted">
                          <b className="text-ink-2 uppercase">{p.brand.name}</b>
                          <span className="font-mono">{p.part_number}</span>
                          <TierBadge tier={p.tier} />
                        </span>
                        <span className="block truncate text-[14px]">
                          <Highlight text={p.title} marks={h.marks} />
                          {p.position && <span className="text-muted"> · {p.position}</span>}
                        </span>
                      </span>
                      <span className="tabular font-display text-lg font-bold">{fmtMoney(p.price)}</span>
                    </>,
                    `x-${p.id}`,
                  );
                })}
                {res.total > 0 &&
                  row(
                    { kind: 'all' },
                    <>
                      <span className="flex-1 font-semibold text-link">
                        {res.total === 1 ? 'Ver el resultado' : `Ver los ${fmtInt(res.total)} resultados`}
                        {res.vehicle && fitOnly ? (res.total === 1 ? ' compatible' : ' compatibles') : ''}
                      </span>
                      <CornerDownLeft size={15} className="text-muted" />
                    </>,
                    'all',
                  )}
                {res.total === 0 && (
                  <li className="px-4 py-8 text-center">
                    <p className="font-display text-2xl font-bold uppercase">Sin coincidencias</p>
                    <p className="mt-1 text-sm text-muted">
                      {res.hidden_by_fitment > 0
                        ? `Hay ${fmtInt(res.hidden_by_fitment)} piezas que no son para ${res.vehicle?.label ?? 'este vehículo'}.`
                        : 'Prueba con otra palabra, el número OEM o elige tu vehículo.'}
                    </p>
                    {res.hidden_by_fitment > 0 && (
                      <button type="button" className="mt-3 text-sm font-semibold text-link" onClick={() => setFitOnly(false)}>
                        Mostrar todas las piezas
                      </button>
                    )}
                  </li>
                )}
              </>
            )}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-muted">
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navegar
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>↵</Kbd> abrir
          </span>
          {vehicle && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input id="palette-fit" type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} className="accent-[var(--ok)]" />
              Solo compatibles con mi {vehicleLabel(vehicle, false)}
            </label>
          )}
          <span className="tabular ml-auto font-mono">{res ? `${fmtInt(res.total)} · ${res.took_ms.toFixed(1)} ms en el servidor` : ''}</span>
        </div>
      </div>
    </div>
  );
}
