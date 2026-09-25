/**
 * Feature flags. Experimental capabilities ship dark and are enabled per
 * environment through FEATURE_FLAGS="radar.v2,lens.beta".
 */
export const FEATURE_FLAGS = [
  "radar.v2",
  "architect.generative",
  "urbanism.experimental",
  "financing.live",
  "lens.beta",
  "map.tiles",
  "execution.mode",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export function enabledFlags(raw = process.env.FEATURE_FLAGS ?? ""): Set<FeatureFlag> {
  const set = new Set<FeatureFlag>();
  for (const token of raw.split(",")) {
    const t = token.trim() as FeatureFlag;
    if ((FEATURE_FLAGS as readonly string[]).includes(t)) set.add(t);
  }
  return set;
}

export function isEnabled(flag: FeatureFlag, raw?: string): boolean {
  return enabledFlags(raw).has(flag);
}
