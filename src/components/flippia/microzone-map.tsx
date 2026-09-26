import { SEVILLA } from "@/modules/city/sevilla";

/**
 * MapLayers (schematic). A lightweight SVG projection of Sevilla microzones:
 * opportunity/market layers without external tiles. Real tiles (PostGIS +
 * maplibre) plug in behind the `map.tiles` feature flag.
 */
export function MicrozoneMap({
  activeId,
  point,
  comparables,
  hits,
}: {
  activeId?: string;
  point?: { lat: number; lng: number };
  comparables?: Array<{ id: string; distanceM: number; ppm2: number }>;
  hits?: Array<{ microzoneId: string; score: number }>;
}) {
  const [minLng, minLat, maxLng, maxLat] = SEVILLA.bbox;
  const w = 320;
  const h = 300;
  const sx = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * w;
  const sy = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat)) * h;
  const maxScore = Math.max(1, ...(hits?.map((x) => x.score) ?? [1]));
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto rounded-[var(--radius-md)] bg-bg-2 border border-line"
      role="img"
      aria-label="Mapa esquemático de microzonas de Sevilla"
    >
      <path
        d={`M${sx(-5.995)},${sy(37.45)} C${sx(-6.01)},${sy(37.41)} ${sx(-5.99)},${sy(37.38)} ${sx(-6.0)},${sy(37.35)} L${sx(-6.005)},${sy(37.31)}`}
        stroke="var(--color-inferred)"
        strokeOpacity={0.35}
        strokeWidth={6}
        fill="none"
      />
      {SEVILLA.microzones.map((z) => {
        const hit = hits?.find((x) => x.microzoneId === z.id);
        const r = Math.max(10, Math.min(28, z.radiusM / 45));
        const active = z.id === activeId;
        return (
          <g key={z.id}>
            <circle
              cx={sx(z.centroid.lng)}
              cy={sy(z.centroid.lat)}
              r={r}
              fill={
                active
                  ? "rgba(230,180,80,0.22)"
                  : hit
                    ? `rgba(79,191,139,${0.1 + (hit.score / maxScore) * 0.35})`
                    : "rgba(255,255,255,0.03)"
              }
              stroke={active ? "var(--color-accent)" : "var(--color-border-strong)"}
              strokeWidth={active ? 1.5 : 1}
            />
            {active || hit || !z.historicCentre ? (
              <text
                x={sx(z.centroid.lng)}
                y={sy(z.centroid.lat) + r + 9}
                textAnchor="middle"
                fontSize={7}
                fill={active || hit ? "var(--color-text-primary)" : "var(--color-text-muted)"}
              >
                {z.name.split(" /")[0]}
              </text>
            ) : null}
          </g>
        );
      })}
      {point ? (
        <circle
          cx={sx(point.lng)}
          cy={sy(point.lat)}
          r={4}
          fill="var(--color-accent)"
          stroke="#000"
          strokeWidth={1}
        />
      ) : null}
      {point && comparables
        ? comparables.slice(0, 9).map((c, i) => {
            const a = (i / 9) * Math.PI * 2;
            const d = (c.distanceM / 1200) * 26;
            return (
              <circle
                key={c.id}
                cx={sx(point.lng) + Math.cos(a) * d}
                cy={sy(point.lat) + Math.sin(a) * d}
                r={2}
                fill="var(--color-success)"
                opacity={0.8}
              />
            );
          })
        : null}
    </svg>
  );
}
