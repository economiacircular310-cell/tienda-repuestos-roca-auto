import { Car, ChevronDown, Menu, Monitor, Moon, Search, ShoppingCart, Sun, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { engineLabel, useMeta, vehicleLabel, type VehicleSel } from '../api/meta';
import { href, linkClick, navigate, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { cart, garage, openPalette, saveVehicle, theme, toast, ui, type ThemePref } from '../state/app';
import { Kbd } from './bits';
import { PartGlyph } from './PartGlyph';
import { VehiclePicker, isComplete } from './VehiclePicker';

export function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <a href={href('/')} onClick={linkClick('/')} className="flex shrink-0 items-center gap-2.5" aria-label="Lenin Auto Cars, inicio">
      <svg viewBox="0 0 40 40" className="size-8 sm:size-9" aria-hidden="true">
        <rect width="40" height="40" rx="8" className="fill-bp" />
        <path d="M20 6.5 31.7 13.25v13.5L20 33.5 8.3 26.75v-13.5Z" fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinejoin="round" />
        <circle cx="20" cy="20" r="5" fill="var(--accent)" />
      </svg>
      <span className="leading-none">
        <span className={`block font-display text-[22px] font-extrabold tracking-tight uppercase sm:text-[26px] ${onDark ? 'text-bp-ink' : 'text-ink'}`}>
          Lenin<span className="font-semibold text-muted"> Auto Cars</span>
        </span>
        <span className={`label-caps hidden text-[9px] tracking-[0.2em] sm:block ${onDark ? 'text-bp-dim' : 'text-muted'}`}>Repuestos automotrices</span>
      </span>
    </a>
  );
}

const EXAMPLES = [
  'balatas delanteras hilux 2018',
  'filtro aceite versa 2019',
  'amortiguador corolla',
  '0 986 494 525',
  'bujías iridio civic',
  'kit embrague ranger diésel',
];

function SearchTrigger() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(t);
  }, []);
  return (
    <button
      type="button"
      onClick={() => openPalette()}
      className="group flex h-11 w-full min-w-0 items-center gap-3 rounded-md border border-line-strong bg-surface-2 pr-2 pl-3 text-left transition hover:border-ink focus-visible:border-link"
      aria-label="Buscar repuestos"
    >
      <Search size={18} className="shrink-0 text-ink" />
      <span className="min-w-0 flex-1 truncate text-[15px] text-muted">
        <span className="hidden sm:inline">Busca pieza, n.º de parte u OEM · </span>
        <span key={i} className="anim-rise inline-block text-ink-2">
          «{EXAMPLES[i]}»
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 md:flex">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

function ThemeToggle() {
  const pref = useStore(theme);
  const next: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor;
  const label = { system: 'Tema del sistema', light: 'Tema claro', dark: 'Tema oscuro' }[pref];
  return (
    <button
      type="button"
      onClick={() => theme.set(next[pref])}
      className="inline-flex size-10 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2"
      title={`${label} (cambiar)`}
      aria-label={`${label}. Cambiar tema`}
    >
      <Icon size={18} />
    </button>
  );
}

function GarageMenu() {
  const g = useStore(garage);
  const { garage: open } = useStore(ui);
  const [draft, setDraft] = useState<VehicleSel>({});
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = g.vehicles.find((v) => v.id === g.activeId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ui.set((u) => ({ ...u, garage: false }));
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.set((u) => ({ ...u, garage: false }));
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => ui.set((u) => ({ ...u, garage: false }));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          ui.set((u) => ({ ...u, garage: !u.garage }));
          setAdding(g.vehicles.length === 0);
        }}
        className={`flex h-10 max-w-[15rem] items-center gap-2 rounded-md border px-2.5 text-left transition sm:h-11 sm:px-3 ${
          active ? 'border-ok/50 bg-ok-soft' : 'border-dashed border-line-strong hover:border-ink'
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Car size={18} className={active ? 'text-ok' : 'text-ink-2'} />
        <span className="hidden min-w-0 leading-tight md:block">
          <span className="label-caps block text-[9px] text-muted">{active ? 'Comprando para' : 'Mi garaje'}</span>
          <span className="block truncate text-[13px] font-semibold">{active ? vehicleLabel(active, false) : 'Agrega tu vehículo'}</span>
        </span>
        <ChevronDown size={14} className="hidden text-muted md:block" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Mi garaje"
          className="anim-pop fixed inset-x-3 top-[4.5rem] z-50 rounded-lg border border-line bg-surface p-4 shadow-float sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:right-0 sm:w-[26rem]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold uppercase">Mi garaje</h2>
            <button type="button" onClick={close} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
          {g.vehicles.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-md border border-line">
              {g.vehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="radio"
                    name="garage-active"
                    id={`garage-${v.id}`}
                    checked={v.id === g.activeId}
                    onChange={() => garage.set((x) => ({ ...x, activeId: v.id }))}
                    className="size-4 accent-[var(--ok)]"
                  />
                  <label htmlFor={`garage-${v.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate text-sm font-semibold">{vehicleLabel(v, false)}</span>
                    <span className="block truncate text-xs text-muted">{v.engine ? engineLabel(v.engine) : 'Motor sin especificar'}</span>
                  </label>
                  <button
                    type="button"
                    className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={`Quitar ${vehicleLabel(v)}`}
                    onClick={() =>
                      garage.set((x) => ({ vehicles: x.vehicles.filter((y) => y.id !== v.id), activeId: x.activeId === v.id ? null : x.activeId }))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
              <li className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="radio"
                  name="garage-active"
                  id="garage-none"
                  checked={!g.activeId}
                  onChange={() => garage.set((x) => ({ ...x, activeId: null }))}
                  className="size-4"
                />
                <label htmlFor="garage-none" className="flex-1 cursor-pointer text-sm text-muted">
                  Buscar sin vehículo (todo el catálogo)
                </label>
              </li>
            </ul>
          )}
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!isComplete(draft)) return;
                const v = saveVehicle({ makeId: draft.makeId!, modelId: draft.modelId!, year: draft.year!, engine: draft.engine });
                toast(`Guardado: ${vehicleLabel(v, false)}. Verás solo piezas compatibles.`);
                setDraft({});
                setAdding(false);
              }}
              className="space-y-3"
            >
              <VehiclePicker idPrefix="garage" value={draft} onChange={setDraft} compact />
              <button
                type="submit"
                disabled={!isComplete(draft)}
                className="h-10 w-full rounded-md bg-accent font-semibold text-accent-ink transition hover:brightness-95 disabled:opacity-40"
              >
                Guardar vehículo
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="h-10 w-full rounded-md border border-dashed border-line-strong text-sm font-semibold hover:border-ink"
            >
              + Agregar otro vehículo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CartButton() {
  const c = useStore(cart);
  const n = c.items.reduce((a, b) => a + b.qty, 0);
  return (
    <button
      type="button"
      onClick={() => ui.set((u) => ({ ...u, cart: true }))}
      className="relative inline-flex size-10 items-center justify-center rounded-md bg-ink text-surface transition hover:opacity-90 sm:size-11"
      aria-label={`Carrito, ${n} artículos`}
    >
      <ShoppingCart size={19} />
      {n > 0 && (
        <span
          key={n}
          className="anim-pop tabular absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-accent px-1 text-center text-[11px] leading-5 font-bold text-accent-ink"
        >
          {n}
        </span>
      )}
    </button>
  );
}

function CategoryNav() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const enter = (id: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(id), 120);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(null), 160);
  };
  const meta = useMeta();
  const CATEGORIES = meta?.categories ?? [];
  const PART_TYPES = meta?.part_types ?? [];
  const cat = CATEGORIES.find((c) => c.id === open);

  return (
    <nav className="relative border-t border-line" aria-label="Categorías" onMouseLeave={leave}>
      <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-4 sm:px-6">
        <button
          type="button"
          className="flex h-10 shrink-0 items-center gap-2 pr-3 text-sm font-semibold lg:hidden"
          onClick={() => setMobile((m) => !m)}
          aria-expanded={mobile}
        >
          <Menu size={16} /> Categorías
        </button>
        <ul className="no-scrollbar flex min-w-0 items-center overflow-x-auto">
          <li className="hidden lg:block">
            <a
              href={href('/catalogo')}
              onClick={linkClick('/catalogo')}
              className="flex h-10 items-center gap-1.5 pr-3 text-[13px] font-semibold whitespace-nowrap text-link"
            >
              Catálogo
            </a>
          </li>
          <li className="hidden lg:block">
            <a
              href={href('/servicio')}
              onClick={linkClick('/servicio')}
              className="mr-1 flex h-10 items-center gap-1.5 border-r border-line pr-3 text-[13px] font-semibold whitespace-nowrap text-link"
            >
              Mantenimiento
            </a>
          </li>
          {CATEGORIES.map((c) => (
            <li key={c.id} className="hidden lg:block" onMouseEnter={() => enter(c.id)}>
              <a
                href={href(searchUrl('', { cat: c.id }))}
                onClick={linkClick(searchUrl('', { cat: c.id }), () => setOpen(null))}
                onFocus={() => setOpen(c.id)}
                className={`flex h-10 items-center border-b-2 px-2.5 text-[13px] whitespace-nowrap transition ${
                  open === c.id ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'
                }`}
              >
                {c.short}
              </a>
            </li>
          ))}
          <li className="lg:ml-auto">
            <a
              href={href(searchUrl('', { sale: '1' }))}
              onClick={linkClick(searchUrl('', { sale: '1' }))}
              className="flex h-10 items-center gap-1.5 pl-3 text-[13px] font-semibold whitespace-nowrap"
            >
              <span className="rounded-sm bg-accent px-1.5 py-px text-[11px] font-bold text-accent-ink">%</span> Ofertas
            </a>
          </li>
        </ul>
      </div>

      {cat && (
        <div
          className="anim-pop absolute inset-x-0 top-full z-40 hidden border-y border-line bg-surface shadow-float lg:block"
          onMouseEnter={() => window.clearTimeout(timer.current)}
        >
          <div className="mx-auto grid max-w-[1400px] grid-cols-[220px_1fr] gap-8 px-6 py-6">
            <div className="bp-paper rounded-md p-5">
              <PartGlyph cat={cat.id} className="h-24 w-24 text-bp-ink" />
              <p className="mt-3 font-display text-2xl font-bold uppercase">{cat.name}</p>
              <p className="text-sm text-bp-dim">{cat.blurb}</p>
            </div>
            <ul className="grid content-start gap-x-8 gap-y-1 sm:grid-cols-3">
              {PART_TYPES.filter((p) => p.cat === cat.id).map((p) => (
                <li key={p.id}>
                  <a
                    href={href(searchUrl('', { pt: p.id }))}
                    onClick={linkClick(searchUrl('', { pt: p.id }), () => setOpen(null))}
                    className="group block rounded px-2 py-2 hover:bg-surface-2"
                  >
                    <span className="block text-[15px] font-medium group-hover:text-link">{p.name}</span>
                    <span className="block truncate text-xs text-muted">También: {p.syn.slice(0, 3).join(', ')}</span>
                  </a>
                </li>
              ))}
              <li className="sm:col-span-3">
                <a
                  href={href(searchUrl('', { cat: cat.id }))}
                  onClick={linkClick(searchUrl('', { cat: cat.id }), () => setOpen(null))}
                  className="mt-2 inline-block px-2 text-sm font-semibold text-link"
                >
                  Ver todo {cat.name.toLowerCase()} →
                </a>
              </li>
            </ul>
          </div>
        </div>
      )}

      {mobile && (
        <div className="border-t border-line bg-surface lg:hidden">
          <ul className="mx-auto grid max-w-[1400px] grid-cols-2 gap-1 px-4 py-3 sm:grid-cols-3">
            <li>
              <a href={href('/catalogo')} onClick={linkClick('/catalogo', () => setMobile(false))} className="block rounded px-2 py-2 font-semibold text-link">
                Catálogo por vehículo
              </a>
            </li>
            <li className="sm:col-span-2">
              <a href={href('/servicio')} onClick={linkClick('/servicio', () => setMobile(false))} className="block rounded px-2 py-2 font-semibold text-link">
                Plan de mantenimiento
              </a>
            </li>
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <a
                  href={href(searchUrl('', { cat: c.id }))}
                  onClick={linkClick(searchUrl('', { cat: c.id }), () => setMobile(false))}
                  className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-surface-2"
                >
                  <PartGlyph cat={c.id} className="size-6 text-link" />
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

export function Header() {
  return (
    <>
      <div className="bg-bp text-bp-ink">
        <p className="no-scrollbar mx-auto flex max-w-[1400px] gap-6 overflow-x-auto px-4 py-1.5 text-[12px] whitespace-nowrap sm:px-6">
          <span>
            <b className="text-accent">Envío gratis</b> desde $99
          </span>
          <span>Devoluciones en 30 días</span>
          <span>Compatibilidad garantizada o te devolvemos el dinero</span>
          <span className="hidden md:inline">Despacho desde 3 almacenes</span>
        </p>
      </div>
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:gap-4 sm:px-6 sm:py-3 md:flex-nowrap">
          <Logo />
          <div className="order-last w-full min-w-0 basis-full md:order-none md:flex-1 md:basis-auto">
            <SearchTrigger />
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 md:ml-0">
            <GarageMenu />
            <ThemeToggle />
            <CartButton />
          </div>
        </div>
        <CategoryNav />
      </header>
    </>
  );
}

export function goSearch(q: string) {
  navigate(searchUrl(q));
}
