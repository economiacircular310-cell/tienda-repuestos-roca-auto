import { useEffect } from 'react';
import { loadMeta, useMeta, useMetaFailed } from './api/meta';
import { configureLocale } from './config';
import { useRoute } from './lib/router';
import { useStore } from './lib/store';
import { applyTheme, openPalette, theme, ui } from './state/app';
import { Header } from './components/Header';
import { SearchPalette } from './components/SearchPalette';
import { CartDrawer, Footer, Toasts } from './components/Chrome';
import { HomePage } from './pages/Home';
import { SearchPage } from './pages/SearchPage';
import { ProductPage } from './pages/ProductPage';
import { CatalogPage } from './pages/CatalogPage';
import { ServicePage } from './pages/ServicePage';
import { VerifyPage } from './pages/VerifyPage';
import { OrderPage } from './pages/OrderPage';

function Boot() {
  const failed = useMetaFailed();
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      {failed ? (
        <div>
          <p className="font-display text-3xl font-bold uppercase">No hay conexión con el servidor</p>
          <p className="mt-2 text-muted">
            Inicia la API con <code className="font-mono">python -m lenin_auto servir</code> y recarga la página.
          </p>
          <button
            type="button"
            className="mt-4 rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
            onClick={() => void loadMeta().catch(() => undefined)}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <p className="label-caps animate-pulse text-[11px] text-muted">Cargando catálogo…</p>
      )}
    </div>
  );
}

export function App() {
  const route = useRoute();
  const meta = useMeta();
  const pref = useStore(theme);
  const pathKey = route.path.join('/');

  useEffect(() => applyTheme(pref), [pref]);
  useEffect(() => {
    loadMeta()
      .then((m) => configureLocale(m.store.locale, m.store.currency))
      .catch(() => undefined);
  }, []);
  useEffect(() => window.scrollTo({ top: 0 }), [pathKey]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]');
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (ui.get().palette) ui.set((u) => ({ ...u, palette: false }));
        else openPalette();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [first, ...rest] = route.path;
  let page;
  if (!meta) page = <Boot />;
  else if (first === 'buscar') page = <SearchPage />;
  else if (first === 'p' && rest[0]) page = <ProductPage id={rest[0]} />;
  else if (first === 'catalogo') page = <CatalogPage segs={rest} />;
  else if (first === 'servicio') page = <ServicePage />;
  else if (first === 'verificar') page = <VerifyPage />;
  else if (first === 'pedido') page = <OrderPage key={rest[0] ?? 'nuevo'} code={rest[0]} />;
  else page = <HomePage />;

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
      >
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido" key={first ?? 'home'}>
        {page}
      </main>
      <Footer />
      {meta && <SearchPalette />}
      <CartDrawer />
      <Toasts />
    </>
  );
}
