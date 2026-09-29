import { BadgeCheck, Check, PackageSearch, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, post } from '../api/client';
import type { Order, OrderStatus } from '../api/types';
import { fmtMoney } from '../config';
import { href, linkClick, navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { myOrders, rememberOrder } from '../state/app';
import { CopyPN } from '../components/bits';

const STEPS: { id: OrderStatus; label: string }[] = [
  { id: 'recibido', label: 'Recibido' },
  { id: 'preparando', label: 'Preparando' },
  { id: 'enviado', label: 'Enviado' },
  { id: 'entregado', label: 'Entregado' },
];

const fmtDate = (iso: string, withTime = false) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es', {
    weekday: withTime ? undefined : 'short',
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });

function Timeline({ order }: { order: Order }) {
  const reached = new Map(order.events.map((e) => [e.status, e]));
  const current = STEPS.findIndex((s) => s.id === order.status);
  if (order.status === 'cancelado') return <p className="rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn">Pedido cancelado</p>;
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Estado del pedido">
      {STEPS.map((s, i) => {
        const done = i <= current;
        const ev = reached.get(s.id);
        return (
          <li key={s.id} className="min-w-0">
            <div className={`h-1.5 rounded-full ${done ? 'bg-ok' : 'bg-line'}`} />
            <p className={`mt-2 flex items-center gap-1 text-sm font-semibold ${done ? 'text-ok' : 'text-muted'}`}>
              {done && <Check size={14} />} {s.label}
            </p>
            <p className="truncate text-xs text-muted">{ev ? fmtDate(ev.at, true) : '—'}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderPage({ code }: { code?: string }) {
  const mine = useStore(myOrders);
  const known = code ? mine.find((o) => o.code === code) : undefined;
  const [form, setForm] = useState({ code: code ?? '', email: known?.email ?? '' });
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = (c: string, email: string) => {
    setBusy(true);
    setError('');
    post<Order>('/api/orders/lookup', { code: c, email })
      .then((o) => {
        setOrder(o);
        rememberOrder(o.code, email.trim().toLowerCase());
        if (o.code !== code) navigate(`/pedido/${o.code}`, { replace: true });
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo consultar el pedido.'))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    document.title = `${code ? `Pedido ${code}` : 'Seguir mi pedido'} · Lenin Auto Cars`;
    if (code && known && order?.code !== code) lookup(code, known.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6">
        <p className="label-caps text-[11px] text-muted">Seguimiento</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[0.95] font-extrabold uppercase">Seguir mi pedido</h1>
        <p className="mt-3 text-ink-2">
          El código viene en tu confirmación (LAC-XXXX-XXXX-X). Puedes escribirlo en minúsculas o con espacios: el dígito final detecta errores de tipeo.
        </p>
        <form
          className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            lookup(form.code, form.email);
          }}
        >
          <label htmlFor="ord-code" className="sr-only">
            Código de pedido
          </label>
          <input
            id="ord-code"
            required
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="LAC-7Q2M-9XKD-4"
            className="h-12 rounded-md border border-line-strong bg-surface px-3 font-mono uppercase outline-none focus:border-link"
          />
          <label htmlFor="ord-email" className="sr-only">
            Correo
          </label>
          <input
            id="ord-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="tu@correo.com"
            className="h-12 rounded-md border border-line-strong bg-surface px-3 outline-none focus:border-link"
          />
          <button type="submit" disabled={busy} className="h-12 rounded-md bg-ink px-5 font-semibold text-surface disabled:opacity-60">
            Buscar
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            {error}
          </p>
        )}
        {mine.length > 0 && (
          <div className="mt-8">
            <p className="label-caps text-[10px] text-muted">Pedidos hechos en este dispositivo</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {mine.map((o) => (
                <li key={o.code}>
                  <a href={href(`/pedido/${o.code}`)} onClick={linkClick(`/pedido/${o.code}`)} className="pn-tag inline-block hover:border-ink">
                    {o.code}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 sm:px-6">
      <p className="label-caps text-[11px] text-muted">Pedido de {order.customer_name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none font-extrabold uppercase">Pedido</h1>
        <CopyPN value={order.code} className="text-base" />
      </div>
      <p className="mt-2 text-sm text-muted">
        Registrado el {fmtDate(order.created_at, true)}
        {order.vehicle && ` · para ${order.vehicle}`}
      </p>

      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <Timeline order={order} />
        {order.delivery && order.status !== 'cancelado' && order.status !== 'entregado' && (
          <p className="mt-5 flex items-center gap-2 text-sm">
            <Truck size={16} className="text-ok" />
            Entrega estimada entre el <b>{fmtDate(order.delivery[0])}</b> y el <b>{fmtDate(order.delivery[1])}</b> (días hábiles, sin domingos).
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <p className="label-caps border-b border-line bg-surface-2 px-4 py-2 text-[10px] text-muted">Piezas · precios congelados al comprar</p>
          <ul className="divide-y divide-line">
            {order.lines.map((l) => (
              <li key={l.product_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
                <div className="min-w-0">
                  <a href={href(`/p/${l.product_id}`)} onClick={linkClick(`/p/${l.product_id}`)} className="block truncate font-medium hover:text-link">
                    {l.title}
                  </a>
                  <p className="text-xs text-muted">
                    {l.brand} · <span className="font-mono">{l.part_number}</span> · {l.qty} × {fmtMoney(l.unit_price)}
                  </p>
                  {l.certificate ? (
                    <a
                      href={href(`/verificar?t=${l.certificate.token}`)}
                      onClick={linkClick(`/verificar?t=${l.certificate.token}`)}
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-sm border border-ok/40 bg-ok-soft px-2 py-0.5 font-mono text-[11px] text-ok"
                    >
                      <BadgeCheck size={12} /> {l.certificate.code}
                    </a>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">
                      {l.fitment === 'universal' ? 'Universal: verifica la especificación' : 'Sin certificado (sin vehículo confirmado)'}
                    </p>
                  )}
                </div>
                <span className="tabular font-display text-lg font-bold">{fmtMoney(l.total)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-line bg-surface-2 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular">{fmtMoney(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Envío</dt>
              <dd className="tabular">{order.shipping ? fmtMoney(order.shipping) : 'Gratis'}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular font-display text-2xl font-bold">{fmtMoney(order.total)}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-line bg-surface p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <PackageSearch size={16} /> Envíos
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {order.shipments.map((s) => (
                <li key={s.warehouse.id}>
                  {s.warehouse.name}: {s.items.reduce((a, b) => a + b.qty, 0)} piezas · {s.eta[0]}–{s.eta[1]} días
                </li>
              ))}
              {!order.shipments.length && <li>Bajo pedido: te avisamos al despachar.</li>}
            </ul>
          </section>
          <section className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold">Historial</p>
            <ol className="mt-2 space-y-2 text-sm">
              {order.events.map((e, i) => (
                <li key={i} className="border-l-2 border-accent pl-3">
                  <b className="capitalize">{e.status}</b> <span className="text-xs text-muted">· {fmtDate(e.at, true)}</span>
                  {e.note && <span className="block text-muted">{e.note}</span>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
