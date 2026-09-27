import { defaultCity, haversineM } from "@/modules/city/registry";
import { appError, err, ok, type Result } from "@/modules/core/result";
import type { Comparable } from "@/modules/engines/valuation/types";
import type { NewEvidence } from "@/modules/evidence/store";
import type { AdapterResponse, DataSourceAdapter } from "../types";
import { deriveStats } from "./stats";
import type {
  ComparablesRepository,
  MarketQuery,
  MarketSnapshot,
  OwnComparable,
  RentComparable,
} from "./types";

export const OWN_COMPARABLES_RADIUS_M = 1_500;

/**
 * Comparables the organisation owns: closed transactions, commissioned
 * valuations, verified witnesses. They are the only way to get transaction
 * prices into the valuation without a paid registry feed, and they never
 * leave the tenant: the repository is injected per request.
 */
export class OwnComparablesAdapter implements DataSourceAdapter<MarketQuery, MarketSnapshot> {
  sourceId = "own-comparables";
  sourceType = "market_transaction" as const;
  sourceName = "Testigos propios";
  sourceAuthority = "Organización — transacciones, valoraciones y testigos verificados";
  mode = "partner" as const;

  constructor(
    private readonly repository: ComparablesRepository,
    private readonly radiusM = OWN_COMPARABLES_RADIUS_M,
  ) {}

  async isAvailable() {
    return true;
  }

  async query(q: MarketQuery): Promise<Result<AdapterResponse<MarketSnapshot>>> {
    const city = defaultCity();
    const zone = city.microzones.find((m) => m.id === q.microzoneId);
    if (!zone) return err(appError("MICROZONE_NOT_FOUND", `Microzona ${q.microzoneId} desconocida.`));
    const centre = q.point ?? zone.centroid;
    const rows = await this.repository.list({
      microzoneId: zone.id,
      point: q.point,
      radiusM: this.radiusM,
      assetUse: q.assetUse,
    });
    const retrievedAt = new Date().toISOString();
    const comparablesSale: Comparable[] = [];
    const comparablesRent: RentComparable[] = [];
    const evidence: NewEvidence[] = [];
    for (const row of rows) {
      const distanceM = Math.round(haversineM(centre, row.point));
      if (distanceM > this.radiusM) continue;
      if (row.kind === "sale") {
        comparablesSale.push(toComparable(row, distanceM, this.sourceId));
      } else {
        comparablesRent.push({
          id: row.id,
          monthlyRent: row.price,
          areaM2: row.areaM2,
          date: row.date,
          distanceM,
          type: "transaction",
          demo: false,
          sourceId: this.sourceId,
          label: row.label,
        });
      }
      evidence.push({
        sourceType: this.sourceType,
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceAuthority: this.sourceAuthority,
        retrievedAt,
        sourcePublishedAt: row.date,
        effectiveDate: row.date,
        geographicScope: { level: "point", label: row.label ?? zone.name },
        documentId: row.reference,
        excerpt:
          row.kind === "sale"
            ? `Testigo ${typeLabel(row.type)}: ${row.price.toLocaleString("es-ES")} € · ${row.areaM2} m² · ${row.condition} · ${distanceM} m${row.note ? ` · ${row.note}` : ""}`
            : `Testigo de alquiler: ${row.price.toLocaleString("es-ES")} €/mes · ${row.areaM2} m² · ${distanceM} m${row.note ? ` · ${row.note}` : ""}`,
        structuredData: {
          comparableId: row.id,
          kind: row.kind,
          type: row.type,
          price: row.price,
          areaM2: row.areaM2,
          condition: row.condition,
          reference: row.reference,
        },
        confidence:
          row.type === "transaction" || row.type === "verified"
            ? 0.85
            : row.type === "professional"
              ? 0.8
              : 0.6,
        verificationStatus: row.type === "manual" ? "REVIEW_REQUIRED" : "VERIFIED",
        demo: false,
      });
    }
    const stats = deriveStats({
      sale: comparablesSale,
      rent: comparablesRent,
      notes: [
        `Testigos propios: ${comparablesSale.length} de venta y ${comparablesRent.length} de alquiler en ${this.radiusM} m.`,
      ],
    });
    const data: MarketSnapshot = {
      microzoneId: zone.id,
      microzoneName: zone.name,
      comparablesSale,
      comparablesRent,
      stats,
      sources: [
        {
          sourceId: this.sourceId,
          name: this.sourceName,
          sale: comparablesSale.length,
          rent: comparablesRent.length,
          demo: false,
        },
      ],
      demo: false,
    };
    return ok({ data, evidence, retrievedAt, mode: "partner" });
  }
}

function toComparable(row: OwnComparable, distanceM: number, sourceId: string): Comparable {
  return {
    id: row.id,
    type: row.type,
    sourceId,
    price: row.price,
    areaM2: row.areaM2,
    date: row.date,
    distanceM,
    condition: row.condition,
    assetUse: row.assetUse,
    floor: row.floor,
    elevator: row.elevator,
    exterior: row.exterior,
    label: row.label ?? `${typeLabel(row.type)} · ${row.areaM2} m²`,
    demo: false,
  };
}

function typeLabel(t: OwnComparable["type"]): string {
  return t === "transaction"
    ? "transacción"
    : t === "verified"
      ? "verificado"
      : t === "professional"
        ? "valoración profesional"
        : t === "internal"
          ? "interno"
          : t === "partner"
            ? "partner"
            : "manual";
}
