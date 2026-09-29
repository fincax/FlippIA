/**
 * Analysis refusals the user must see as such. The generic failure message
 * hides what went wrong; these carry a reason FlippIA is sure about.
 */
export class NotCoveredError extends Error {
  readonly code = "NOT_COVERED";
  constructor(
    message: string,
    readonly details: { municipality: string; coveredCity: string },
  ) {
    super(message);
    this.name = "NotCoveredError";
  }
}

export const NOT_COVERED_PREFIX = "NOT_COVERED:";

/** Message an agent throws so the runner's record can be mapped back to a NotCoveredError. */
export function notCoveredMessage(municipality: string, coveredCity: string): string {
  return `${NOT_COVERED_PREFIX}${municipality}|${coveredCity}`;
}

export function parseNotCovered(message: string | undefined): NotCoveredError | undefined {
  if (!message || !message.includes(NOT_COVERED_PREFIX)) return undefined;
  const payload = message.slice(message.indexOf(NOT_COVERED_PREFIX) + NOT_COVERED_PREFIX.length);
  const [municipality = "", coveredCity = ""] = payload.split("|");
  return new NotCoveredError(
    `FlippIA cubre hoy el municipio de ${coveredCity}. ${municipality} tiene su propio planeamiento y sus propias ordenanzas, que no están en el registro normativo: no se analiza con datos de ${coveredCity}.`,
    { municipality, coveredCity },
  );
}
