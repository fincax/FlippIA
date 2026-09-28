export function GET() {
  return Response.json(
    {
      name: "FlippIA",
      short_name: "FlippIA",
      description: "Real Estate Transformation OS",
      start_url: "/app",
      display: "standalone",
      background_color: "#0c0c0b",
      theme_color: "#0c0c0b",
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
