"use client";

/** Browser-side fetch helper: JSON + CSRF header from the layout meta tag. */
export function csrfToken(): string {
  if (typeof document === "undefined") return "";
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ?? "";
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
    credentials: "same-origin",
  });
  try {
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "NETWORK", message: `Respuesta no válida (${res.status}).` } };
  }
}
