/**
 * Guards for model-written text. FlippIA never lets a model introduce a
 * number: narrative may rephrase engine facts, never add figures.
 */

const NUMBER_RE = /\d[\d.,]*\d|\d/g;

/** Normalised numeric tokens (separators removed) found in a text. */
export function numericTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.match(NUMBER_RE) ?? []) out.add(m.replace(/[.,\s]/g, ""));
  return out;
}

/**
 * True when every number in `candidate` also appears in `source` (or in the
 * optional extra allowed strings). Years, percentages and money are all
 * compared as digit strings, which is deliberately strict.
 */
export function introducesNoNewNumbers(candidate: string, source: string, allowed: string[] = []): boolean {
  const known = numericTokens([source, ...allowed].join(" "));
  for (const token of numericTokens(candidate)) if (!known.has(token)) return false;
  return true;
}
