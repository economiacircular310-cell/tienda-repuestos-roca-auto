import { CircleCheck, Info, Minus, Plus, ShieldCheck, ShoppingCart, Trash2, Truck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { post } from '../api/client';
import { useMeta } from '../api/meta';
import type { Cart } from '../api/types';
import { fmtMoney } from '../config';
import { href, linkClick, searchUrl } from '../lib/router';
import { useStore } from '../lib/store';
import { cart, setQty, toast, toasts, ui } from '../state/app';
import { Logo } from './Header';
import { PartPlate } from './PartGlyph';

/** Cotiza el carrito en el servidor cada vez que cambia (totales y plan de envíos). */
function useCartQuote(open: boolean) {
  const c = useStore(cart);
  const [quote, setQuote] = useState<Cart | null>(null);
  const key = JSON.stringify(c.items);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    post<Cart>('/api/cart', { items: c.items })
      .then((q) => alive && setQuote(q))
      .catch(() => alive && setQuote(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  return { items: c.items, quote };
}

export function CartDrawer() {
  const { cart: open } = useStore(ui);
  const meta = useMeta();
  const { items, quote } = useCartQuote(open);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.set((u) => ({ ...u, cart: false }));
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;

  const close = () => ui.set((u) => ({ ...u, cart: false }));
  const qtyOf = (id: string) => items.find((i) => i.id === id)?.qty ?? 0;
  const threshold = meta?.store.free_shipping_from ?? 99;

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
        {quote && quote.lines.length > 0 && (
          <div className="border-b border-line px-5 py-3">
            <p className="text-sm">
              {quote.free_shipping_left > 0 ? (
                <>
                  Te faltan <b className="tabular">{fmtMoney(quote.free_shipping_left)}</b> para el envío gratis
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
                style={{ width: `${Math.min(100, (quote.subtotal / threshold) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <ShoppingCart className="mx-auto text-line-strong" size={40} />
              <p className="mt-4 font-display text-2xl font-bold uppercase">Tu carrito está vacío</p>
              <p className="mt-1 text-sm text-muted">Busca por vehículo, pieza, síntoma o número de parte y agrega lo que necesites.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {(quote?.lines ?? []).map(({ product: p, total }) => {
                const qty = qtyOf(p.id);
                return (
                  <li key={p.id} className="flex gap-3 px-5 py-4">
                    <PartPlate cat={p.category.id} pt={p.part_type.id} size="sm" className="w-16 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <a href={href(`/p/${p.id}`)} onClick={linkClick(`/p/${p.id}`, close)} className="block truncate text-sm font-medium hover:text-link">
                        {p.title}
                      </a>
                      <p className="text-xs text-muted">
                        {p.brand.name} · <span className="font-mono">{p.part_number}</span>
                        {p.position ? ` · ${p.position}` : ''}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="inline-flex items-center rounded-md border border-line-strong">
                          <button type="button" className="p-1.5 hover:bg-surface-2" onClick={() => setQty(p.id, qty - 1)} aria-label="Quitar uno">
                            <Minus size={14} />
                          </button>
                          <span className="tabular w-8 text-center text-sm">{qty}</span>
                          <button type="button" className="p-1.5 hover:bg-surface-2" onClick={() => setQty(p.id, qty + 1)} aria-label="Agregar uno">
                            <Plus size={14} />
                          </button>
                        </div>
                        <span className="tabular font-display text-lg font-bold">{fmtMoney(total)}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => setQty(p.id, 0)} className="self-start rounded p-1 text-muted hover:text-danger" aria-label="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {quote && quote.lines.length > 0 && (
          <>
            <div className="border-t border-line px-5 py-3 text-sm">
              <p className="flex flex-wrap items-center gap-x-2 font-semibold">
                <Truck size={15} />
                {quote.shipments.length === 1
                  ? `Sale en 1 envío desde ${quote.shipments[0].warehouse.name}`
                  : quote.shipments.length > 1
                    ? `${quote.shipments.length} envíos (el mínimo posible)`
                    : 'Todo bajo pedido'}
                {quote.eta && (
                  <span className="font-normal text-muted">
                    · llega en {quote.eta[0]}–{quote.eta[1]} días
                  </span>
                )}
              </p>
              {(quote.shipments.length > 1 || quote.backorder.length > 0) && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                  {quote.shipments.map((s) => {
                    const n = s.items.reduce((a, b) => a + b.qty, 0);
                    return (
                      <li key={s.warehouse.id}>
                        {s.warehouse.name}: {n} {n === 1 ? 'pieza' : 'piezas'} · {s.eta[0]}–{s.eta[1]} días
                      </li>
                    );
                  })}
                  {quote.backorder.length > 0 && <li>Bajo pedido (5–8 días): {quote.backorder.map((b) => b.part_number).join(', ')}</li>}
                </ul>
              )}
            </div>
            <div className="space-y-2 border-t border-line bg-surface-2 px-5 py-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular">{fmtMoney(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Envío</span>
                <span className="tabular">{quote.shipping ? fmtMoney(quote.shipping) : 'Gratis'}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular font-display text-2xl font-bold">{fmtMoney(quote.total)}</span>
              </div>
              <button
                type="button"
                className="mt-2 h-12 w-full rounded-md bg-accent font-semibold text-accent-ink hover:brightness-95"
                onClick={() => toast('Catálogo de demostración: el pago se conecta al integrar tu pasarela.', 'info')}
              >
                Finalizar compra
              </button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <ShieldCheck size={13} /> Compatibilidad certificada · Devolución en 30 días
              </p>
            </div>
          </>
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
  const meta = useMeta();
  const [email, setEmail] = useState('');
  if (!meta) return null;
  const { store } = meta;
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.3fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted">
            Repuestos para autos, camionetas y SUV. Cada pieza compatible sale con un certificado firmado que cualquiera puede verificar.
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm">
            <Truck size={16} className="text-ink-2" /> Envío gratis desde {fmtMoney(store.free_shipping_from)}
          </p>
        </div>
        <nav aria-label="Categorías populares">
          <h3 className="label-caps text-[11px] text-muted">Comprar</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {meta.categories.slice(0, 7).map((c) => (
              <li key={c.id}>
                <a className="hover:text-link" href={href(searchUrl('', { cat: c.id }))} onClick={linkClick(searchUrl('', { cat: c.id }))}>
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h3 className="label-caps text-[11px] text-muted">Confianza y ayuda</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a className="hover:text-link" href={href('/verificar')} onClick={linkClick('/verificar')}>
                Verificar un certificado
              </a>
            </li>
            <li>
              <a className="hover:text-link" href={href('/servicio')} onClick={linkClick('/servicio')}>
                Plan de mantenimiento
              </a>
            </li>
            <li>
              <a className="hover:text-link" href={href('/catalogo')} onClick={linkClick('/catalogo')}>
                Catálogo por vehículo
              </a>
            </li>
            <li>
              Ventas: <span className="font-mono select-all">{store.email}</span>
            </li>
            <li>
              WhatsApp: <span className="font-mono select-all">{store.whatsapp}</span>
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
          © {new Date().getFullYear()} {store.name}. Motor en Python · {meta.stats.products.toLocaleString(store.locale)} referencias. Catálogo de demostración:
          precios, existencias y números de parte son ficticios. Las marcas mencionadas pertenecen a sus dueños.
        </p>
      </div>
    </footer>
  );
}
