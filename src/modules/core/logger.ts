/**
 * Minimal structured logger. JSON lines in production, readable in development.
 * Never log secrets or personal data: callers pass domain identifiers only.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (raw in LEVELS ? raw : "info") as LogLevel;
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function write(level: LogLevel, msg: string, ctx: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[configuredLevel()]) return;
  const record = { ts: new Date().toISOString(), level, msg, ...ctx };
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(record)
      : `[${level}] ${msg} ${Object.keys(ctx).length ? JSON.stringify(ctx) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);
}

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (m, c = {}) => write("debug", m, { ...bindings, ...c }),
    info: (m, c = {}) => write("info", m, { ...bindings, ...c }),
    warn: (m, c = {}) => write("warn", m, { ...bindings, ...c }),
    error: (m, c = {}) => write("error", m, { ...bindings, ...c }),
    child: (b) => createLogger({ ...bindings, ...b }),
  };
}

export const logger = createLogger({ app: "flippia" });
