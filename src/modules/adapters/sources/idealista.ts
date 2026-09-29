import { defaultCity } from "@/modules/city/registry";
import type { CityProfile, Microzone } from "@/modules/city/types";
import { logger } from "@/modules/core/logger";
import {
  IdealistaClient,
  idealistaFloor,
  idealistaState,
  type IdealistaListing,
  type IdealistaPropertyType,
} from "../idealista";
import { assetUseFor, microzoneIdFor, today, typologyFromText } from "./mapping";
import type { ListingsFetch, ListingsFilter, OpportunityListing, SourceAdapter } from "./types";

export interface IdealistaListingsOptions {
  /** Property types pulled per microzone; each adds one request per page and zone. */
  propertyTypes?: IdealistaPropertyType[];
  /** Pages per zone and type (50 listings each). */
  maxPages?: number;
  city?: CityProfile;
}

/**
 * Radar source: active sale listings from the Idealista official API, one
 * search per microzone (centroid + radius). Every page is one request against
 * the plan quota, so the sync runs on a schedule and results are cached.
 */
export class IdealistaListingsSource implements SourceAdapter {
  sourceId = "idealista-api";
  sourceName = "Idealista (API oficial)";
  kind = "api" as const;

  private readonly propertyTypes: IdealistaPropertyType[];
  private readonly maxPages: number;
  private readonly city: CityProfile;

  constructor(
    private readonly client: IdealistaClient,
    options: IdealistaListingsOptions = {},
  ) {
    this.propertyTypes = options.propertyTypes?.length ? options.propertyTypes : ["homes"];
    this.maxPages = Math.max(1, options.maxPages ?? 2);
    this.city = options.city ?? defaultCity();
  }

  async isAvailable() {
    return this.client.configured;
  }

  async listings(filter: ListingsFilter = {}): Promise<OpportunityListing[]> {
    const zones = this.city.microzones.filter(
      (z) => !filter.microzoneIds || filter.microzoneIds.includes(z.id),
    );
    const fetched = await this.pull(zones);
    return fetched.listings.filter(
      (l) =>
        (!filter.maxPrice || l.askingPrice <= filter.maxPrice) &&
        (!filter.assetUse || l.assetUse === filter.assetUse),
    );
  }

  async fetchAll(): Promise<ListingsFetch> {
    return this.pull(this.city.microzones);
  }

  private async pull(zones: Microzone[]): Promise<ListingsFetch> {
    const errors: string[] = [];
    const byId = new Map<string, OpportunityListing>();
    let complete = true;
    if (!this.client.configured)
      return { listings: [], complete: false, errors: ["Idealista sin credenciales"] };
    for (const zone of zones) {
      for (const propertyType of this.propertyTypes) {
        for (let page = 1; page <= this.maxPages; page++) {
          const r = await this.client.search({
            operation: "sale",
            propertyType,
            center: zone.centroid,
            distanceM: zone.radiusM,
            maxItems: 50,
            page,
            order: "publicationDate",
            sort: "desc",
          });
          if (!r.ok) {
            errors.push(`${zone.name} (${propertyType}): ${r.error.message}`);
            complete = false;
            break;
          }
          for (const raw of r.value.elementList ?? []) {
            const l = this.toListing(raw, zone);
            if (l) byId.set(l.id, l);
          }
          const totalPages = r.value.totalPages ?? 1;
          if (page >= totalPages) break;
          if (page === this.maxPages && totalPages > this.maxPages) {
            complete = false;
            logger.info("idealista.radar.truncated", {
              zone: zone.id,
              propertyType,
              totalPages,
              maxPages: this.maxPages,
            });
          }
        }
      }
    }
    return { listings: [...byId.values()], complete, errors };
  }

  private toListing(l: IdealistaListing, zone: Microzone): OpportunityListing | undefined {
    const price = Number(l.price);
    const area = Number(l.size);
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(area) ||
      area <= 0 ||
      l.propertyCode === undefined
    )
      return undefined;
    const point =
      typeof l.latitude === "number" && typeof l.longitude === "number"
        ? { lat: l.latitude, lng: l.longitude }
        : undefined;
    const typology =
      l.propertyType === "premises"
        ? "premises"
        : l.propertyType === "office"
          ? "office"
          : typologyFromText(l.propertyType);
    const state = idealistaState(l);
    const condition: OpportunityListing["condition"] =
      state === "to_renovate"
        ? "to_renovate"
        : state === "new"
          ? "renovated"
          : state === "good"
            ? "good"
            : "unknown";
    const place = l.neighborhood ?? l.district ?? zone.name;
    const date = today(this.client.cfg.now);
    return {
      id: `lst_idealista_${l.propertyCode}`,
      sourceId: this.sourceId,
      sourceName: this.sourceName,
      reference: String(l.propertyCode),
      title: `${typologyLabel(typology)}${condition === "to_renovate" ? " para reformar" : condition === "renovated" ? " reformado" : ""} en ${place}`,
      address: [l.address, place, l.municipality ?? this.city.name].filter(Boolean).join(", "),
      microzoneId: microzoneIdFor(point, this.city) ?? zone.id,
      coordinates: point,
      typology,
      assetUse: assetUseFor(typology),
      builtAreaM2: Math.round(area),
      bedrooms: typeof l.rooms === "number" ? l.rooms : undefined,
      bathrooms: typeof l.bathrooms === "number" ? l.bathrooms : undefined,
      floor: idealistaFloor(l.floor),
      elevator: typeof l.hasLift === "boolean" ? l.hasLift : undefined,
      condition,
      askingPrice: Math.round(price),
      // The API does not expose the publication date: first sight is recorded by the sync.
      publishedAt: date,
      priceHistory: [{ date, price: Math.round(price) }],
      url: l.url,
      demo: false,
    };
  }
}

export function typologyLabel(t: OpportunityListing["typology"]): string {
  switch (t) {
    case "flat":
      return "Piso";
    case "ground_floor_flat":
      return "Bajo";
    case "penthouse":
      return "Ático";
    case "house":
      return "Casa";
    case "premises":
      return "Local";
    case "office":
      return "Oficina";
    case "building":
      return "Edificio";
    case "plot":
      return "Solar";
    case "warehouse":
      return "Nave";
    case "garage":
      return "Garaje";
    default:
      return "Inmueble";
  }
}
