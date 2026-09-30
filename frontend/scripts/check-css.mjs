// Falla el build si alguna utilidad usa opacidad con color-mix() («bg-bp/60»): en navegadores
// sin color-mix (Chrome < 111, Safari < 16.4) Tailwind la deja opaca y tapa la pantalla.
// Usa los tokens «-aNN» de src/index.css (rgb(var(--x-rgb) / alfa)).
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../dist/assets/', import.meta.url);
const bad = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.css'))) {
  const css = readFileSync(new URL(file, dir), 'utf8');
  for (const m of css.matchAll(/@supports \(color:color-mix\(in lab, ?red, ?red\)\)\{\.((?:\\.|[^{\s,])+)/g)) {
    bad.push(m[1].replace(/\\/g, ''));
  }
}
if (bad.length) {
  console.error(`✗ ${bad.length} clases con opacidad por color-mix(), opacas en navegadores anteriores a 2023:`);
  console.error('  ' + [...new Set(bad)].join('  '));
  console.error('  Usa los tokens -aNN de src/index.css, p. ej. bg-bp-a60 en vez de bg-bp/60.');
  process.exit(1);
}
console.log('✓ CSS compatible: ninguna opacidad depende de color-mix()');
