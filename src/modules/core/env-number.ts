/**
 * Read a positive number from the environment. Empty strings (a common state
 * after copying `.env.example`), non-numeric or non-positive values fall back
 * to the default instead of silently producing 0.
 */
export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
