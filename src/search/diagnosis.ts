/**
 * Diagnóstico por síntomas.
 *
 * Modelo bayesiano simple y explicable:
 *   P(pieza | síntoma, vehículo) ∝ P(síntoma | pieza) · P(pieza desgastada | km estimados)
 *
 * - P(síntoma | pieza): pesos de taller por síntoma (tabla SYMPTOMS).
 * - P(desgaste | km): 1 − e^(−km / vida útil), suavizado para no descartar nada.
 * - km estimados: 15 000 km por año de antigüedad del vehículo (60 000 si no hay vehículo).
 *
 * Es orientativo: la interfaz siempre sugiere confirmar con un técnico.
 */
import { PART_TYPE_BY_ID } from '../data/catalog';
import { MAX_YEAR } from '../data/vehicles';
import { STOPWORDS, editDistance, tokens, typoBudget, type Tok } from './text';

export interface Symptom {
  id: string;
  label: string;
  phrases: string[];
  causes: [string, number][];
  advice: string;
}

export const SYMPTOMS: Symptom[] = [
  {
    id: 'ruido-frenar',
    label: 'Chirrido o ruido al frenar',
    phrases: [
      'ruido al frenar',
      'chilla al frenar',
      'rechina al frenar',
      'chirrido al frenar',
      'suenan los frenos',
      'chillan los frenos',
      'rechinan los frenos',
    ],
    causes: [
      ['pastillas-freno', 0.55],
      ['disco-freno', 0.25],
      ['caliper', 0.1],
      ['zapatas-freno', 0.1],
    ],
    advice: 'Un chillido metálico suele ser el testigo de desgaste de las pastillas. Si hay roce metal con metal, revisa también los discos.',
  },
  {
    id: 'vibra-frenar',
    label: 'Vibración al frenar',
    phrases: ['vibra al frenar', 'tiembla al frenar', 'pedal pulsa', 'volante vibra al frenar', 'vibracion al frenar'],
    causes: [
      ['disco-freno', 0.6],
      ['pastillas-freno', 0.2],
      ['rodamiento-rueda', 0.1],
      ['terminal-direccion', 0.1],
    ],
    advice: 'La vibración en el pedal o el volante casi siempre es un disco alabeado. Cambia discos y pastillas del mismo eje juntos.',
  },
  {
    id: 'calienta',
    label: 'El motor se calienta',
    phrases: ['se calienta', 'sobrecalienta', 'temperatura alta', 'bota agua', 'se recalienta', 'calentamiento del motor'],
    causes: [
      ['termostato', 0.3],
      ['bomba-agua', 0.25],
      ['radiador', 0.2],
      ['electroventilador', 0.15],
      ['refrigerante', 0.1],
    ],
    advice: 'Apaga el motor si la aguja llega al rojo. Termostato y bomba de agua son las fallas más comunes; revisa también fugas y el ventilador.',
  },
  {
    id: 'no-arranca',
    label: 'No arranca',
    phrases: ['no arranca', 'no enciende', 'no prende', 'no da marcha', 'no quiere arrancar', 'cuesta arrancar'],
    causes: [
      ['bateria', 0.45],
      ['motor-arranque', 0.25],
      ['alternador', 0.1],
      ['bomba-gasolina', 0.1],
      ['bujia', 0.1],
    ],
    advice: 'Si hace clic y no gira, empieza por la batería y el motor de arranque. Si gira pero no enciende, revisa combustible y encendido.',
  },
  {
    id: 'descarga',
    label: 'La batería se descarga',
    phrases: ['se descarga la bateria', 'bateria se descarga', 'bateria descargada', 'no carga la bateria', 'luz de bateria'],
    causes: [
      ['alternador', 0.5],
      ['bateria', 0.4],
      ['correa-accesorios', 0.1],
    ],
    advice: 'Con el motor encendido deberías medir entre 13,8 y 14,6 V. Menos que eso apunta al alternador o a la correa.',
  },
  {
    id: 'falla-motor',
    label: 'El motor falla o jalonea',
    phrases: ['jalonea', 'tironea', 'falla el motor', 'cascabelea', 'pierde fuerza', 'motor falla', 'se jalonea', 'no tiene fuerza'],
    causes: [
      ['bujia', 0.35],
      ['bobina', 0.3],
      ['inyector', 0.15],
      ['filtro-combustible', 0.1],
      ['cables-bujia', 0.1],
    ],
    advice: 'Los tirones al acelerar suelen venir del encendido: bujías gastadas o una bobina que falla. Cámbialas en juego.',
  },
  {
    id: 'check-engine',
    label: 'Luz de check engine encendida',
    phrases: ['check engine', 'luz de motor', 'testigo del motor', 'luz check', 'foco de motor'],
    causes: [
      ['sensor-oxigeno', 0.35],
      ['bujia', 0.15],
      ['bobina', 0.15],
      ['catalizador', 0.15],
      ['sensor-ciguenal', 0.1],
      ['cuerpo-aceleracion', 0.1],
    ],
    advice: 'Lee el código OBD-II (P0xxx) con un escáner: P0130–P0167 apuntan al sensor de oxígeno y P0300–P0304 al encendido.',
  },
  {
    id: 'golpeteo',
    label: 'Golpeteo en la suspensión',
    phrases: [
      'golpeteo en la suspension',
      'ruido en baches',
      'suena la suspension',
      'traqueteo en la suspension',
      'golpe en los baches',
      'ruido en la suspension',
    ],
    causes: [
      ['bieleta', 0.3],
      ['amortiguador', 0.25],
      ['rotula', 0.15],
      ['bases-amortiguador', 0.15],
      ['brazo-control', 0.15],
    ],
    advice: 'Un «clac» seco en baches pequeños suele ser una bieleta. Si el auto rebota o se hunde, son los amortiguadores.',
  },
  {
    id: 'rebota',
    label: 'Rebota o se inclina en las curvas',
    phrases: ['rebota mucho', 'se inclina en las curvas', 'se hunde al frenar', 'rebota', 'se mece'],
    causes: [
      ['amortiguador', 0.6],
      ['espiral', 0.2],
      ['bases-amortiguador', 0.2],
    ],
    advice: 'Presiona una esquina del auto y suéltala: si rebota más de una vez, el amortiguador está vencido. Cámbialos por pares.',
  },
  {
    id: 'se-va-lado',
    label: 'Se va hacia un lado',
    phrases: ['se va de lado', 'se jala hacia un lado', 'se carga a un lado', 'jala a un lado', 'se desvia'],
    causes: [
      ['terminal-direccion', 0.3],
      ['rotula', 0.25],
      ['brazo-control', 0.25],
      ['caliper', 0.2],
    ],
    advice: 'Revisa primero la presión de las llantas y la alineación. Si persiste, terminales y rótulas con juego son lo más común.',
  },
  {
    id: 'zumbido',
    label: 'Zumbido que aumenta con la velocidad',
    phrases: ['zumbido', 'zumba la rueda', 'ruido en la rueda', 'ruido que aumenta con la velocidad', 'ronroneo en la rueda'],
    causes: [
      ['rodamiento-rueda', 0.75],
      ['junta-homocinetica', 0.15],
      ['disco-freno', 0.1],
    ],
    advice: 'Un zumbido que cambia al girar a un lado u otro es casi siempre un rodamiento (maza) de rueda.',
  },
  {
    id: 'clic-girar',
    label: 'Clic o traqueteo al girar',
    phrases: ['truena al girar', 'clic al girar', 'traqueteo al girar', 'suena al dar la vuelta', 'tronido al girar'],
    causes: [
      ['junta-homocinetica', 0.7],
      ['terminal-direccion', 0.15],
      ['rotula', 0.15],
    ],
    advice: 'Un clic rítmico al girar con el volante a fondo es la junta homocinética. Revisa si el guardapolvo está roto.',
  },
  {
    id: 'embrague',
    label: 'El embrague patina',
    phrases: ['patina el clutch', 'patina el embrague', 'clutch duro', 'embrague duro', 'no entran los cambios', 'patina el croche'],
    causes: [
      ['kit-embrague', 0.85],
      ['aceite-transmision', 0.15],
    ],
    advice: 'Si el motor se acelera y el auto no avanza igual, el disco está gastado. Cambia el kit completo: plato, disco y collarín.',
  },
  {
    id: 'humo-negro',
    label: 'Humo negro por el escape',
    phrases: ['humo negro', 'sale humo negro', 'echa humo negro'],
    causes: [
      ['filtro-aire', 0.35],
      ['inyector', 0.35],
      ['sensor-oxigeno', 0.3],
    ],
    advice: 'Humo negro es exceso de combustible: filtro de aire tapado, inyectores goteando o un sensor que mide mal.',
  },
  {
    id: 'humo-blanco',
    label: 'Humo blanco y pierde refrigerante',
    phrases: ['humo blanco', 'sale humo blanco', 'echa humo blanco', 'pierde refrigerante'],
    causes: [
      ['empaque-culata', 0.7],
      ['refrigerante', 0.15],
      ['termostato', 0.15],
    ],
    advice: 'Humo blanco denso y dulce con pérdida de refrigerante indica empaque de culata. No sigas manejando: puede dañar el motor.',
  },
  {
    id: 'ac',
    label: 'El aire acondicionado no enfría',
    phrases: ['no enfria el aire', 'aire acondicionado no enfria', 'a c no enfria', 'no enfria', 'aire caliente'],
    causes: [
      ['compresor-ac', 0.45],
      ['condensador', 0.35],
      ['electroventilador', 0.2],
    ],
    advice: 'Si el compresor no embraga, revisa carga de gas y compresor. Si enfría solo en carretera, puede ser el condensador o el ventilador.',
  },
  {
    id: 'olor-cabina',
    label: 'Mal olor en la cabina',
    phrases: ['mal olor', 'huele a humedad', 'olor a humedad', 'olor feo en la cabina', 'huele feo'],
    causes: [
      ['filtro-cabina', 0.9],
      ['condensador', 0.1],
    ],
    advice: 'El olor a humedad al encender el aire es el filtro de cabina saturado. Uno con carbón activado elimina olores.',
  },
  {
    id: 'correa',
    label: 'Chillido del motor al arrancar',
    phrases: ['chilla la banda', 'chilla la correa', 'rechina la correa', 'chillido del motor', 'rechina al arrancar', 'chilla al encender'],
    causes: [
      ['correa-accesorios', 0.75],
      ['bomba-agua', 0.15],
      ['alternador', 0.1],
    ],
    advice: 'Un chillido agudo en frío o al girar el volante es la correa de accesorios cristalizada o floja.',
  },
  {
    id: 'escape-ruido',
    label: 'Escape ruidoso',
    phrases: ['escape ruidoso', 'suena fuerte el escape', 'ruido en el escape', 'truena el escape', 'escape roto'],
    causes: [
      ['silenciador', 0.6],
      ['catalizador', 0.4],
    ],
    advice: 'Un ruido grave que sube con las revoluciones es una fuga o un silenciador perforado. Un cascabeleo metálico, el catalizador.',
  },
  {
    id: 'consumo',
    label: 'Consume mucho combustible',
    phrases: ['consume mucha gasolina', 'gasta mucho combustible', 'gasta mucha gasolina', 'alto consumo', 'consume mucho'],
    causes: [
      ['sensor-oxigeno', 0.3],
      ['bujia', 0.25],
      ['filtro-aire', 0.2],
      ['inyector', 0.15],
      ['termostato', 0.1],
    ],
    advice: 'Un sensor de oxígeno perezoso o bujías gastadas pueden subir el consumo más de un 15 %.',
  },
  {
    id: 'ralenti',
    label: 'Ralentí inestable o se apaga',
    phrases: ['ralenti inestable', 'marcha minima inestable', 'se apaga solo', 'se apaga en los altos', 'se apaga'],
    causes: [
      ['cuerpo-aceleracion', 0.4],
      ['bujia', 0.2],
      ['sensor-ciguenal', 0.2],
      ['inyector', 0.2],
    ],
    advice: 'Un cuerpo de aceleración sucio es la causa más común. Si se apaga en caliente, revisa el sensor de cigüeñal.',
  },
  {
    id: 'fuga-agua',
    label: 'Fuga de refrigerante',
    phrases: ['fuga de agua', 'pierde agua', 'gotea refrigerante', 'fuga de refrigerante', 'gotea agua verde'],
    causes: [
      ['radiador', 0.35],
      ['bomba-agua', 0.35],
      ['termostato', 0.15],
      ['refrigerante', 0.15],
    ],
    advice: 'Busca la mancha: al frente es el radiador; cerca de la correa, la bomba de agua.',
  },
  {
    id: 'luces',
    label: 'Luces débiles o fundidas',
    phrases: ['luz debil', 'luces debiles', 'no prende una luz', 'faro opaco', 'se fundio el foco', 'foco fundido', 'alumbra poco'],
    causes: [
      ['bombillo', 0.6],
      ['faro', 0.4],
    ],
    advice: 'Si la mica está amarilla, un faro nuevo recupera la visibilidad. Cambia los bombillos por pares para igualar el tono.',
  },
  {
    id: 'plumillas',
    label: 'El limpiaparabrisas deja rayas',
    phrases: ['deja rayas', 'limpia mal', 'plumas rayan', 'limpiaparabrisas no limpia', 'plumillas rayan'],
    causes: [['plumillas', 1]],
    advice: 'El caucho se endurece con el sol: cámbialas cada año.',
  },
];

/** Vida útil típica en km (base del término de desgaste). */
export const SERVICE_LIFE: Record<string, number> = {
  'pastillas-freno': 40000,
  'disco-freno': 80000,
  caliper: 150000,
  'zapatas-freno': 60000,
  'manguera-freno': 120000,
  'liquido-frenos': 40000,
  amortiguador: 80000,
  'brazo-control': 120000,
  rotula: 100000,
  'terminal-direccion': 100000,
  bieleta: 80000,
  espiral: 200000,
  'rodamiento-rueda': 120000,
  'bases-amortiguador': 100000,
  'kit-distribucion': 100000,
  'correa-accesorios': 60000,
  'empaque-culata': 250000,
  'bomba-aceite': 250000,
  'soporte-motor': 150000,
  'filtro-aceite': 10000,
  'filtro-aire': 20000,
  'filtro-cabina': 20000,
  'filtro-combustible': 40000,
  'aceite-motor': 10000,
  bujia: 40000,
  bobina: 150000,
  'cables-bujia': 80000,
  bateria: 70000,
  alternador: 180000,
  'motor-arranque': 180000,
  'sensor-oxigeno': 120000,
  'sensor-ciguenal': 200000,
  radiador: 180000,
  'bomba-agua': 100000,
  termostato: 100000,
  electroventilador: 180000,
  refrigerante: 60000,
  'kit-embrague': 120000,
  'junta-homocinetica': 150000,
  'aceite-transmision': 60000,
  catalizador: 200000,
  silenciador: 150000,
  faro: 250000,
  calavera: 250000,
  bombillo: 40000,
  espejo: 300000,
  plumillas: 20000,
  parachoques: 300000,
  'compresor-ac': 200000,
  condensador: 200000,
  'bomba-gasolina': 180000,
  inyector: 180000,
  'cuerpo-aceleracion': 150000,
};

export const KM_PER_YEAR = 15000;
export const estimateKm = (year?: number) => (year ? Math.max(5000, (MAX_YEAR - year + 0.5) * KM_PER_YEAR) : 60000);

export interface Diagnosis {
  symptomId: string;
  label: string;
  advice: string;
  km: number;
  kmEstimated: boolean;
  causes: { partTypeId: string; name: string; p: number }[];
}

export function rankCauses(s: Symptom, km: number): Diagnosis['causes'] {
  const raw = s.causes.map(([pt, likelihood]) => {
    const life = SERVICE_LIFE[pt] ?? 120000;
    const wear = 1 - Math.exp(-km / life);
    return { partTypeId: pt, name: PART_TYPE_BY_ID.get(pt)!.name, w: likelihood * (0.35 + 0.65 * wear) };
  });
  const total = raw.reduce((a, b) => a + b.w, 0) || 1;
  return raw.map((r) => ({ partTypeId: r.partTypeId, name: r.name, p: r.w / total })).sort((a, b) => b.p - a.p);
}

export function diagnoseSymptom(id: string, year?: number, km?: number): Diagnosis | null {
  const s = SYMPTOMS.find((x) => x.id === id);
  if (!s) return null;
  const k = km ?? estimateKm(year);
  return { symptomId: s.id, label: s.label, advice: s.advice, km: k, kmEstimated: km == null, causes: rankCauses(s, k) };
}

interface CompiledPhrase {
  symptom: Symptom;
  toks: string[];
}
let compiled: CompiledPhrase[] | undefined;
const content = (t: Tok[]) => t.filter((x) => !STOPWORDS.has(x.f));

function getCompiled() {
  if (!compiled) {
    compiled = SYMPTOMS.flatMap((symptom) => symptom.phrases.map((ph) => ({ symptom, toks: content(tokens(ph)).map((t) => t.s) }))).filter(
      (c) => c.toks.length > 0,
    );
  }
  return compiled;
}

const same = (a: string, b: string) => a === b || (b.length >= 5 && editDistance(a, b, typoBudget(b.length)) <= typoBudget(b.length));

/** Busca un síntoma en los tokens de la consulta. Devuelve los tokens consumidos. */
export function findSymptom(toks: Tok[]): { symptom: Symptom; used: Tok[] } | null {
  const cand = content(toks);
  let best: { symptom: Symptom; used: Tok[]; score: number } | null = null;
  for (const c of getCompiled()) {
    const used: Tok[] = [];
    for (const pt of c.toks) {
      const hit = cand.find((t) => !used.includes(t) && same(t.s, pt));
      if (hit) used.push(hit);
    }
    const needed = c.toks.length >= 3 ? c.toks.length - 1 : c.toks.length;
    if (used.length < needed) continue;
    const score = used.length + used.length / c.toks.length;
    if (!best || score > best.score) best = { symptom: c.symptom, used, score };
  }
  return best && { symptom: best.symptom, used: best.used };
}
