import { boolean, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { OwnComparable } from "@/modules/adapters/market/types";
import { organizations, users } from "./core";

/**
 * Comparables the organisation owns (closed transactions, commissioned
 * valuations, verified witnesses). Never shared across tenants; feeds the
 * valuation through OwnComparablesAdapter.
 */
export const marketComparables = pgTable(
  "market_comparables",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").$type<OwnComparable["kind"]>().notNull(),
    type: text("type").$type<OwnComparable["type"]>().notNull(),
    /** Sale price in EUR, or monthly rent for kind = rent. */
    price: doublePrecision("price").notNull(),
    areaM2: doublePrecision("area_m2").notNull(),
    date: text("date").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    microzoneId: text("microzone_id"),
    condition: text("condition").$type<OwnComparable["condition"]>().notNull().default("unknown"),
    assetUse: text("asset_use").$type<OwnComparable["assetUse"]>().notNull().default("residential"),
    floor: integer("floor"),
    elevator: boolean("elevator"),
    exterior: boolean("exterior"),
    label: text("label"),
    reference: text("reference"),
    note: text("note"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("market_comparables_org_zone").on(t.organizationId, t.microzoneId),
    index("market_comparables_org_latlng").on(t.organizationId, t.lat, t.lng),
  ],
);
