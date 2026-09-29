/** Formato de moneda y números. La moneda y el idioma vienen de /api/meta (backend/lenin_auto/config.py). */
let money = new Intl.NumberFormat('es-419', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });
let int = new Intl.NumberFormat('es-419');

export function configureLocale(locale: string, currency: string) {
  money = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 });
  int = new Intl.NumberFormat(locale);
}

export const fmtMoney = (n: number) => money.format(n);
export const fmtInt = (n: number) => int.format(n);
