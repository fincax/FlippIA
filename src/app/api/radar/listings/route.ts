import { handle, jsonError, jsonOk, readJson } from "@/lib/api";
import { requireMutation, tenantContext } from "@/server/auth/current";
import {
  addListings,
  ListingImportError,
  listingsBatchSchema,
  listOwnListings,
} from "@/server/services/listings";

export const GET = handle(async () => {
  const { ctx } = await tenantContext();
  return jsonOk(await listOwnListings(ctx));
});

export const POST = handle(async (req: Request) => {
  const { ctx } = await requireMutation();
  const body = listingsBatchSchema.parse(await readJson(req));
  try {
    const rows = await addListings(ctx, body.listings);
    return jsonOk({ inserted: rows.length, listings: rows }, { status: 201 });
  } catch (e) {
    if (e instanceof ListingImportError) return jsonError("VALIDATION", e.message, 422, e.issues);
    throw e;
  }
});
