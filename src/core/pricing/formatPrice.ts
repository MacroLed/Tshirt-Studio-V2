const formatters = new Map<string, Intl.NumberFormat>();

/** Formatuje kwotę podaną w groszach, np. 14900 -> "149,00 zł". */
export function formatPrice(amountMinor: number, currency: string): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pl-PL', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(amountMinor / 100);
}
