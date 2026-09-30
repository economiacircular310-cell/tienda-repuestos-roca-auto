import { Component, type ReactNode } from 'react';

/** Si una sección falla al dibujarse, se muestra un aviso con salida en vez de una pantalla vacía. */
export class ErrorBoundary extends Component<{ children: ReactNode; compact?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Lenin Auto Cars: error al mostrar la sección', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) return null;
    return (
      <div className="mx-auto grid min-h-[50vh] max-w-xl place-items-center px-4 text-center" role="alert">
        <div>
          <p className="font-display text-3xl font-bold uppercase">Esta sección no se pudo mostrar</p>
          <p className="mt-2 text-muted">Puede ser un navegador desactualizado o un corte de conexión. El resto de la tienda sigue funcionando.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink" onClick={() => this.setState({ error: null })}>
              Reintentar
            </button>
            <a href="#/" onClick={() => this.setState({ error: null })} className="rounded-md border border-line-strong px-4 py-2 font-semibold">
              Ir al inicio
            </a>
          </div>
        </div>
      </div>
    );
  }
}
