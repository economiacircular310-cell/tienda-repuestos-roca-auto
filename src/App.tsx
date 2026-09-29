import { useEffect } from 'react';
import { useRoute } from './lib/router';
import { useStore } from './lib/store';
import { applyTheme, openPalette, theme, ui } from './state/app';
import { warmUp } from './search/client';
import { Header } from './components/Header';
import { SearchPalette } from './components/SearchPalette';
import { CartDrawer, Footer, Toasts } from './components/Chrome';
import { HomePage } from './pages/Home';
import { SearchPage } from './pages/SearchPage';
import { ProductPage } from './pages/ProductPage';
import { CatalogPage } from './pages/CatalogPage';
import { ServicePage } from './pages/ServicePage';

export function App() {
  const route = useRoute();
  const pref = useStore(theme);
  const pathKey = route.path.join('/');

  useEffect(() => applyTheme(pref), [pref]);
  useEffect(() => warmUp(), []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable="true"]');
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
  if (!first) page = <HomePage />;
  else if (first === 'buscar') page = <SearchPage />;
  else if (first === 'p' && rest[0]) page = <ProductPage id={rest[0]} />;
  else if (first === 'catalogo') page = <CatalogPage segs={rest} />;
  else if (first === 'servicio') page = <ServicePage />;
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
      <SearchPalette />
      <CartDrawer />
      <Toasts />
    </>
  );
}
