/** Ajustes de la tienda. Cambia moneda, idioma y umbrales aquí. */
export const STORE = {
  name: 'Lenin Auto Cars',
  locale: 'es-419',
  currency: 'USD',
  freeShippingFrom: 99,
  shippingFlat: 7.9,
  whatsapp: '+00 000 000 0000',
  email: 'ventas@leninautocars.example',
} as const;

const money = new Intl.NumberFormat(STORE.locale, {
  style: 'currency',
  currency: STORE.currency,
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
});
const int = new Intl.NumberFormat(STORE.locale);

export const fmtMoney = (n: number) => money.format(n);
export const fmtInt = (n: number) => int.format(n);
