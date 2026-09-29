import type { Body, Engine, Fuel, Generation, Make, Model, VehicleQuery } from './types';

export const MIN_YEAR = 2005;
export const MAX_YEAR = 2026;

export const MAKES: Make[] = [
  { id: 'chevrolet', name: 'Chevrolet', aliases: ['chevy', 'gm'] },
  { id: 'ford', name: 'Ford', aliases: [] },
  { id: 'honda', name: 'Honda', aliases: [] },
  { id: 'hyundai', name: 'Hyundai', aliases: ['hyunday', 'hiundai'] },
  { id: 'jeep', name: 'Jeep', aliases: [] },
  { id: 'kia', name: 'Kia', aliases: [] },
  { id: 'mazda', name: 'Mazda', aliases: [] },
  { id: 'mitsubishi', name: 'Mitsubishi', aliases: ['mitsu'] },
  { id: 'nissan', name: 'Nissan', aliases: ['nisan'] },
  { id: 'renault', name: 'Renault', aliases: ['reno'] },
  { id: 'suzuki', name: 'Suzuki', aliases: [] },
  { id: 'toyota', name: 'Toyota', aliases: [] },
  { id: 'volkswagen', name: 'Volkswagen', aliases: ['vw', 'volks', 'wolkswagen'] },
];

type E = [liters: number, cyl: number, fuel?: 'D' | 'H', turbo?: 1, layout?: 'V'];
const ENGINE_DEFS: Record<string, E> = {
  // Toyota
  '1ZZ-FE': [1.8, 4],
  '2ZR-FE': [1.8, 4],
  '1ZR-FE': [1.6, 4],
  'M20A-FKS': [2.0, 4],
  '2ZR-FXE': [1.8, 4, 'H'],
  '1NZ-FE': [1.5, 4],
  '2NR-FE': [1.5, 4],
  '2TR-FE': [2.7, 4],
  '1KD-FTV': [3.0, 4, 'D', 1],
  '1GD-FTV': [2.8, 4, 'D', 1],
  '2GD-FTV': [2.4, 4, 'D', 1],
  '2AZ-FE': [2.4, 4],
  '3ZR-FAE': [2.0, 4],
  '2AR-FE': [2.5, 4],
  'A25A-FKS': [2.5, 4],
  '1GR-FE': [4.0, 6, undefined, undefined, 'V'],
  // Nissan
  MR20DE: [2.0, 4],
  MR18DE: [1.8, 4],
  MR20DD: [2.0, 4],
  HR16DE: [1.6, 4],
  KA24DE: [2.4, 4],
  YD25DDTi: [2.5, 4, 'D', 1],
  QR25DE: [2.5, 4],
  YS23DDT: [2.3, 4, 'D', 1],
  // Chevrolet
  F16D3: [1.6, 4],
  L2B: [1.5, 4],
  LCU: [1.4, 4],
  B10D1: [1.0, 4],
  B12D1: [1.2, 4],
  'SPE-4': [1.4, 4],
  B10XFT: [1.0, 3, undefined, 1],
  F18D4: [1.8, 4],
  LE2: [1.4, 4, undefined, 1],
  LC9: [5.3, 8, undefined, undefined, 'V'],
  L83: [5.3, 8, undefined, undefined, 'V'],
  L84: [5.3, 8, undefined, undefined, 'V'],
  L87: [6.2, 8, undefined, undefined, 'V'],
  LE5: [2.4, 4],
  Z20S: [2.0, 4, 'D', 1],
  // Ford
  'Duratec 2.5': [2.5, 4],
  'Duratorq 2.2': [2.2, 4, 'D', 1],
  'Duratorq 3.2': [3.2, 5, 'D', 1],
  'EcoBlue 2.0': [2.0, 4, 'D', 1],
  'Lion 3.0 V6': [3.0, 6, 'D', 1, 'V'],
  'Sigma 1.6': [1.6, 4],
  'Duratec 2.0': [2.0, 4],
  'Duratec 2.0 GDI': [2.0, 4],
  'Dragon 1.5': [1.5, 3],
  'Cyclone 3.5': [3.5, 6, undefined, undefined, 'V'],
  'EcoBoost 2.0': [2.0, 4, undefined, 1],
  'EcoBoost 2.3': [2.3, 4, undefined, 1],
  'Nano 3.0': [3.0, 6, undefined, 1, 'V'],
  'Coyote 5.0': [5.0, 8, undefined, undefined, 'V'],
  'EcoBoost 3.5': [3.5, 6, undefined, 1, 'V'],
  // Volkswagen
  'EA111 1.6': [1.6, 4],
  'EA211 1.6': [1.6, 4],
  'BGP 2.5': [2.5, 5],
  'CBP 2.0': [2.0, 4],
  'CBTA 2.5': [2.5, 5],
  'EA211 1.4 TSI': [1.4, 4, undefined, 1],
  'EA888 2.0T': [2.0, 4, undefined, 1],
  'CDCA 2.0 BiTDI': [2.0, 4, 'D', 1],
  'V6 3.0 TDI': [3.0, 6, 'D', 1, 'V'],
  'CFNA 1.6': [1.6, 4],
  // Honda
  R18A: [1.8, 4],
  R18Z: [1.8, 4],
  L15B7: [1.5, 4, undefined, 1],
  K20C2: [2.0, 4],
  K24Z: [2.4, 4],
  R20A: [2.0, 4],
  K24W: [2.4, 4],
  L15A: [1.5, 4],
  L15Z: [1.5, 4],
  // Hyundai / Kia
  G4EE: [1.4, 4],
  G4ED: [1.6, 4],
  G4FA: [1.4, 4],
  G4FC: [1.6, 4],
  G4FG: [1.6, 4],
  G4NB: [1.8, 4],
  G4NA: [2.0, 4],
  G4GC: [2.0, 4],
  G4KD: [2.0, 4],
  D4HA: [2.0, 4, 'D', 1],
  G4NH: [2.0, 4],
  G4KN: [2.5, 4],
  G4LA: [1.2, 4],
  G4LC: [1.4, 4],
  G3LA: [1.0, 3],
  G4KJ: [2.4, 4],
  D4HB: [2.2, 4, 'D', 1],
  // Mazda
  'ZY-VE': [1.5, 4],
  'P5-VPS': [1.5, 4],
  'LF-DE': [2.0, 4],
  Z6: [1.6, 4],
  'PE-VPS': [2.0, 4],
  'PY-VPS': [2.5, 4],
  // Mitsubishi
  '4D56': [2.5, 4, 'D', 1],
  '4G64': [2.4, 4],
  '4N15': [2.4, 4, 'D', 1],
  '4B11': [2.0, 4],
  '4A91': [1.5, 4],
  '4B12': [2.4, 4],
  // Suzuki
  K14B: [1.4, 4],
  K12M: [1.2, 4],
  J24B: [2.4, 4],
  M16A: [1.6, 4],
  M13A: [1.3, 4],
  K15B: [1.5, 4],
  // Renault
  K7M: [1.6, 4],
  H4M: [1.6, 4],
  K4M: [1.6, 4],
  F4R: [2.0, 4],
  B4D: [1.0, 3],
  // Jeep
  'Pentastar 3.6': [3.6, 6, undefined, undefined, 'V'],
  'EGH 3.8': [3.8, 6, undefined, undefined, 'V'],
  'GME 2.0T': [2.0, 4, undefined, 1],
  'HEMI 5.7': [5.7, 8, undefined, undefined, 'V'],
  'Tigershark 2.4': [2.4, 4],
};

const FUEL: Record<string, Fuel> = { D: 'Diésel', H: 'Híbrido' };

export const ENGINES: Record<string, Engine> = Object.fromEntries(
  Object.entries(ENGINE_DEFS).map(([code, [liters, cyl, fuel, turbo, layout]]) => [
    code,
    { code, liters, cyl, fuel: fuel ? FUEL[fuel] : 'Gasolina', turbo: !!turbo, layout: layout ?? 'I' },
  ]),
);

type G = [code: string, from: number, to: number, engines: string[]];
const MODEL_DEFS: [makeId: string, slug: string, name: string, body: Body, gens: G[], aliases?: string[]][] = [
  // Toyota
  [
    'toyota',
    'corolla',
    'Corolla',
    'Sedán',
    [
      ['E140', 2008, 2013, ['1ZZ-FE', '2ZR-FE']],
      ['E170', 2014, 2019, ['1ZR-FE', '2ZR-FE']],
      ['E210', 2020, 2026, ['M20A-FKS', '2ZR-FXE']],
    ],
    ['corola'],
  ],
  [
    'toyota',
    'yaris',
    'Yaris',
    'Hatchback',
    [
      ['XP90', 2006, 2013, ['1NZ-FE']],
      ['XP150', 2014, 2026, ['1NZ-FE', '2NR-FE']],
    ],
  ],
  [
    'toyota',
    'hilux',
    'Hilux',
    'Pickup',
    [
      ['AN10', 2005, 2015, ['2TR-FE', '1KD-FTV']],
      ['AN120', 2016, 2026, ['2TR-FE', '1GD-FTV', '2GD-FTV']],
    ],
    ['hi lux'],
  ],
  [
    'toyota',
    'rav4',
    'RAV4',
    'SUV',
    [
      ['XA30', 2006, 2012, ['2AZ-FE']],
      ['XA40', 2013, 2018, ['3ZR-FAE', '2AR-FE']],
      ['XA50', 2019, 2026, ['M20A-FKS', 'A25A-FKS']],
    ],
    ['rav 4', 'rav-4'],
  ],
  [
    'toyota',
    'fortuner',
    'Fortuner',
    'SUV',
    [
      ['AN50', 2006, 2015, ['2TR-FE', '1KD-FTV']],
      ['AN150', 2016, 2026, ['2TR-FE', '1GD-FTV']],
    ],
  ],
  ['toyota', 'prado', 'Land Cruiser Prado', 'SUV', [['J150', 2010, 2026, ['2TR-FE', '1GD-FTV', '1GR-FE']]], ['prado', 'land cruiser']],
  // Nissan
  [
    'nissan',
    'sentra',
    'Sentra',
    'Sedán',
    [
      ['B16', 2007, 2012, ['MR20DE']],
      ['B17', 2013, 2019, ['MR18DE']],
      ['B18', 2020, 2026, ['MR20DD']],
    ],
  ],
  [
    'nissan',
    'versa',
    'Versa',
    'Sedán',
    [
      ['N17', 2012, 2019, ['HR16DE']],
      ['N18', 2020, 2026, ['HR16DE']],
    ],
  ],
  [
    'nissan',
    'frontier',
    'Frontier / NP300',
    'Pickup',
    [
      ['D22', 2008, 2015, ['KA24DE', 'YD25DDTi']],
      ['D23', 2016, 2026, ['QR25DE', 'YS23DDT']],
    ],
    ['np300', 'navara', 'frontier'],
  ],
  ['nissan', 'march', 'March', 'Hatchback', [['K13', 2011, 2020, ['HR16DE']]]],
  [
    'nissan',
    'xtrail',
    'X-Trail',
    'SUV',
    [
      ['T31', 2008, 2014, ['MR20DE', 'QR25DE']],
      ['T32', 2015, 2022, ['MR20DD', 'QR25DE']],
    ],
    ['xtrail', 'x trail'],
  ],
  ['nissan', 'tiida', 'Tiida', 'Hatchback', [['C11', 2007, 2018, ['HR16DE', 'MR18DE']]]],
  // Chevrolet
  [
    'chevrolet',
    'aveo',
    'Aveo',
    'Sedán',
    [
      ['T250', 2006, 2017, ['F16D3']],
      ['T3', 2018, 2026, ['L2B']],
    ],
  ],
  ['chevrolet', 'spark', 'Spark', 'Hatchback', [['M300', 2010, 2022, ['B10D1', 'B12D1']]]],
  ['chevrolet', 'sail', 'Sail', 'Sedán', [['SAIL2', 2011, 2020, ['LCU']]]],
  [
    'chevrolet',
    'onix',
    'Onix',
    'Hatchback',
    [
      ['ONIX1', 2013, 2019, ['SPE-4']],
      ['ONIX2', 2020, 2026, ['B10XFT']],
    ],
  ],
  [
    'chevrolet',
    'cruze',
    'Cruze',
    'Sedán',
    [
      ['J300', 2010, 2016, ['F18D4']],
      ['J400', 2017, 2023, ['LE2']],
    ],
  ],
  [
    'chevrolet',
    'silverado',
    'Silverado',
    'Pickup',
    [
      ['GMT900', 2007, 2013, ['LC9']],
      ['K2XX', 2014, 2018, ['L83']],
      ['T1XX', 2019, 2026, ['L84', 'L87']],
    ],
  ],
  ['chevrolet', 'captiva', 'Captiva', 'SUV', [['C140', 2007, 2017, ['LE5', 'Z20S']]]],
  // Ford
  [
    'ford',
    'ranger',
    'Ranger',
    'Pickup',
    [
      ['PX', 2012, 2022, ['Duratec 2.5', 'Duratorq 2.2', 'Duratorq 3.2']],
      ['P703', 2023, 2026, ['EcoBlue 2.0', 'Lion 3.0 V6']],
    ],
  ],
  ['ford', 'fiesta', 'Fiesta', 'Hatchback', [['MK7', 2011, 2019, ['Sigma 1.6']]]],
  [
    'ford',
    'focus',
    'Focus',
    'Hatchback',
    [
      ['MK2', 2008, 2011, ['Duratec 2.0']],
      ['MK3', 2012, 2018, ['Duratec 2.0 GDI', 'Sigma 1.6']],
    ],
  ],
  ['ford', 'ecosport', 'EcoSport', 'SUV', [['B515', 2013, 2021, ['Sigma 1.6', 'Duratec 2.0', 'Dragon 1.5']]], ['eco sport']],
  [
    'ford',
    'explorer',
    'Explorer',
    'SUV',
    [
      ['U502', 2011, 2019, ['Cyclone 3.5', 'EcoBoost 2.0']],
      ['U625', 2020, 2026, ['EcoBoost 2.3', 'Nano 3.0']],
    ],
  ],
  [
    'ford',
    'f150',
    'F-150',
    'Pickup',
    [
      ['P415', 2015, 2020, ['Coyote 5.0', 'EcoBoost 3.5']],
      ['P702', 2021, 2026, ['Coyote 5.0', 'EcoBoost 3.5']],
    ],
    ['f150', 'f 150', 'lobo'],
  ],
  // Volkswagen
  ['volkswagen', 'gol', 'Gol', 'Hatchback', [['G5', 2009, 2023, ['EA111 1.6', 'EA211 1.6']]]],
  [
    'volkswagen',
    'jetta',
    'Jetta',
    'Sedán',
    [
      ['A5', 2006, 2010, ['BGP 2.5']],
      ['A6', 2011, 2018, ['CBP 2.0', 'CBTA 2.5', 'EA211 1.4 TSI']],
      ['A7', 2019, 2026, ['EA211 1.4 TSI']],
    ],
  ],
  ['volkswagen', 'amarok', 'Amarok', 'Pickup', [['2H', 2010, 2022, ['CDCA 2.0 BiTDI', 'V6 3.0 TDI']]]],
  ['volkswagen', 'golf', 'Golf', 'Hatchback', [['MK7', 2013, 2020, ['EA211 1.4 TSI', 'EA888 2.0T']]]],
  ['volkswagen', 'vento', 'Vento / Polo sedán', 'Sedán', [['6R', 2014, 2023, ['CFNA 1.6']]], ['vento', 'polo']],
  ['volkswagen', 'tiguan', 'Tiguan', 'SUV', [['AD1', 2017, 2026, ['EA211 1.4 TSI', 'EA888 2.0T']]]],
  // Honda
  [
    'honda',
    'civic',
    'Civic',
    'Sedán',
    [
      ['FD', 2006, 2011, ['R18A']],
      ['FB', 2012, 2015, ['R18Z']],
      ['FC', 2016, 2021, ['L15B7', 'K20C2']],
      ['FE', 2022, 2026, ['L15B7', 'K20C2']],
    ],
  ],
  [
    'honda',
    'crv',
    'CR-V',
    'SUV',
    [
      ['RE', 2007, 2011, ['K24Z']],
      ['RM', 2012, 2016, ['K24Z', 'R20A']],
      ['RW', 2017, 2022, ['L15B7', 'K24W']],
      ['RS', 2023, 2026, ['L15B7']],
    ],
    ['crv', 'cr v'],
  ],
  [
    'honda',
    'fit',
    'Fit / Jazz',
    'Hatchback',
    [
      ['GE', 2009, 2014, ['L15A']],
      ['GK', 2015, 2020, ['L15Z']],
    ],
    ['fit', 'jazz'],
  ],
  ['honda', 'hrv', 'HR-V', 'SUV', [['RU', 2016, 2022, ['R18Z']]], ['hrv', 'hr v']],
  // Hyundai
  [
    'hyundai',
    'accent',
    'Accent',
    'Sedán',
    [
      ['MC', 2006, 2011, ['G4EE', 'G4ED']],
      ['RB', 2012, 2017, ['G4FA', 'G4FC']],
      ['HC', 2018, 2022, ['G4FG']],
    ],
  ],
  [
    'hyundai',
    'elantra',
    'Elantra',
    'Sedán',
    [
      ['HD', 2007, 2010, ['G4FC']],
      ['MD', 2011, 2016, ['G4NB']],
      ['AD', 2017, 2020, ['G4NA']],
      ['CN7', 2021, 2026, ['G4NH']],
    ],
  ],
  [
    'hyundai',
    'tucson',
    'Tucson',
    'SUV',
    [
      ['JM', 2005, 2009, ['G4GC']],
      ['LM', 2010, 2015, ['G4KD']],
      ['TL', 2016, 2020, ['G4NA', 'D4HA']],
      ['NX4', 2021, 2026, ['G4NH', 'G4KN']],
    ],
  ],
  ['hyundai', 'creta', 'Creta', 'SUV', [['GS', 2016, 2026, ['G4FG']]]],
  ['hyundai', 'i10', 'Grand i10', 'Hatchback', [['BA', 2014, 2023, ['G4LA']]], ['i10', 'grand i10']],
  ['hyundai', 'santafe', 'Santa Fe', 'SUV', [['DM', 2013, 2018, ['G4KJ', 'D4HB']]], ['santa fe', 'santafe']],
  // Kia
  [
    'kia',
    'rio',
    'Rio',
    'Sedán',
    [
      ['JB', 2006, 2011, ['G4EE']],
      ['UB', 2012, 2017, ['G4FA', 'G4FC']],
      ['YB', 2018, 2023, ['G4LC', 'G4FG']],
    ],
  ],
  [
    'kia',
    'sportage',
    'Sportage',
    'SUV',
    [
      ['KM', 2005, 2010, ['G4GC']],
      ['SL', 2011, 2016, ['G4KD', 'D4HA']],
      ['QL', 2017, 2022, ['G4NA', 'D4HA']],
      ['NQ5', 2023, 2026, ['G4NH', 'G4KN']],
    ],
  ],
  [
    'kia',
    'picanto',
    'Picanto',
    'Hatchback',
    [
      ['TA', 2011, 2017, ['G4LA']],
      ['JA', 2018, 2026, ['G3LA', 'G4LA']],
    ],
  ],
  [
    'kia',
    'cerato',
    'Cerato / Forte',
    'Sedán',
    [
      ['YD', 2014, 2018, ['G4FG', 'G4NB']],
      ['BD', 2019, 2026, ['G4NH']],
    ],
    ['forte', 'cerato'],
  ],
  ['kia', 'soluto', 'Soluto', 'Sedán', [['AB', 2019, 2026, ['G4LC']]]],
  // Mazda
  [
    'mazda',
    'mazda2',
    'Mazda 2',
    'Hatchback',
    [
      ['DE', 2008, 2014, ['ZY-VE']],
      ['DJ', 2015, 2026, ['P5-VPS']],
    ],
    ['mazda2', 'm2'],
  ],
  [
    'mazda',
    'mazda3',
    'Mazda 3',
    'Sedán',
    [
      ['BK', 2005, 2009, ['LF-DE']],
      ['BL', 2010, 2013, ['LF-DE', 'Z6']],
      ['BM', 2014, 2018, ['PE-VPS']],
      ['BP', 2019, 2026, ['PE-VPS', 'PY-VPS']],
    ],
    ['mazda3', 'm3'],
  ],
  [
    'mazda',
    'cx5',
    'CX-5',
    'SUV',
    [
      ['KE', 2013, 2016, ['PE-VPS', 'PY-VPS']],
      ['KF', 2017, 2026, ['PE-VPS', 'PY-VPS']],
    ],
    ['cx5', 'cx 5'],
  ],
  ['mazda', 'bt50', 'BT-50', 'Pickup', [['UP', 2012, 2020, ['Duratorq 2.2', 'Duratorq 3.2']]], ['bt50', 'bt 50']],
  // Mitsubishi
  [
    'mitsubishi',
    'l200',
    'L200',
    'Pickup',
    [
      ['KB', 2006, 2015, ['4D56', '4G64']],
      ['KL', 2016, 2026, ['4N15', '4G64']],
    ],
    ['l 200', 'triton'],
  ],
  [
    'mitsubishi',
    'montero',
    'Montero Sport',
    'SUV',
    [
      ['KH', 2009, 2015, ['4D56']],
      ['QE', 2016, 2026, ['4N15']],
    ],
    ['montero', 'pajero sport'],
  ],
  ['mitsubishi', 'lancer', 'Lancer', 'Sedán', [['CY', 2008, 2017, ['4B11', '4A91']]]],
  ['mitsubishi', 'outlander', 'Outlander', 'SUV', [['GF', 2013, 2021, ['4B11', '4B12']]]],
  // Suzuki
  [
    'suzuki',
    'swift',
    'Swift',
    'Hatchback',
    [
      ['ZC72', 2011, 2017, ['K14B']],
      ['ZC83', 2018, 2026, ['K12M']],
    ],
  ],
  [
    'suzuki',
    'vitara',
    'Grand Vitara / Vitara',
    'SUV',
    [
      ['JT', 2006, 2015, ['J24B', 'M16A']],
      ['LY', 2016, 2026, ['M16A']],
    ],
    ['grand vitara', 'vitara'],
  ],
  [
    'suzuki',
    'jimny',
    'Jimny',
    'SUV',
    [
      ['JB43', 2006, 2018, ['M13A']],
      ['JB74', 2019, 2026, ['K15B']],
    ],
  ],
  // Renault
  [
    'renault',
    'logan',
    'Logan',
    'Sedán',
    [
      ['L90', 2007, 2013, ['K7M']],
      ['L52', 2014, 2022, ['K7M', 'H4M']],
    ],
  ],
  [
    'renault',
    'sandero',
    'Sandero',
    'Hatchback',
    [
      ['B90', 2009, 2014, ['K7M']],
      ['B52', 2015, 2022, ['K7M', 'H4M']],
    ],
  ],
  [
    'renault',
    'duster',
    'Duster',
    'SUV',
    [
      ['HS', 2011, 2018, ['K4M', 'F4R']],
      ['HM', 2019, 2026, ['H4M', 'F4R']],
    ],
  ],
  ['renault', 'kwid', 'Kwid', 'Hatchback', [['BBG', 2017, 2026, ['B4D']]]],
  // Jeep
  [
    'jeep',
    'wrangler',
    'Wrangler',
    'SUV',
    [
      ['JK', 2007, 2018, ['EGH 3.8', 'Pentastar 3.6']],
      ['JL', 2018, 2026, ['Pentastar 3.6', 'GME 2.0T']],
    ],
  ],
  [
    'jeep',
    'grandcherokee',
    'Grand Cherokee',
    'SUV',
    [
      ['WK2', 2011, 2021, ['Pentastar 3.6', 'HEMI 5.7']],
      ['WL', 2022, 2026, ['Pentastar 3.6']],
    ],
    ['grand cherokee'],
  ],
  ['jeep', 'compass', 'Compass', 'SUV', [['MP', 2017, 2026, ['Tigershark 2.4']]]],
  ['jeep', 'cherokee', 'Cherokee', 'SUV', [['KL', 2014, 2023, ['Tigershark 2.4', 'Pentastar 3.6']]]],
];

export const MODELS: Model[] = MODEL_DEFS.map(([makeId, slug, name, body, gens, aliases]) => {
  const id = `${makeId}-${slug}`;
  return {
    id,
    makeId,
    name,
    body,
    aliases: aliases ?? [],
    gens: gens.map(([code, from, to, engines]): Generation => ({
      id: `${id}-${code.toLowerCase()}`,
      code,
      modelId: id,
      from: Math.max(from, MIN_YEAR),
      to: Math.min(to, MAX_YEAR),
      engines,
    })),
  };
});

export const MAKE_BY_ID = new Map(MAKES.map((m) => [m.id, m]));
export const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));
export const GENERATIONS: Generation[] = MODELS.flatMap((m) => m.gens);
export const GEN_BY_ID = new Map(GENERATIONS.map((g) => [g.id, g]));

/** Generaciones que usan cada motor: base de la compatibilidad cruzada entre modelos y marcas. */
export const GENS_BY_ENGINE = new Map<string, Generation[]>();
for (const g of GENERATIONS) {
  for (const e of g.engines) {
    const list = GENS_BY_ENGINE.get(e) ?? [];
    list.push(g);
    GENS_BY_ENGINE.set(e, list);
  }
}

export function engineLabel(code: string, withCode = true): string {
  const e = ENGINES[code];
  if (!e) return code;
  const extra = [e.turbo ? 'Turbo' : '', e.fuel !== 'Gasolina' ? e.fuel : ''].filter(Boolean).join(' ');
  return `${e.liters.toFixed(1)}L ${e.layout}${e.cyl}${extra ? ` ${extra}` : ''}${withCode ? ` · ${code}` : ''}`;
}

export function modelsOf(makeId: string): Model[] {
  return MODELS.filter((m) => m.makeId === makeId);
}

export function yearsOfMake(makeId: string): number[] {
  const set = new Set<number>();
  for (const m of modelsOf(makeId)) for (const g of m.gens) for (let y = g.from; y <= g.to; y++) set.add(y);
  return [...set].sort((a, b) => b - a);
}

export function modelsOfMakeYear(makeId: string, year: number): Model[] {
  return modelsOf(makeId).filter((m) => m.gens.some((g) => year >= g.from && year <= g.to));
}

export function genFor(modelId: string, year: number): Generation | undefined {
  // Un año puede caer en dos generaciones (p. ej. Wrangler 2018); se prefiere la más nueva.
  const gens = MODEL_BY_ID.get(modelId)?.gens.filter((g) => year >= g.from && year <= g.to) ?? [];
  return gens[gens.length - 1];
}

export function enginesFor(modelId: string, year: number): string[] {
  const gens = MODEL_BY_ID.get(modelId)?.gens.filter((g) => year >= g.from && year <= g.to) ?? [];
  return [...new Set(gens.flatMap((g) => g.engines))];
}

/** Claves de compatibilidad ('g:…', 'e:…') que cubre una selección de vehículo, completa o parcial. */
export function fitKeysFor(v: VehicleQuery): Set<string> {
  const keys = new Set<string>();
  const models = v.modelId ? [MODEL_BY_ID.get(v.modelId)].filter((m): m is Model => !!m) : v.makeId ? modelsOf(v.makeId) : MODELS;
  for (const m of models) {
    for (const g of m.gens) {
      if (v.year && (v.year < g.from || v.year > g.to)) continue;
      const engines = v.engine ? g.engines.filter((e) => e === v.engine) : g.engines;
      if (v.engine && engines.length === 0) continue;
      keys.add(`g:${g.id}`);
      for (const e of engines) keys.add(`e:${e}`);
    }
  }
  return keys;
}

export function vehicleLabel(v: VehicleQuery, opts: { engine?: boolean } = {}): string {
  const make = v.makeId ? MAKE_BY_ID.get(v.makeId)?.name : undefined;
  const model = v.modelId ? MODEL_BY_ID.get(v.modelId)?.name : undefined;
  const parts = [v.year, make, model].filter(Boolean).join(' ');
  if (opts.engine !== false && v.engine) return `${parts} · ${engineLabel(v.engine, false)}`;
  return parts;
}

/** Cantidad de configuraciones año + modelo + motor del catálogo. */
export const VEHICLE_CONFIG_COUNT = GENERATIONS.reduce((n, g) => n + (g.to - g.from + 1) * g.engines.length, 0);
