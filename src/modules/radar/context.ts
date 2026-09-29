import type { OpportunityListing } from "@/modules/adapters/sources/types";
import { indicativeOffers } from "@/modules/adapters/financing/demo";
import type { PlanningInfo } from "@/modules/adapters/urbanismo-sevilla/types";
import {
  buildArchitectureAlternatives,
  estimateCurrentProgram,
} from "@/modules/agents/specialists/architecture";
import { buildCapitalStacks } from "@/modules/agents/specialists/finance";
import type {
  ArchitectureAssessment,
  FinanceAssessment,
  MarketAssessment,
  PropertyProfile,
  UrbanismAssessment,
} from "@/modules/analysis/types";
import { defaultCity } from "@/modules/city/registry";
import type { CityProfile, Microzone } from "@/modules/city/types";
import { buildConfidence } from "@/modules/core/evidence-status";
import type { ValuationResult } from "@/modules/engines/valuation/types";
import type { InvestorDNA } from "@/modules/investor/types";
import type { Property } from "@/modules/property/types";
import type { StrategyContext } from "@/modules/strategies/types";
import { demoReference, type MarketReference } from "./reference";

/**
 * Reference €/m² of a microzone for a listing, as the classic quick pass reads
 * them: the zone's real supply when a reference is given, the DEMO table
 * otherwise. Rents always come from the microzone table (listings carry none).
 */
export function zonePricesFor(
  zone: Microzone,
  listing: Pick<OpportunityListing, "assetUse">,
  reference: MarketReference = demoReference(zone),
) {
  const residential = listing.assetUse === "residential";
  const m = zone.demoMarket;
  return {
    residential,
    renovatedPerM2: residential ? reference.residentialRenovatedPerM2 : reference.commercialPerM2 * 1.25,
    unrenovatedPerM2: residential ? reference.residentialUnrenovatedPerM2 : reference.commercialPerM2,
    rentPerM2Month: residential ? m.rentResidentialPerM2Month : m.rentCommercialPerM2Month,
  };
}

function quickValuation(
  targetCondition: ValuationResult["targetCondition"],
  perM2: number,
  areaM2: number,
  analysisDate: string,
  zone: Microzone,
): ValuationResult {
  const value = Math.round(perM2 * areaM2);
  return {
    targetCondition,
    pricePerM2: { low: Math.round(perM2 * 0.94), point: perM2, high: Math.round(perM2 * 1.06) },
    value: { low: Math.round(value * 0.94), point: value, high: Math.round(value * 1.06) },
    areaM2,
    comparablesUsed: [],
    comparablesRejected: [],
    methodology: `Pase rápido del Radar: €/m² de referencia de ${zone.name} × superficie. Sin comparables individuales; el análisis completo los incorpora.`,
    confidence: buildConfidence(
      [
        { key: "sourceQuality", weight: 3, score: 0.3, note: "Estadística de microzona, no comparables." },
        { key: "quantity", weight: 1, score: 0, note: "Sin comparables individuales." },
      ],
      "Confianza del pase rápido.",
    ),
    status: "INFERRED",
    analysisDate,
  };
}

/** Planning by ordinance of the microzone. Nothing about the parcel is asserted; everything requires verification. */
export function quickPlanning(city: CityProfile, zone: Microzone): PlanningInfo {
  const zoning =
    city.urbanism.zoningCatalogue[zone.demoZoning] ?? Object.values(city.urbanism.zoningCatalogue)[0];
  const conditioned: string[] = [];
  const forbidden: string[] = [];
  if (zoning?.groundFloorResidential === "conditioned") conditioned.push("Residencial en planta baja");
  if (zoning?.groundFloorResidential === "forbidden") forbidden.push("Residencial en planta baja");
  return {
    planningInstrument: city.urbanism.planningInstrument,
    zoningCode: zoning ? zone.demoZoning : "",
    zoningLabel: zoning?.label ?? "Calificación no consultada",
    maxFloors: zoning?.maxFloors ?? null,
    groundFloorResidential: zoning?.groundFloorResidential ?? "unknown",
    allowedUses: [],
    conditionedUses: conditioned,
    forbiddenUses: forbidden,
    protectionLevel: zone.historicCentre ? "unknown" : "none",
    heritageSector: zone.historicCentre ? `Sector ${zone.name} del Conjunto Histórico` : undefined,
    catalogued: false,
    inHistoricCentre: zone.historicCentre,
    knownFiles: [],
    notes: [
      "Pase rápido del Radar: ordenanza tipo de la microzona, sin consulta de la parcela. El análisis completo consulta el planeamiento.",
    ],
    status: "INFERRED",
  };
}

/**
 * StrategyContext for a listing built only from the city profile and the
 * microzone statistics: fast, deterministic and honest about its status
 * (everything INFERRED). It lets the Radar run the same MultiExit plugins the
 * full analysis runs, so a project search and a Deal Room speak one language.
 */
export function listingStrategyContext(
  listing: OpportunityListing,
  investor: InvestorDNA,
  opts: { city?: CityProfile; analysisDate?: string; reference?: MarketReference } = {},
): StrategyContext | null {
  const city = opts.city ?? defaultCity();
  const zone = city.microzones.find((m) => m.id === listing.microzoneId);
  if (!zone) return null;
  const analysisDate = opts.analysisDate ?? new Date().toISOString().slice(0, 10);
  const reference = opts.reference ?? demoReference(zone);
  const prices = zonePricesFor(zone, listing, reference);
  const area = listing.builtAreaM2;

  const property: Property = {
    id: listing.id,
    cityId: city.id,
    microzoneId: zone.id,
    address: { raw: listing.address, neighborhood: zone.name, municipality: city.name },
    coordinates: zone.centroid,
    assetUse: listing.assetUse,
    typology: listing.typology,
    builtAreaM2: area,
    floor: listing.floor,
    elevator: listing.elevator,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    condition: listing.condition,
    askingPrice: listing.askingPrice,
    origin: { kind: listing.demo ? "demo" : "listing", reference: listing.reference ?? listing.id },
    demo: listing.demo,
    evidenceIds: [],
    createdAt: analysisDate,
    updatedAt: analysisDate,
  };
  const profile: PropertyProfile = {
    property,
    microzone: zone,
    cadastral: { found: false, mode: "none" },
    askingPrice: listing.askingPrice,
    askingPriceSource: "listing",
    summary: `${listing.title} · ${area} m² · ${zone.name}`,
  };

  const valuationRenovated = quickValuation("renovated", prices.renovatedPerM2, area, analysisDate, zone);
  const valuationUnrenovated = quickValuation(
    "unrenovated",
    prices.unrenovatedPerM2,
    area,
    analysisDate,
    zone,
  );
  const asIsValue =
    listing.condition === "renovated" ? valuationRenovated.value.point : valuationUnrenovated.value.point;
  const rentPoint = Math.round(prices.rentPerM2Month * area);
  const m = reference;
  const market: MarketAssessment = {
    microzoneId: zone.id,
    microzoneName: zone.name,
    snapshot: {
      microzoneId: zone.id,
      microzoneName: zone.name,
      comparablesSale: [],
      comparablesRent: [],
      stats: {
        renovatedPerM2: prices.renovatedPerM2,
        unrenovatedPerM2: prices.unrenovatedPerM2,
        spreadPerM2: prices.renovatedPerM2 - prices.unrenovatedPerM2,
        rentPerM2Month: prices.rentPerM2Month,
        daysToSell: m.daysToSell,
        liquidity: m.liquidity,
        demand: m.demand,
        sampleSize: m.sampleSize,
        confidenceNote:
          m.basis === "listings"
            ? `Referencia de la oferta real de la microzona (${m.sampleSize} anuncios, pase rápido).`
            : "Estadística DEMO de referencia de la microzona (pase rápido).",
        liquidityBasis: m.basis === "listings" ? "reference" : "demo",
      },
      demo: m.basis === "demo",
    },
    valuationRenovated,
    valuationUnrenovated,
    rent: {
      monthly: { low: Math.round(rentPoint * 0.92), point: rentPoint, high: Math.round(rentPoint * 1.08) },
      perM2Month: prices.rentPerM2Month,
      comparables: 0,
      conditionFactor: 1,
      status: "INFERRED",
    },
    askingVsValue: {
      askingPrice: listing.askingPrice,
      asIsValue,
      discount: asIsValue > 0 ? Math.round(((asIsValue - listing.askingPrice) / asIsValue) * 1000) / 1000 : 0,
      note: "Precio pedido frente al valor de referencia en el estado actual.",
    },
    liquidity: { daysToSell: m.daysToSell, level: m.liquidity, demand: m.demand },
    status: "INFERRED",
    confidence: valuationRenovated.confidence,
    summary: `Referencia ${zone.name}: ${prices.unrenovatedPerM2}–${prices.renovatedPerM2} €/m².`,
    demo: true,
  };

  const planning = quickPlanning(city, zone);
  const urbanism: UrbanismAssessment = {
    status: "INFERRED",
    planning,
    applicableRuleIds: [],
    findings: [],
    constraints: [],
    opportunities: [],
    requiredChecks: [],
    confidence: buildConfidence(
      [{ key: "verification", weight: 1, score: 0.2, note: "Ordenanza de zona, sin consulta de parcela." }],
      "Confianza urbanística del pase rápido.",
    ),
    humanReviewRequired: true,
    summary: `${planning.zoningLabel} (ordenanza de zona, sin verificar).`,
    demo: true,
  };

  const current = estimateCurrentProgram(property);
  const architecture: ArchitectureAssessment = {
    current,
    alternatives: buildArchitectureAlternatives({ property, current, urbanism, analysisDate }),
    status: "REVIEW_REQUIRED",
    confidence: buildConfidence(
      [
        {
          key: "sourceQuality",
          weight: 1,
          score: 0.3,
          note: "Programa estimado por superficie y tipología.",
        },
      ],
      "Confianza arquitectónica del pase rápido.",
    ),
    summary: "Alternativas de programa estimadas.",
  };

  const offers = investor.usesFinancing
    ? indicativeOffers({
        purchasePrice: listing.askingPrice,
        totalCost: Math.round(listing.askingPrice * 1.1 + area * 700),
        durationMonths: Math.max(6, investor.horizonMonths),
        investorProfile: "private",
        assetUse: listing.assetUse,
      })
    : [];
  const { stacks, recommendedStackId } = buildCapitalStacks(offers);
  const finance: FinanceAssessment = {
    offers,
    stacks,
    recommendedStackId,
    summary: offers.length ? "Estructuras indicativas de referencia." : "Sin deuda.",
    demo: true,
  };

  return { analysisDate, city, property: profile, market, urbanism, architecture, finance, investor };
}
