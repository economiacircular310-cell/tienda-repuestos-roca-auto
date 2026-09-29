/** Utilidades de texto para español latinoamericano: acentos, plurales, errores de tipeo. */

export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Singulariza de forma simple y predecible (misma regla al indexar y al buscar). */
export function stem(t: string): string {
  if (t.length <= 3 || /\d/.test(t)) return t;
  if (t.endsWith('ces')) return `${t.slice(0, -3)}z`;
  if (t.length > 4 && /[rlndj]es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

export const STOPWORDS = new Set(
  (
    'de del la las el los lo un una unos unas para por con sin y o u en a al mi mis su sus que se es ' +
    'busco buscar buscando necesito quiero ocupo precio precios repuesto repuestos refaccion refacciones pieza piezas ' +
    'auto autos carro carros coche coches vehiculo vehiculos modelo ano anos marca tipo compatible compatibles ' +
    'venta comprar cual cuanto cuesta hay tienen tiene me sirve sirven the for of kit juego ' +
    'mucho mucha muy esta estan tengo cuando hace prendio prendida encendida'
  ).split(' '),
);

export interface Tok {
  raw: string;
  /** Minúsculas sin acentos. */
  f: string;
  /** Forma singularizada. */
  s: string;
  start: number;
  end: number;
}

const TOKEN_RE = /[\p{L}\p{N}]+(?:[.,]\d+)?/gu;

export function tokens(input: string): Tok[] {
  const out: Tok[] = [];
  for (const m of input.matchAll(TOKEN_RE)) {
    const f = fold(m[0]).replace(',', '.');
    out.push({ raw: m[0], f, s: stem(f), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Tokenizador del índice: separa 'x-trail' y además indexa la forma unida 'xtrail'. */
export function indexTokens(input: string): string[] {
  const parts = fold(input).match(/[a-z0-9]+(?:\.\d+)?/g) ?? [];
  const joined = fold(input).match(/[a-z0-9]+(?:[-/][a-z0-9]+)+/g) ?? [];
  return [...parts, ...joined.map((j) => j.replace(/[-/]/g, ''))];
}

export function processTerm(t: string): string | null {
  const f = fold(t);
  if (STOPWORDS.has(f)) return null;
  return stem(f);
}

/** Distancia de Damerau-Levenshtein (transposiciones incluidas) con corte temprano. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** Tolerancia a errores según la longitud de la palabra. */
export const typoBudget = (len: number) => (len >= 8 ? 2 : len >= 5 ? 1 : 0);

/** ¿Parece un número de parte? (letras+dígitos o 5+ dígitos, no un año ni una cilindrada) */
export function looksLikePN(key: string): boolean {
  if (key.length < 3) return false;
  if (/^(19|20)\d\d$/.test(key)) return false;
  const digits = (key.match(/\d/g) ?? []).length;
  if (!digits) return false;
  return digits >= 5 || (digits >= 2 && /[A-Z]/i.test(key) && key.length >= 4);
}
