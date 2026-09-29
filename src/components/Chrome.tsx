import { CircleCheck, Info, Minus, Plus, ShieldCheck, ShoppingCart, Trash2, Truck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BRAND_BY_ID, CATEGORIES } from '../data/catalog';
import { productById } from '../data/inventory';
import { STORE, fmtMoney } from '../config';
import { href, linkClick, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { cart, setQty, toast, toasts, ui } from '../state/app';
import { freeShippingLeft } from './bits';
import { planShipments } from '../lib/shipping';
import { Logo } from './Header';
import { PartPlate } from './PartGlyph';

export function CartDrawer() {
  const { cart: open } = useStore(ui);
  const c = useStore(cart);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.set((u) => ({ ...u, cart: false }));
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;

  const lines = c.items.map((it) => ({ ...it, p: productById(it.id) })).filter((l) => l.p);
  const subtotal = lines.reduce((a, l) => a + l.p!.price * l.qty, 0);
  const left = freeShippingLeft(subtotal);
  const shipping = subtotal === 0 || left === 0 ? 0 : STORE.shippingFlat;
  const close = () => ui.set((u) => ({ ...u, cart: false }));
  const ship = planShipments(lines.map((l) => ({ p: l.p!, qty: l.qty })));

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Carrito">
      <button type="button" className="absolute inset-0 bg-bp/60" onClick={close} aria-label="Cerrar carrito" tabIndex={-1} />
      <aside className="anim-slide absolute top-0 right-0 flex h-full w-full max-w-md flex-col bg-surface pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] shadow-float">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl font-bold uppercase">Carrito</h2>
          <button ref={closeRef} type="button" onClick={close} className="rounded p-1.5 hover:bg-surface-2" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {lines.length > 0 && (
          <div className="border-b border-line px-5 py-3">
            <p className="text-sm">
              {left > 0 ? (
                <>
                  Te faltan <b className="tabular">{fmtMoney(left)}</b> para el envío gratis
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-ok">
                  <CircleCheck size={15} /> Tu envío es gratis
                </span>
              )}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.min(100, (subtotal / STORE.freeShippingFrom) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <ShoppingCart className="mx-auto text-line-strong" size={40} />
              <p className="mt-4 font-display text-2xl font-bold uppercase">Tu carrito está vacío</p>
              <p className="mt-1 text-sm text-muted">Busca por vehículo, pieza o número de parte y agrega lo que necesites.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map(({ id, qty, p }) => (
                <li key={id} className="flex gap-3 px-5 py-4">
                  <PartPlate cat={p!.catId} pt={p!.partTypeId} size="sm" className="w-16 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <a href={href(`/p/${id}`)} onClick={linkClick(`/p/${id}`, close)} className="block truncate text-sm font-medium hover:text-link">
                      {p!.title}
                    </a>
                    <p className="text-xs text-muted">
                      {BRAND_BY_ID.get(p!.brandId)!.name} · <span className="font-mono">{p!.partNumber}</span>
                      {p!.position ? ` · ${p!.position}` : ''}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-md border border-line-strong">
                        <button type="button" className="p-1.5 hover:bg-surface-2" onClick={() => setQty(id, qty - 1)} aria-label="Quitar uno">
                          <Minus size={14} />
                        </button>
                        <span className="tabular w-8 text-center text-sm">{qty}</span>
                        <button type="button" className="p-1.5 hover:bg-surface-2" onClick={() => setQty(id, qty + 1)} aria-label="Agregar uno">
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="tabular font-display text-lg font-bold">{fmtMoney(p!.price * qty)}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setQty(id, 0)} className="self-start rounded p-1 text-muted hover:text-danger" aria-label="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {lines.length > 0 && (
          <div className="border-t border-line px-5 py-3 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Truck size={15} />
              {ship.shipments.length === 1
                ? `Sale en 1 envío desde ${ship.shipments[0].warehouse.name}`
                : ship.shipments.length > 1
                  ? `${ship.shipments.length} envíos (mínimo posible)`
                  : 'Todo bajo pedido'}
              {ship.eta && (
                <span className="font-normal text-muted">
                  · llega en {ship.eta[0]}–{ship.eta[1]} días
                </span>
              )}
            </p>
            {(ship.shipments.length > 1 || ship.backorder.length > 0) && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                {ship.shipments.map((s) => (
                  <li key={s.warehouse.id}>
                    {s.warehouse.name}: {s.items.reduce((a, b) => a + b.qty, 0)} {s.items.reduce((a, b) => a + b.qty, 0) === 1 ? 'pieza' : 'piezas'} ·{' '}
                    {s.warehouse.eta[0]}–{s.warehouse.eta[1]} días
                  </li>
                ))}
                {ship.backorder.length > 0 && <li>Bajo pedido (5–8 días): {ship.backorder.map((b) => b.p.partNumber).join(', ')}</li>}
              </ul>
            )}
          </div>
        )}
        {lines.length > 0 && (
          <div className="space-y-2 border-t border-line bg-surface-2 px-5 py-4 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular">{fmtMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Envío</span>
              <span className="tabular">{shipping ? fmtMoney(shipping) : 'Gratis'}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular font-display text-2xl font-bold">{fmtMoney(subtotal + shipping)}</span>
            </div>
            <button
              type="button"
              className="mt-2 h-12 w-full rounded-md bg-accent font-semibold text-accent-ink hover:brightness-95"
              onClick={() => toast('Este es un catálogo de demostración: el pago se conecta en la integración con tu pasarela.', 'info')}
            >
              Finalizar compra
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <ShieldCheck size={13} /> Compatibilidad garantizada · Devolución en 30 días
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

export function Toasts() {
  const list = useStore(toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-[80] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {list.map((t) => (
        <div key={t.id} className="anim-rise pointer-events-auto flex max-w-md items-start gap-2 rounded-lg bg-ink px-4 py-3 text-sm text-surface shadow-float">
          {t.tone === 'info' ? <Info size={16} className="mt-0.5 shrink-0 text-accent" /> : <CircleCheck size={16} className="mt-0.5 shrink-0 text-accent" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Footer() {
  const [email, setEmail] = useState('');
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.3fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted">
            Repuestos para autos, camionetas y SUV. Encuentra la pieza por vehículo, número de parte, OEM o VIN y recíbela desde el almacén más cercano.
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm">
            <Truck size={16} className="text-ink-2" /> Envío gratis desde {fmtMoney(STORE.freeShippingFrom)}
          </p>
        </div>
        <nav aria-label="Categorías populares">
          <h3 className="label-caps text-[11px] text-muted">Comprar</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {CATEGORIES.slice(0, 7).map((c) => (
              <li key={c.id}>
                <a className="hover:text-link" href={href(searchUrl('', { cat: c.id }))} onClick={linkClick(searchUrl('', { cat: c.id }))}>
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h3 className="label-caps text-[11px] text-muted">Ayuda</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a className="hover:text-link" href={href('/catalogo')} onClick={linkClick('/catalogo')}>
                Catálogo por vehículo
              </a>
            </li>
            <li>Garantías y devoluciones</li>
            <li>Estado de mi pedido</li>
            <li>
              Ventas: <span className="font-mono select-all">{STORE.email}</span>
            </li>
            <li>
              WhatsApp: <span className="font-mono select-all">{STORE.whatsapp}</span>
            </li>
          </ul>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Escribe un correo válido, por ejemplo nombre@correo.com', 'info');
            setEmail('');
            toast('Listo: te avisaremos de ofertas y liquidaciones.');
          }}
        >
          <h3 className="label-caps text-[11px] text-muted">Ofertas y liquidaciones</h3>
          <p className="mt-3 text-sm">Una vez por semana, solo precios de verdad bajos.</p>
          <div className="mt-3 flex gap-2">
            <label htmlFor="newsletter-email" className="sr-only">
              Correo electrónico
            </label>
            <input
              id="newsletter-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface-2 px-3 text-sm outline-none focus:border-link"
            />
            <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-surface">
              Suscribirme
            </button>
          </div>
        </form>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1400px] px-4 py-5 text-xs text-muted sm:px-6">
          © {new Date().getFullYear()} {STORE.name}. Catálogo de demostración: precios, existencias y números de parte son ficticios. Las marcas mencionadas
          pertenecen a sus dueños.
        </p>
      </div>
    </footer>
  );
}
