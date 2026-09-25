import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford-ish, no ambiguous chars

/** Prefixed, sortable-ish, URL-safe identifiers: `deal_01j9...` */
export function newId(prefix: string, size = 20): string {
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  const ts = Date.now().toString(32).padStart(9, "0");
  return `${prefix}_${ts}${out.slice(0, size - 9)}`;
}

export function isId(value: unknown, prefix?: string): value is string {
  if (typeof value !== "string") return false;
  if (prefix) return value.startsWith(`${prefix}_`);
  return /^[a-z]+_[0-9a-z]{10,}$/.test(value);
}
