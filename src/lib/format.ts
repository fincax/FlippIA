/**
 * Locale-aware formatting. Spanish (es-ES) is the initial locale; EUR the initial
 * currency. Both come from the CityProfile / user locale, never hardcoded in UI.
 */
export type Locale = "es-ES" | "en-GB";

export interface FormatOptions {
  locale?: Locale;
  currency?: string;
}

const defaults: Required<FormatOptions> = { locale: "es-ES", currency: "EUR" };

export function formatMoney(value: number, opts: FormatOptions & { signed?: boolean; compact?: boolean } = {}): string {
  const { locale, currency } = { ...defaults, ...opts };
  const abs = Math.abs(value);
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    ...(opts.compact && abs >= 1_000_000 ? { notation: "compact", maximumFractionDigits: 1 } : {}),
  });
  const text = fmt.format(abs);
  if (value < 0) return `−${text}`;
  if (opts.signed && value > 0) return `+${text}`;
  return text;
}

export function formatPercent(ratio: number, opts: FormatOptions & { decimals?: number; signed?: boolean } = {}): string {
  const { locale } = { ...defaults, ...opts };
  const decimals = opts.decimals ?? 1;
  const fmt = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const text = fmt.format(Math.abs(ratio));
  if (ratio < 0) return `−${text}`;
  if (opts.signed && ratio > 0) return `+${text}`;
  return text;
}

export function formatNumber(value: number, opts: FormatOptions & { decimals?: number } = {}): string {
  const { locale } = { ...defaults, ...opts };
  return new Intl.NumberFormat(locale, { maximumFractionDigits: opts.decimals ?? 0 }).format(value);
}

export function formatArea(m2: number, opts: FormatOptions = {}): string {
  return `${formatNumber(m2, opts)} m²`;
}

export function formatMonths(months: number, locale: Locale = "es-ES"): string {
  if (locale === "es-ES") return months === 1 ? "1 mes" : `${months} meses`;
  return months === 1 ? "1 month" : `${months} months`;
}

export function formatDate(iso: string | Date, locale: Locale = "es-ES"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatRelative(iso: string | Date, now = new Date(), locale: Locale = "es-ES"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diffDays = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diffDays) < 1) return rtf.format(0, "day");
  if (Math.abs(diffDays) < 30) return rtf.format(-diffDays, "day");
  if (Math.abs(diffDays) < 365) return rtf.format(-Math.round(diffDays / 30), "month");
  return rtf.format(-Math.round(diffDays / 365), "year");
}
