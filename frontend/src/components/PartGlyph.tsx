/** Dibujos lineales de cada categoría, en estilo de lámina técnica. viewBox 0 0 120 120. */
import type { ReactNode } from 'react';

function gearPath(cx: number, cy: number, teeth: number, rOuter: number, rInner: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const corners = [
      [rInner, a - step * 0.5],
      [rInner, a - step * 0.22],
      [rOuter, a - step * 0.14],
      [rOuter, a + step * 0.14],
      [rInner, a + step * 0.22],
    ];
    for (const [r, ang] of corners) pts.push(`${(cx + r * Math.cos(ang)).toFixed(1)} ${(cy + r * Math.sin(ang)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

const ring = (cx: number, cy: number, r: number, n: number, dot: number, off = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = off + (i * Math.PI * 2) / n;
    return <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={dot} />;
  });

const zigzag = (x1: number, x2: number, y1: number, y2: number, turns: number) => {
  const h = (y2 - y1) / (turns * 2);
  let d = `M${x1} ${y1}`;
  for (let i = 1; i <= turns * 2; i++) d += `L${i % 2 ? x2 : x1} ${y1 + h * i}`;
  return d;
};

const GLYPHS: Record<string, ReactNode> = {
  frenos: (
    <>
      <circle cx="56" cy="62" r="42" />
      <circle cx="56" cy="62" r="30" strokeDasharray="3 4" />
      <circle cx="56" cy="62" r="15" />
      <g className="fill-current stroke-none">{ring(56, 62, 9, 5, 2.2, -Math.PI / 2)}</g>
      <g className="fill-current stroke-none opacity-70">{ring(56, 62, 36, 8, 1.8, 0.2)}</g>
      <path d="M78 16c16 6 28 20 30 38l-14 3c-2-12-10-22-20-27z" className="fill-current/15" />
      <path d="M86 30l6-4M96 44l7-2" />
    </>
  ),
  suspension: (
    <>
      <rect x="50" y="10" width="20" height="8" rx="2" />
      <path d="M60 18v26" />
      <rect x="49" y="44" width="22" height="58" rx="3" />
      <path d={zigzag(38, 82, 22, 90, 5)} />
      <path d="M34 22h52M34 90h52" />
      <circle cx="60" cy="108" r="6" />
    </>
  ),
  motor: (
    <>
      <rect x="22" y="40" width="70" height="46" rx="3" />
      <rect x="26" y="26" width="62" height="14" rx="2" />
      <g className="fill-current stroke-none">
        {[36, 50, 64, 78].map((x) => (
          <circle key={x} cx={x} cy={33} r={2.4} />
        ))}
      </g>
      <path d="M30 86l6 14h42l6-14" />
      <circle cx="100" cy="46" r="7" />
      <circle cx="100" cy="80" r="10" />
      <path d="M93 46v34M107 46v34" strokeDasharray="3 3" />
      <path d="M36 58h40M36 68h40" strokeDasharray="2 4" />
    </>
  ),
  filtros: (
    <>
      <path d="M34 30c0-8 52-8 52 0v66c0 6-52 6-52 0z" />
      <path d="M34 30c0 8 52 8 52 0" />
      {[44, 52, 60, 68, 76].map((x) => (
        <path key={x} d={`M${x} 40v50`} strokeDasharray="4 3" />
      ))}
      <ellipse cx="60" cy="22" rx="14" ry="4" />
      <circle cx="60" cy="22" r="2" className="fill-current" />
    </>
  ),
  encendido: (
    <>
      <rect x="54" y="6" width="12" height="10" rx="2" />
      <path d="M50 16h20l-2 30H52z" />
      {[24, 32, 40].map((y) => (
        <path key={y} d={`M51 ${y}h18`} />
      ))}
      <path d="M46 46h28l6 10-6 10H46l-6-10z" />
      <path d={zigzag(50, 70, 66, 96, 4)} />
      <path d="M50 66v30M70 66v30" />
      <path d="M58 96v8M62 104h10v-8" />
      <path d="M84 100l8 4M84 108l10 0" strokeDasharray="2 3" />
    </>
  ),
  electrico: (
    <>
      <rect x="18" y="36" width="84" height="60" rx="4" />
      <rect x="28" y="26" width="14" height="10" rx="1" />
      <rect x="78" y="26" width="14" height="10" rx="1" />
      <path d="M31 50h8M35 46v8M81 50h8" />
      <path d="M62 52l-10 18h10l-6 16 16-22H60l6-12z" className="fill-current/15" />
    </>
  ),
  enfriamiento: (
    <>
      <rect x="20" y="22" width="80" height="12" rx="2" />
      <rect x="20" y="86" width="80" height="12" rx="2" />
      <path d="M22 34v52M98 34v52" />
      {Array.from({ length: 12 }, (_, i) => 28 + i * 6).map((x) => (
        <path key={x} d={`M${x} 34v52`} strokeDasharray="1.5 2.5" />
      ))}
      <circle cx="88" cy="16" r="5" />
      <path d="M100 92h10M100 28h10" />
    </>
  ),
  transmision: (
    <>
      <path d={gearPath(48, 60, 14, 34, 27)} />
      <circle cx="48" cy="60" r="10" />
      <path d="M44 50h8v4h-8z" className="fill-current" />
      <path d={gearPath(94, 34, 9, 18, 13)} />
      <circle cx="94" cy="34" r="5" />
    </>
  ),
  escape: (
    <>
      <rect x="24" y="40" width="64" height="40" rx="20" />
      <path d="M40 44v32M56 44v32M72 44v32" strokeDasharray="3 3" />
      <path d="M4 56h20M4 64h20M88 60h28M88 68h28" />
      <path d="M104 50l10-6M108 58l10-2" strokeDasharray="2 3" />
    </>
  ),
  iluminacion: (
    <>
      <path d="M18 30h56c14 0 24 12 24 30s-10 30-24 30H18z" />
      <circle cx="50" cy="60" r="18" />
      <circle cx="50" cy="60" r="7" className="fill-current/20" />
      <path d="M102 44l14-6M104 60h14M102 76l14 6" />
    </>
  ),
  carroceria: (
    <>
      <path d="M26 30c0-6 6-10 14-10h46c8 0 14 6 12 14l-6 34c-2 8-8 12-16 12H38c-8 0-12-6-12-12z" />
      <path d="M34 36h54l-5 30H40z" className="fill-current/10" />
      <path d="M52 80l-6 22h24l-6-22" />
      <path d="M40 102h40" />
    </>
  ),
  climatizacion: (
    <>
      <circle cx="44" cy="62" r="30" />
      <circle cx="44" cy="62" r="20" />
      <circle cx="44" cy="62" r="6" />
      <rect x="74" y="42" width="30" height="40" rx="4" />
      <path d="M96 18v20M88 22l16 12M104 22l-16 12" />
    </>
  ),
  bottle: (
    <>
      <path d="M44 18h22v10H44z" />
      <path d="M40 28h34c6 0 10 4 10 10v62c0 4-3 7-7 7H37c-4 0-7-3-7-7V40c0-7 4-12 10-12z" />
      <path d="M84 44h6c4 0 6 3 6 6v18c0 3-2 6-6 6h-6" />
      <rect x="40" y="56" width="34" height="30" rx="2" className="fill-current/10" />
      <path d="M46 66h22M46 74h14" />
    </>
  ),
  bulb: (
    <>
      <rect x="48" y="84" width="24" height="18" rx="2" />
      <path d="M42 102h36" />
      <path d="M52 84V62c-6-4-8-12-8-20 0-12 7-22 16-22s16 10 16 22c0 8-2 16-8 20v22" />
      <path d="M56 64l4-12 4 12" strokeDasharray="2 2" />
      <path d="M96 30l10-6M100 46h12M96 62l10 6" />
    </>
  ),
  wiper: (
    <>
      <path d="M14 96L96 24" strokeWidth={4} />
      <path d="M18 104L104 30" />
      <path d="M96 24l12-4 4 10" />
      <circle cx="18" cy="100" r="7" />
      {[30, 44, 58, 72, 86].map((x, i) => (
        <path key={x} d={`M${x} ${92 - i * 12.3}l6 6`} />
      ))}
    </>
  ),
  combustible: (
    <>
      <rect x="46" y="8" width="28" height="18" rx="3" />
      <path d="M52 26h16v58H52z" />
      <path d="M48 40h24M48 72h24" />
      <path d="M56 84h8l-2 12h-4z" />
      <path d="M60 100l-10 14M60 100v16M60 100l10 14" strokeDasharray="2 3" />
    </>
  ),
};

/** Algunos tipos de pieza tienen dibujo propio (fluidos, bombillos, plumillas). */
const BY_TYPE: Record<string, string> = {
  'aceite-motor': 'bottle',
  'liquido-frenos': 'bottle',
  refrigerante: 'bottle',
  'aceite-transmision': 'bottle',
  bombillo: 'bulb',
  plumillas: 'wiper',
  bateria: 'electrico',
};

export function PartGlyph({ cat, pt, className = '' }: { cat: string; pt?: string; className?: string }) {
  const key = (pt && BY_TYPE[pt]) || cat;
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[key] ?? GLYPHS.motor}
    </svg>
  );
}

/** "Placa" de producto: dibujo sobre papel de plano con cota y número de parte. */
export function PartPlate({
  cat,
  pt,
  pn,
  size = 'md',
  className = '',
}: {
  cat: string;
  pt?: string;
  pn?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const pad = size === 'lg' ? 'p-10' : size === 'sm' ? 'p-2' : 'p-5';
  return (
    <div className={`bp-paper relative overflow-hidden rounded-md ${className}`}>
      <div className={`flex aspect-[4/3] max-w-full items-center justify-center ${pad}`}>
        <PartGlyph cat={cat} pt={pt} className="h-full max-h-full w-auto text-bp-ink" />
      </div>
      {size !== 'sm' && (
        <>
          <svg
            className="pointer-events-none absolute inset-x-3 bottom-2 h-3 w-[calc(100%-1.5rem)] text-bp-dim"
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 5h100M0 1v8M100 1v8" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
          </svg>
          {pn && <span className="label-caps absolute top-2.5 left-3 text-[10px] text-bp-dim">{pn}</span>}
        </>
      )}
    </div>
  );
}
