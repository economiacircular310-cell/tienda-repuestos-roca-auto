import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi } from '../api/client';
import type { Verify } from '../api/types';
import { href, linkClick, navigate, useRoute } from '../lib/router';

/** Verificación pública de un certificado de compatibilidad (firma HMAC-SHA256 en el servidor). */
export function VerifyPage() {
  const token = useRoute().query.get('t') ?? '';
  const [draft, setDraft] = useState(token);
  const { data, loading } = useApi<Verify>(token ? '/api/verify' : null, { token });
  useEffect(() => {
    document.title = 'Verificar certificado · Lenin Auto Cars';
    setDraft(token);
  }, [token]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <p className="label-caps text-[11px] text-muted">Confianza verificable</p>
      <h1 className="mt-1 font-display text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[0.95] font-extrabold uppercase">Verificar un certificado</h1>
      <p className="mt-3 text-ink-2">
        Cada pieza compatible sale con un certificado firmado con HMAC-SHA256. Pega aquí el token: si alguien cambió una sola letra del vehículo, la pieza o la
        fecha, la firma no coincide.
      </p>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/verificar?t=${encodeURIComponent(draft.trim())}`);
        }}
      >
        <label htmlFor="verify-token" className="sr-only">
          Token del certificado
        </label>
        <input
          id="verify-token"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Token del certificado"
          className="h-12 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 font-mono text-sm outline-none focus:border-link"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="h-12 rounded-md bg-ink px-5 font-semibold text-surface">
          Verificar
        </button>
      </form>

      {token && !loading && data && (
        <div className={`mt-8 rounded-xl border-2 p-6 ${data.valid ? 'border-ok bg-ok-soft' : 'border-danger bg-warn-soft'}`}>
          {data.valid ? (
            <>
              <p className="flex items-center gap-2 font-display text-3xl font-bold text-ok uppercase">
                <BadgeCheck size={30} /> Certificado auténtico
              </p>
              <p className="mt-2 font-mono text-lg font-semibold tracking-wide">{data.code}</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="label-caps text-[10px] text-muted">Vehículo</dt>
                  <dd className="font-semibold">{data.vehicle}</dd>
                </div>
                <div>
                  <dt className="label-caps text-[10px] text-muted">Pieza</dt>
                  <dd className="font-semibold">
                    {data.product ? (
                      <a className="hover:text-link" href={href(`/p/${data.product.id}`)} onClick={linkClick(`/p/${data.product.id}`)}>
                        {data.product.brand.name} {data.product.part_number}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="label-caps text-[10px] text-muted">Emitido</dt>
                  <dd className="font-semibold">{data.issued}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="flex items-center gap-2 font-display text-3xl font-bold text-danger uppercase">
              <ShieldAlert size={30} /> Firma inválida o certificado alterado
            </p>
          )}
        </div>
      )}
    </div>
  );
}
