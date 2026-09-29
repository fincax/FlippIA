import { sharedIdealistaClient, type IdealistaClient, type IdealistaPropertyType } from "../idealista";
import { DemoListingsSource } from "./demo";
import { FeedListingsSource, parseFeedsConfig } from "./feed";
import { IdealistaListingsSource } from "./idealista";
import type { SourceAdapter } from "./types";

export * from "./types";
export * from "./demo";
export * from "./feed";
export * from "./idealista";
export { typologyFromText, conditionFromText, microzoneIdFor } from "./mapping";

export const RADAR_SOURCE_MODES = ["demo", "idealista", "feeds"] as const;

/** `RADAR_SOURCES` is a comma-separated list of listing sources, e.g. `idealista,feeds`. */
export function parseRadarModes(value: string | undefined): string[] {
  return (value ?? "demo")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function parseIdealistaPropertyTypes(value: string | undefined): IdealistaPropertyType[] {
  const allowed: IdealistaPropertyType[] = ["homes", "premises", "offices", "garages"];
  const wanted = (value ?? "homes")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out = allowed.filter((a) => wanted.includes(a));
  return out.length ? out : ["homes"];
}

export interface ListingSourcesDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  idealistaClient?: IdealistaClient;
}

/** Radar sources from the environment. Unknown modes throw; missing feed config is a startup problem (see env.ts). */
export function createListingSources(mode?: string, deps: ListingSourcesDeps = {}): SourceAdapter[] {
  const env = deps.env ?? process.env;
  const modes = parseRadarModes(mode ?? env.RADAR_SOURCES);
  const unknown = modes.filter((m) => !(RADAR_SOURCE_MODES as readonly string[]).includes(m));
  if (unknown.length)
    throw new Error(
      `RADAR_SOURCES "${unknown.join(",")}" is not supported (${RADAR_SOURCE_MODES.join(" | ")})`,
    );
  const sources: SourceAdapter[] = [];
  if (modes.includes("demo")) sources.push(new DemoListingsSource());
  if (modes.includes("idealista")) {
    const client = deps.idealistaClient ?? sharedIdealistaClient(env, deps.fetchImpl);
    sources.push(
      new IdealistaListingsSource(client, {
        propertyTypes: parseIdealistaPropertyTypes(env.IDEALISTA_RADAR_PROPERTY_TYPES),
        maxPages: Number(env.IDEALISTA_RADAR_MAX_PAGES) || undefined,
      }),
    );
  }
  if (modes.includes("feeds")) {
    const { feeds, error } = parseFeedsConfig(env.RADAR_FEEDS);
    if (error) throw new Error(`RADAR_FEEDS: ${error}`);
    for (const f of feeds) sources.push(new FeedListingsSource(f, deps.fetchImpl));
  }
  return sources;
}
