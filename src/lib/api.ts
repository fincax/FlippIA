import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/modules/core/logger";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/server/context";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/** Wrap a route handler: maps domain errors to HTTP, never leaks stack traces. */
export function handle<TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<Response>) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof UnauthorizedError) return jsonError("UNAUTHORIZED", e.message, 401);
      if (e instanceof ForbiddenError) return jsonError("FORBIDDEN", e.message, 403);
      if (e instanceof NotFoundError) return jsonError("NOT_FOUND", e.message, 404);
      if (e instanceof ZodError) return jsonError("VALIDATION", "Datos no válidos.", 422, e.issues);
      logger.error("api.unhandled", { error: e instanceof Error ? e.message : String(e) });
      return jsonError(
        "INTERNAL",
        "No hemos podido completar la operación. El resto de la aplicación sigue disponible.",
        500,
      );
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ZodError([{ code: "custom", message: "JSON inválido", path: [] }]);
  }
}
