/**
 * Lámina técnica del vehículo con llamadas numeradas por sistema, como en un catálogo
 * de despiece OEM. Cada llamada lleva a su categoría (filtrada por el vehículo activo).
 */
import { M } from '../api/meta';
import { fmtInt } from '../config';

export interface Zone {
  cat: string;
  n: number;
  target: [number, number];
  label: [number, number];
}

export const ZONES: Zone[] = [
  { cat: 'carroceria', n: 1, target: [616, 197], label: [560, 58] },
  { cat: 'electrico', n: 2, target: [656, 223], label: [622, 58] },
  { cat: 'suspension', n: 3, target: [675, 236], label: [690, 34] },
  { cat: 'encendido', n: 4, target: [716, 217], label: [760, 58] },
  { cat: 'motor', n: 5, target: [722, 258], label: [832, 104] },
  { cat: 'iluminacion', n: 6, target: [786, 244], label: [874, 158] },
  { cat: 'enfriamiento', n: 7, target: [791, 262], label: [874, 222] },
  { cat: 'filtros', n: 8, target: [754, 289], label: [826, 408] },
  { cat: 'transmision', n: 9, target: [700, 301], label: [712, 408] },
  { cat: 'frenos', n: 10, target: [656, 292], label: [598, 408] },
  { cat: 'combustible', n: 11, target: [355, 303], label: [355, 408] },
  { cat: 'escape', n: 12, target: [133, 327], label: [133, 408] },
];

const spring = (x: number, y1: number, y2: number, w = 7, turns = 5) => {
  const h = (y2 - y1) / (turns * 2);
  let d = `M${x} ${y1}`;
  for (let i = 1; i <= turns * 2; i++) d += `L${x + (i % 2 ? w : -w)} ${y1 + h * i}`;
  return `${d}L${x} ${y2}`;
};

function Wheel({ cx, cy, caliper }: { cx: number; cy: number; caliper?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={48} fill="var(--bp)" stroke="var(--bp-ink)" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={43} fill="none" stroke="var(--bp-dim)" strokeDasharray="2 5" />
      <circle cx={cx} cy={cy} r={34} fill="none" stroke="var(--bp-ink)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={24} fill="none" stroke="var(--bp-dim)" strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={7} fill="none" stroke="var(--bp-ink)" strokeWidth={1.5} />
      {Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return <circle key={i} cx={cx + 13 * Math.cos(a)} cy={cy + 13 * Math.sin(a)} r={2} fill="var(--bp-ink)" />;
      })}
      {caliper && (
        <path d={`M${cx - 23} ${cy - 6} A 24 24 0 0 1 ${cx - 12} ${cy - 21}`} fill="none" stroke="var(--accent)" strokeWidth={8} strokeLinecap="round" />
      )}
    </g>
  );
}

export function BlueprintCar({
  counts,
  active,
  onHover,
  onSelect,
  vehicleName,
}: {
  counts: Record<string, number> | null;
  active: string | null;
  onHover: (cat: string | null) => void;
  onSelect: (cat: string) => void;
  vehicleName?: string;
}) {
  const dim = 'var(--bp-dim)';
  const ink = 'var(--bp-ink)';
  const activeZone = ZONES.find((z) => z.cat === active);
  return (
    <svg viewBox="0 0 900 430" className="h-auto w-full max-w-full" role="group" aria-label="Lámina del vehículo: elige un sistema para ver sus repuestos">
      {/* Cuadro de rotulación */}
      <g fontFamily="var(--font-mono)" fontSize="10" fill={dim}>
        <rect x="16" y="16" width="250" height="66" fill="none" stroke={dim} />
        <path d="M16 38h250M16 60h250M170 38v44" stroke={dim} />
        <text x="24" y="31" fill={ink} fontWeight="600" letterSpacing="1">
          LENIN AUTO CARS · LÁM. 01
        </text>
        <text x="24" y="53" letterSpacing="0.5">
          {(vehicleName ?? 'Vehículo genérico').toUpperCase().slice(0, 24)}
        </text>
        <text x="178" y="53">
          ESC. 1:25
        </text>
        <text x="24" y="75">
          VISTA LATERAL · IZQ.
        </text>
        <text x="178" y="75">
          {counts ? `${fmtInt(Object.values(counts).reduce((a, b) => a + b, 0))} REF.` : '—'}
        </text>
      </g>

      {/* Piezas ocultas (línea de trazos, como en un plano) */}
      <g fill="none" stroke={dim} strokeWidth={1.3} strokeDasharray="5 4">
        <path d="M718 294C718 314 704 326 680 326H604M560 326H162M104 327H84" />
        <rect x="560" y="318" width="44" height="16" rx="6" />
        <rect x="104" y="316" width="58" height="22" rx="10" />
        <rect x="312" y="292" width="86" height="22" rx="4" />
        <rect x="644" y="214" width="24" height="18" rx="2" />
        <rect x="690" y="220" width="62" height="12" rx="2" />
        <rect x="686" y="232" width="70" height="54" rx="3" />
        <path d="M696 286l4 10h42l4-10" />
        <rect x="748" y="282" width="12" height="14" rx="2" />
        <circle cx="768" cy="238" r="7" />
        <circle cx="768" cy="276" r="10" />
        <path d="M761 238l-3 38M775 238l3 38" />
        <rect x="786" y="232" width="10" height="56" rx="1" />
        <path d="M675 306L700 301" strokeDasharray="none" strokeWidth={2.5} />
        <path d={spring(675, 222, 256)} strokeDasharray="none" />
        <path d="M675 212v10" strokeDasharray="none" />
        <path d={spring(224, 222, 256)} strokeDasharray="none" />
        <path d="M224 212v10" strokeDasharray="none" />
      </g>
      <g stroke={ink} strokeWidth={1.3}>
        {[702, 716, 730, 744].map((x) => (
          <path key={x} d={`M${x} 213v7`} />
        ))}
      </g>

      {/* Carrocería */}
      <path
        className="draw-in"
        d="M92 318V262Q94 236 118 228L196 214L262 206C300 170 330 140 372 128L520 124C560 126 590 150 626 190L650 206L760 222Q800 228 808 250L810 288Q808 318 790 318H741A66 66 0 0 0 609 318H290A66 66 0 0 0 158 318Z"
        fill="none"
        stroke={ink}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <g fill="none" stroke={ink} strokeWidth={1.5} strokeLinejoin="round">
        <path d="M298 204C322 176 348 156 378 146L512 142C548 146 574 168 600 200V204Z" />
        <path d="M452 142V314M604 208L598 300M300 206L304 300" />
        <path d="M262 209L650 213" stroke={dim} />
        <path d="M290 306H609" stroke={dim} />
        <path d="M606 196l16-8 10 4-3 10-20 2z" />
        <path d="M768 232L802 238Q806 250 798 254L770 250Z" />
        <path d="M96 240L126 232 128 250 98 256Z" />
        <path d="M792 266h14M792 274h14M742 298h64" stroke={dim} />
        <rect x="412" y="222" width="24" height="5" rx="2" />
        <rect x="562" y="224" width="24" height="5" rx="2" />
      </g>
      <rect x="449" y="143" width="7" height="60" fill={ink} />

      <Wheel cx={224} cy={306} />
      <Wheel cx={675} cy={306} caliper />

      {/* Piso y cota de distancia entre ejes */}
      <path d="M40 354H860" stroke={dim} strokeWidth={1} />
      <g stroke={dim} strokeWidth={1} fontFamily="var(--font-mono)" fontSize="10" fill={dim}>
        <path d="M224 360v26M675 360v26M224 380H675" />
        <path d="M224 380l9-4v8zM675 380l-9-4v8z" fill={dim} />
        <text x="449" y="374" textAnchor="middle" stroke="none" letterSpacing="1">
          DISTANCIA ENTRE EJES
        </text>
      </g>

      {/* Llamadas */}
      {ZONES.map((z) => {
        const on = active === z.cat;
        const cat = M().categories.find((x) => x.id === z.cat)!;
        return (
          <g
            key={z.cat}
            role="button"
            tabIndex={0}
            aria-label={`${z.n}. ${cat.name}${counts ? `, ${counts[z.cat] ?? 0} piezas` : ''}`}
            className="cursor-pointer outline-none"
            onMouseEnter={() => onHover(z.cat)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(z.cat)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(z.cat)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(z.cat);
              }
            }}
          >
            <line x1={z.label[0]} y1={z.label[1]} x2={z.target[0]} y2={z.target[1]} stroke={on ? 'var(--accent)' : dim} strokeWidth={on ? 1.8 : 1} />
            <circle cx={z.target[0]} cy={z.target[1]} r={3.5} fill="var(--accent)" />
            <circle
              cx={z.target[0]}
              cy={z.target[1]}
              r={7}
              fill="none"
              stroke="var(--accent)"
              className="hotspot-ring"
              style={{ animationDelay: `${z.n * 0.18}s` }}
            />
            <circle cx={z.label[0]} cy={z.label[1]} r={24} fill="transparent" />
            <circle cx={z.label[0]} cy={z.label[1]} r={13} fill={on ? 'var(--accent)' : 'var(--bp)'} stroke={on ? 'var(--accent)' : ink} strokeWidth={1.5} />
            <text
              x={z.label[0]}
              y={z.label[1] + 4}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="12"
              fontWeight="600"
              fill={on ? 'var(--accent-ink)' : ink}
            >
              {z.n}
            </text>
          </g>
        );
      })}

      {activeZone && (
        <g pointerEvents="none" fontFamily="var(--font-sans)">
          {(() => {
            const cat = M().categories.find((x) => x.id === activeZone.cat)!;
            const text = `${cat.name}${counts ? ` · ${fmtInt(counts[activeZone.cat] ?? 0)} piezas` : ''}`;
            const w = Math.max(120, text.length * 7.4 + 24);
            const x = Math.min(884 - w, Math.max(16, activeZone.label[0] - w / 2));
            const below = activeZone.label[1] < 200;
            const y = below ? activeZone.label[1] + 22 : activeZone.label[1] - 56;
            return (
              <>
                <rect x={x} y={y} width={w} height={32} rx={4} fill="var(--accent)" />
                <text x={x + 12} y={y + 21} fontSize="14" fontWeight="600" fill="var(--accent-ink)">
                  {text}
                </text>
              </>
            );
          })()}
        </g>
      )}
    </svg>
  );
}
