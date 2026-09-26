import { readFile } from "node:fs/promises";
import path from "node:path";

/** Browsers request /favicon.ico unprompted; serve the SVG icon with the right type. */
export async function GET() {
  const svg = await readFile(path.join(process.cwd(), "public", "icon.svg"));
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
