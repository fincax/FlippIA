export function GET() {
  return Response.json(
    {
      name: "FlippIA",
      short_name: "FlippIA",
      description: "Real Estate Transformation OS",
      start_url: "/app",
      display: "standalone",
      background_color: "#0b0d10",
      theme_color: "#0b0d10",
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
