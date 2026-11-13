export function uid(): string {
  return crypto.randomUUID();
}

export function cleanTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function hkd(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

export function usd(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

export function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("zh-HK", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

/** Fraction to signed percent text, e.g. 0.1234 → +12.34%. */
export function pct(fraction: number, digits = 2): string {
  if (!Number.isFinite(fraction)) return "—";
  const value = fraction * 100;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function pctPoints(points: number, digits = 2): string {
  if (!Number.isFinite(points)) return "—";
  const sign = points > 0 ? "+" : "";
  return `${sign}${points.toFixed(digits)}%`;
}

export function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function sharesText(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const digits = Number.isInteger(n) ? 0 : 4;
  return num(n, digits);
}
