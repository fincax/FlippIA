/** Tiny, typed-enough dot-path utilities for FinancialInputs overrides. */

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** Paths are user input: never let them reach Object.prototype. */
export function assertSafePath(path: string): void {
  for (const k of path.split(".")) {
    if (k === "" || FORBIDDEN_SEGMENTS.has(k)) throw new Error(`Unsafe override path: ${path}`);
  }
}

export function getPath(obj: unknown, path: string): unknown {
  assertSafePath(path);
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  assertSafePath(path);
  const keys = path.split(".");
  const clone = structuredClone(obj) as unknown as Record<string, unknown>;
  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    const next = Object.prototype.hasOwnProperty.call(cursor, k) ? cursor[k] : undefined;
    if (!next || typeof next !== "object") cursor[k] = {};
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]!] = value;
  return clone as unknown as T;
}

export function applyOverrides<T>(base: T, overrides: Record<string, unknown>): T {
  let out = base;
  for (const [path, value] of Object.entries(overrides)) out = setPath(out, path, value);
  return out;
}

/** Whether `changed` affects `path` (prefix match on dot segments, either way). */
export function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}
