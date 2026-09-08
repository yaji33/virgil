const SCALE = 18n;

export function quoteUnits(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 10n ** SCALE + BigInt(fraction.padEnd(Number(SCALE), "0"));
}

export function formatQuote(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / 10n ** SCALE;
  const fraction = (absolute % 10n ** SCALE)
    .toString()
    .padStart(Number(SCALE), "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function addQuote(left: string, right: string): string {
  return formatQuote(quoteUnits(left) + quoteUnits(right));
}

export function subtractQuote(left: string, right: string): string {
  return formatQuote(quoteUnits(left) - quoteUnits(right));
}

export function exceedsQuote(amount: string, available: string): boolean {
  return quoteUnits(amount) > quoteUnits(available);
}
