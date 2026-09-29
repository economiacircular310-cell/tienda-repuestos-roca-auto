/**
 * Decodificador de VIN (ISO 3779).
 * Local: fabricante (WMI), año modelo (posición 10) y dígito verificador (posición 9).
 * En línea (opcional): modelo y cilindrada con la API pública vPIC de la NHTSA.
 */
import { ENGINES, MAKES, MODELS, enginesFor, genFor } from '../data/vehicles';
import { fold } from '../search/text';

const WMI: [string, string][] = [
  ['JT', 'toyota'],
  ['MR0', 'toyota'],
  ['5TD', 'toyota'],
  ['5TF', 'toyota'],
  ['4T1', 'toyota'],
  ['2T1', 'toyota'],
  ['3TM', 'toyota'],
  ['9BR', 'toyota'],
  ['8AJ', 'toyota'],
  ['3N1', 'nissan'],
  ['3N6', 'nissan'],
  ['1N4', 'nissan'],
  ['1N6', 'nissan'],
  ['JN1', 'nissan'],
  ['JN8', 'nissan'],
  ['5N1', 'nissan'],
  ['VSK', 'nissan'],
  ['MNT', 'nissan'],
  ['94D', 'nissan'],
  ['1G1', 'chevrolet'],
  ['1GC', 'chevrolet'],
  ['1GN', 'chevrolet'],
  ['2G1', 'chevrolet'],
  ['3G1', 'chevrolet'],
  ['3GN', 'chevrolet'],
  ['KL1', 'chevrolet'],
  ['KL8', 'chevrolet'],
  ['9BG', 'chevrolet'],
  ['8AG', 'chevrolet'],
  ['1FA', 'ford'],
  ['1FT', 'ford'],
  ['1FM', 'ford'],
  ['3FA', 'ford'],
  ['2FM', 'ford'],
  ['MPB', 'ford'],
  ['9BF', 'ford'],
  ['8AF', 'ford'],
  ['WF0', 'ford'],
  ['WVW', 'volkswagen'],
  ['WVG', 'volkswagen'],
  ['3VW', 'volkswagen'],
  ['9BW', 'volkswagen'],
  ['8AW', 'volkswagen'],
  ['WV1', 'volkswagen'],
  ['WV2', 'volkswagen'],
  ['1HG', 'honda'],
  ['2HG', 'honda'],
  ['JHM', 'honda'],
  ['5J6', 'honda'],
  ['2HK', 'honda'],
  ['SHH', 'honda'],
  ['93H', 'honda'],
  ['19X', 'honda'],
  ['KMH', 'hyundai'],
  ['KM8', 'hyundai'],
  ['5NP', 'hyundai'],
  ['5NM', 'hyundai'],
  ['MAL', 'hyundai'],
  ['9BH', 'hyundai'],
  ['KNA', 'kia'],
  ['KND', 'kia'],
  ['5XX', 'kia'],
  ['3KP', 'kia'],
  ['JM1', 'mazda'],
  ['JM3', 'mazda'],
  ['3MZ', 'mazda'],
  ['3MV', 'mazda'],
  ['MM0', 'mazda'],
  ['JA3', 'mitsubishi'],
  ['JA4', 'mitsubishi'],
  ['JMY', 'mitsubishi'],
  ['MMB', 'mitsubishi'],
  ['MMA', 'mitsubishi'],
  ['ML3', 'mitsubishi'],
  ['JS2', 'suzuki'],
  ['JS3', 'suzuki'],
  ['TSM', 'suzuki'],
  ['MA3', 'suzuki'],
  ['VF1', 'renault'],
  ['93Y', 'renault'],
  ['9FB', 'renault'],
  ['8A1', 'renault'],
  ['UU1', 'renault'],
  ['1C4', 'jeep'],
  ['1J4', 'jeep'],
  ['1J8', 'jeep'],
  ['3C4', 'jeep'],
  ['ZAC', 'jeep'],
];

const REGION: [RegExp, string][] = [
  [/^[1-5]/, 'Norteamérica'],
  [/^[6-7]/, 'Oceanía'],
  [/^[8-9]/, 'Sudamérica'],
  [/^J/, 'Japón'],
  [/^K/, 'Corea del Sur'],
  [/^L/, 'China'],
  [/^M/, 'India / Tailandia / Indonesia'],
  [/^[S-Z]/, 'Europa'],
  [/^[A-H]/, 'África'],
];

const TRANSLIT: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY';

export const cleanVin = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 17);

export function checkDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const v = /\d/.test(c) ? Number(c) : (TRANSLIT[c] ?? 0);
    sum += v * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}

/** Completa el dígito verificador de un VIN de ejemplo con '?' en la posición 9. */
export const withCheckDigit = (vin: string) => {
  const base = vin.replace('?', '0');
  return base.slice(0, 8) + checkDigit(base) + base.slice(9);
};

export interface VinResult {
  vin: string;
  valid: boolean;
  error?: string;
  makeId?: string;
  makeName?: string;
  region?: string;
  year?: number;
  checkOk?: boolean;
  modelId?: string;
  engine?: string;
  online?: 'ok' | 'fail';
  onlineModel?: string;
}

export function decodeLocal(input: string): VinResult {
  const vin = cleanVin(input);
  if (vin.length !== 17) return { vin, valid: false, error: `El VIN tiene 17 caracteres; llevas ${vin.length}.` };
  if (/[IOQ]/.test(vin)) return { vin, valid: false, error: 'Un VIN nunca usa las letras I, O ni Q. Revisa si es un 1 o un 0.' };
  const wmi = WMI.find(([p]) => vin.startsWith(p));
  const make = wmi ? MAKES.find((m) => m.id === wmi[1]) : undefined;
  const yc = vin[9];
  let year: number | undefined;
  const li = YEAR_CODES.indexOf(yc);
  if (li >= 0) year = 2010 + li;
  else if (/[1-9]/.test(yc)) year = 2000 + Number(yc);
  if (year && year > new Date().getFullYear() + 1) year -= 30;
  return {
    vin,
    valid: true,
    makeId: make?.id,
    makeName: make?.name,
    region: REGION.find(([re]) => re.test(vin))?.[1],
    year,
    checkOk: checkDigit(vin) === vin[8],
  };
}

/** Consulta vPIC (NHTSA). Si la red lo bloquea, se queda con el resultado local. */
export async function decodeOnline(r: VinResult): Promise<VinResult> {
  if (!r.valid) return r;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4500);
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${r.vin}?format=json`, { signal: ctl.signal });
    clearTimeout(t);
    const json = await res.json();
    const row = json?.Results?.[0] ?? {};
    const modelName = fold(String(row.Model ?? ''));
    const makeName = fold(String(row.Make ?? ''));
    const year = Number(row.ModelYear) || r.year;
    const makeId = r.makeId ?? MAKES.find((m) => fold(m.name) === makeName)?.id;
    const model = MODELS.find(
      (m) =>
        m.makeId === makeId &&
        (fold(m.name).includes(modelName) || m.aliases.some((a) => fold(a) === modelName) || modelName.includes(fold(m.name.split(' ')[0]))),
    );
    let engine: string | undefined;
    if (model && year && genFor(model.id, year)) {
      const liters = parseFloat(row.DisplacementL);
      const engs = enginesFor(model.id, year);
      const byL = engs.filter((e) => Math.abs(ENGINES[e].liters - liters) < 0.06);
      engine = engs.length === 1 ? engs[0] : byL.length === 1 ? byL[0] : undefined;
    }
    return { ...r, makeId, year, modelId: model?.id, engine, online: 'ok', onlineModel: row.Model || undefined };
  } catch {
    return { ...r, online: 'fail' };
  }
}

export const SAMPLE_VINS = [
  { label: 'Toyota Corolla 2016', vin: withCheckDigit('2T1BURHE?GC741258') },
  { label: 'Honda Civic 2017', vin: withCheckDigit('2HGFC2F5?HH502114') },
  { label: 'Nissan Sentra 2019', vin: withCheckDigit('3N1AB7AP?KY230871') },
];
