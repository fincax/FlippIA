import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api";
import { routeCommand } from "@/modules/lia/router";
import { requireMutation } from "@/server/auth/current";

const schema = z.object({ text: z.string().min(1).max(2000) });

export const POST = handle(async (req: Request) => {
  await requireMutation();
  const { text } = schema.parse(await readJson(req));
  return jsonOk(routeCommand(text));
});
