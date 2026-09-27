import { SEVILLA } from "./sevilla";
import type { CityProfile, LatLng, Microzone } from "./types";

const CITIES: CityProfile[] = [SEVILLA];

export function listCities(): CityProfile[] {
  return [...CITIES];
}

export function getCity(id: string): CityProfile | undefined {
  return CITIES.find((c) => c.id === id);
}

export function defaultCity(): CityProfile {
  return CITIES[0]!;
}

export function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Map free text (address, neighbourhood) to a microzone by alias matching. */
export function microzoneFromText(city: CityProfile, text: string): Microzone | undefined {
  const t = normalizeText(text);
  let best: { zone: Microzone; len: number } | undefined;
  for (const zone of city.microzones) {
    for (const alias of zone.aliases) {
      const a = normalizeText(alias);
      if (t.includes(a) && (!best || a.length > best.len)) best = { zone, len: a.length };
    }
  }
  return best?.zone;
}

/** Every microzone named in a free text ("Triana y Los Remedios"), longest alias first. */
export function microzonesFromText(city: CityProfile, text: string): Microzone[] {
  const t = normalizeText(text);
  const found: Array<{ zone: Microzone; len: number }> = [];
  for (const zone of city.microzones) {
    let len = 0;
    for (const alias of zone.aliases) {
      const a = normalizeText(alias);
      if (t.includes(a) && a.length > len) len = a.length;
    }
    if (len > 0) found.push({ zone, len });
  }
  return found.sort((a, b) => b.len - a.len).map((f) => f.zone);
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function microzoneFromPoint(city: CityProfile, p: LatLng): Microzone | undefined {
  let best: { zone: Microzone; d: number } | undefined;
  for (const zone of city.microzones) {
    const d = haversineM(zone.centroid, p);
    if (!best || d < best.d) best = { zone, d };
  }
  return best?.zone;
}

/** Whether a city can serve a given municipality code or name. */
export function cityForLocation(input: {
  municipalityCode?: string;
  text?: string;
}): CityProfile | undefined {
  if (input.municipalityCode) return CITIES.find((c) => c.municipalityCode === input.municipalityCode);
  if (input.text) {
    const t = normalizeText(input.text);
    return CITIES.find((c) => t.includes(normalizeText(c.name)) || microzoneFromText(c, t));
  }
  return undefined;
}
