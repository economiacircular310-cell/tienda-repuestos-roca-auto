import { ArrowRight, Clock, CornerDownLeft, Mic, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND_BY_ID, CATEGORIES, PART_TYPE_BY_ID } from '../data/catalog';
import { getInventory } from '../data/inventory';
import { vehicleLabel } from '../data/vehicles';
import { fmtMoney, fmtInt } from '../config';
import { navigate, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { removeSpans, type Chip } from '../search/parser';
import { useSearch } from '../search/client';
import { activeVehicle, garage, pushRecent, recent, ui } from '../state/app';
import { Highlight, Kbd, TierBadge } from './bits';
import { PartGlyph } from './PartGlyph';
import { DiagnosisPanel } from './Diagnosis';

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

export function ChipView({ chip, onRemove }: { chip: Chip; onRemove?: () => void }) {
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
  'chilla al frenar versa 2015',
  'toyta corrola balatas',
  'amortiguador trasero hilux 2.8 diésel',
  'bomba de agua g4fc',
  'faro izquierdo original versa',
  'aceite 5w-30 sintético',
];

type Item =
  | { kind: 'suggest'; text: string }
  | { kind: 'pt'; value: string; label: string; count: number }
  | { kind: 'product'; i: number }
  | { kind: 'all' }
  | { kind: 'recent'; text: string }
  | { kind: 'try'; text: string }
  | { kind: 'cat'; id: string };

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: { 0: { transcript: string }; isFinal: boolean }[] & { length: number } }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export function SearchPalette() {
  const { palette, paletteSeed } = useStore(ui);
  const recents = useStore(recent);
  useStore(garage);
  const vehicle = activeVehicle();
  const [q, setQ] = useState('');
  const [fitOnly, setFitOnly] = useState(true);
  const [sel, setSel] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (palette) {
      returnFocus.current = document.activeElement;
      setQ(paletteSeed);
      setSel(0);
      setVoiceError('');
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      (returnFocus.current as HTMLElement | null)?.focus?.();
    }
  }, [palette, paletteSeed]);

  const { data, loading } = useSearch(palette && q.trim() ? { q, vehicle, fitOnly, pageSize: 6 } : null);
  const res = q.trim() ? data : null;
  const [moved, setMoved] = useState(false);
  const products = getInventory();

  const items: Item[] = useMemo(() => {
    if (!q.trim()) {
      return [
        ...recents.map((text) => ({ kind: 'recent' as const, text })),
        ...TRY.map((text) => ({ kind: 'try' as const, text })),
        ...CATEGORIES.slice(0, 6).map((c) => ({ kind: 'cat' as const, id: c.id })),
      ];
    }
    if (!res) return [];
    const askedType = res.chips.some((c) => c.kind === 'partType') || !!res.diagnosis;
    const pts = askedType ? [] : res.facets.partType.filter((f) => f.count > 0 && !f.selected).slice(0, 4);
    return [
      ...res.suggestions.slice(0, 4).map((text) => ({ kind: 'suggest' as const, text })),
      ...pts.map((f) => ({ kind: 'pt' as const, value: f.value, label: f.label, count: f.count })),
      ...res.items.map((h) => ({ kind: 'product' as const, i: h.i })),
      ...(res.total ? [{ kind: 'all' as const }] : []),
    ];
  }, [q, res, recents]);

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
        return navigate(`/p/${products[it.i].id}`);
      case 'cat':
        close();
        return navigate(searchUrl('', { cat: it.id }));
      case 'all':
        return goAll(q);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMoved(true);
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMoved(true);
      setSel((s) => Math.max(0, s - 1));
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
      setQ((items[sel] as { text: string }).text + ' ');
    }
  };

  const Speech =
    (window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;
  const listen = () => {
    if (!Speech) return;
    try {
      const rec = new Speech();
      rec.lang = 'es-419';
      rec.interimResults = true;
      rec.onresult = (e) => {
        let text = '';
        for (let k = 0; k < e.results.length; k++) text += e.results[k][0].transcript;
        setQ(text);
      };
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

  const removeChip = (c: Chip) => setQ(removeSpans(q, c.spans));
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
  const suggestions = items.filter((i) => i.kind === 'suggest');
  const pts = items.filter((i) => i.kind === 'pt');
  const prods = items.filter((i) => i.kind === 'product');

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
            placeholder="Pieza, vehículo, n.º de parte, OEM… escribe como hablas"
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
              title="Buscar por voz"
            >
              <Mic size={18} />
            </button>
          )}
          <span className="hidden sm:block">
            <Kbd>Esc</Kbd>
          </span>
        </div>

        {(res?.chips.length || (vehicle && res?.vehicleSource === 'garage')) && q.trim() ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface-2/60 px-4 py-2.5">
            <span className="label-caps mr-1 text-[10px] text-muted">Entendí</span>
            {res?.vehicleSource === 'garage' && vehicle && (
              <ChipView chip={{ kind: 'vehicle', label: `${vehicleLabel(vehicle, { engine: false })} · garaje`, spans: [] }} />
            )}
            {res?.chips.map((c, k) => (
              <ChipView key={`${c.kind}-${c.label}-${k}`} chip={c} onRemove={() => removeChip(c)} />
            ))}
          </div>
        ) : null}
        {voiceError && <p className="border-b border-line bg-warn-soft px-4 py-2 text-sm text-warn">{voiceError}</p>}

        <div ref={listRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2" id="palette-list">
          <ul role="listbox" aria-label="Resultados">
            {!q.trim() && (
              <>
                {recents.length > 0 && groupTitle('Búsquedas recientes')}
                {items
                  .filter((i) => i.kind === 'recent')
                  .map((it) =>
                    row(
                      it,
                      <>
                        <Clock size={15} className="text-muted" />
                        <span className="flex-1 truncate">{(it as { text: string }).text}</span>
                      </>,
                      `r-${(it as { text: string }).text}`,
                    ),
                  )}
                {groupTitle('Prueba escribir así')}
                {items
                  .filter((i) => i.kind === 'try')
                  .map((it) =>
                    row(
                      it,
                      <>
                        <Sparkles size={15} className="text-muted" />
                        <span className="flex-1 truncate font-mono text-[13px]">{(it as { text: string }).text}</span>
                        <ArrowRight size={14} className="text-muted" />
                      </>,
                      `t-${(it as { text: string }).text}`,
                    ),
                  )}
                {groupTitle('Categorías')}
                <li>
                  <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {items
                      .filter((i) => i.kind === 'cat')
                      .map((it) => {
                        const c = CATEGORIES.find((x) => x.id === (it as { id: string }).id)!;
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

            {q.trim() && res && (
              <>
                {res.pnMatch && (
                  <li className="mx-2 my-2 rounded-md border border-ink bg-ink px-3 py-2 text-sm text-surface">
                    {res.pnMatch.kind === 'oem' ? 'Número OEM' : res.pnMatch.kind === 'xref' ? 'Referencia cruzada' : 'Número de parte'}{' '}
                    <b className="font-mono">{res.pnMatch.raw.toUpperCase()}</b> · {res.pnMatch.count}{' '}
                    {res.pnMatch.count === 1 ? 'pieza' : 'piezas equivalentes'}
                  </li>
                )}
                {res.diagnosis && (
                  <li className="px-2 py-2">
                    <DiagnosisPanel d={res.diagnosis} compact vehicleName={res.vehicle ? vehicleLabel(res.vehicle, { engine: false }) : undefined} />
                  </li>
                )}
                {res.corrections.length > 0 && (
                  <li className="px-3 py-1.5 text-sm text-muted">
                    <Sparkles size={13} className="mr-1 inline text-warn" />
                    Corregí {res.corrections.map((c) => `«${c.from}» → ${c.to}`).join(', ')}
                  </li>
                )}
                {suggestions.length > 0 && groupTitle('Completar')}
                {suggestions.map((it) =>
                  row(
                    it,
                    <>
                      <Search size={15} className="text-muted" />
                      <span className="flex-1 truncate">
                        <span className="text-muted">{q}</span>
                        <b>{(it as { text: string }).text.slice(q.length)}</b>
                      </span>
                      <span className="hidden sm:block">
                        <Kbd>Tab</Kbd>
                      </span>
                    </>,
                    `s-${(it as { text: string }).text}`,
                  ),
                )}
                {pts.length > 0 && groupTitle(res.vehicle && fitOnly ? 'Tipos de pieza compatibles' : 'Tipos de pieza')}
                {pts.map((it) => {
                  const p = it as Extract<Item, { kind: 'pt' }>;
                  return row(
                    it,
                    <>
                      <PartGlyph cat={PART_TYPE_BY_ID.get(p.value)!.cat} className="size-7 shrink-0 text-link" />
                      <span className="flex-1 truncate font-medium">{p.label}</span>
                      <span className="tabular text-xs text-muted">{fmtInt(p.count)}</span>
                    </>,
                    `p-${p.value}`,
                  );
                })}
                {prods.length > 0 && groupTitle('Productos')}
                {prods.map((it) => {
                  const p = products[(it as { i: number }).i];
                  return row(
                    it,
                    <>
                      <span className="bp-paper grid size-11 shrink-0 place-items-center rounded">
                        <PartGlyph cat={p.catId} pt={p.partTypeId} className="size-8 text-bp-ink" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[11px] text-muted">
                          <b className="text-ink-2 uppercase">{BRAND_BY_ID.get(p.brandId)!.name}</b>
                          <span className="font-mono">{p.partNumber}</span>
                          <TierBadge tier={p.tier} />
                        </span>
                        <span className="block truncate text-[14px]">
                          <Highlight text={p.title} terms={res.highlights} />
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
                {res.total === 0 && !loading && (
                  <li className="px-4 py-8 text-center">
                    <p className="font-display text-2xl font-bold uppercase">Sin coincidencias</p>
                    <p className="mt-1 text-sm text-muted">
                      {res.hiddenByFitment > 0
                        ? `Hay ${fmtInt(res.hiddenByFitment)} piezas que no son para ${res.vehicle ? vehicleLabel(res.vehicle, { engine: false }) : 'este vehículo'}.`
                        : 'Prueba con otra palabra, el número OEM o elige tu vehículo.'}
                    </p>
                    {res.hiddenByFitment > 0 && (
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
              Solo compatibles con mi {vehicleLabel(vehicle, { engine: false })}
            </label>
          )}
          <span className="tabular ml-auto font-mono">{res && q.trim() ? `${fmtInt(res.total)} · ${res.tookMs.toFixed(1)} ms` : ''}</span>
        </div>
      </div>
    </div>
  );
}
