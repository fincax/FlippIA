import { SEVILLA } from "@/modules/city/sevilla";
import type { CityProfile } from "@/modules/city/types";

/**
 * MapLayers (schematic). A lightweight SVG projection of Sevilla microzones:
 * opportunity/market layers without external tiles. Real tiles (PostGIS +
 * maplibre) plug in behind the `map.tiles` feature flag.
 *
 * Layers: `hits` (green, opportunities that meet the criteria), `focusIds`
 * (gold hairline, the microzones a spoken brief names) and `candidates`
 * (a count per microzone of assets that fit the project but do not meet
 * the criteria yet). Every layer is optional; the default look is unchanged.
 */
export function MicrozoneMap({
  activeId,
  point,
  comparables,
  hits,
  focusIds,
  candidates,
  city = SEVILLA,
}: {
  /** Covered city to draw; Sevilla by default. */
  city?: CityProfile;
  activeId?: string;
  point?: { lat: number; lng: number };
  comparables?: Array<{ id: string; distanceM: number; ppm2: number }>;
  hits?: Array<{ microzoneId: string; score: number }>;
  focusIds?: string[];
  candidates?: Array<{ microzoneId: string; count: number }>;
}) {
  const [minLng, minLat, maxLng, maxLat] = city.bbox;
  const w = 320;
  const h = 300;
  const sx = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * w;
  const sy = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat)) * h;
  const maxScore = Math.max(1, ...(hits?.map((x) => x.score) ?? [1]));
  const focus = new Set(focusIds ?? []);
  const focusing = focus.size > 0;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto rounded-[var(--radius-md)] bg-bg-2 border border-line"
      role="img"
      aria-label={
        focusing
          ? "Mapa esquemático de microzonas de Sevilla con las zonas de tu búsqueda resaltadas"
          : "Mapa esquemático de microzonas de Sevilla"
      }
    >
      <path
        d={`M${sx(-5.995)},${sy(37.45)} C${sx(-6.01)},${sy(37.41)} ${sx(-5.99)},${sy(37.38)} ${sx(-6.0)},${sy(37.35)} L${sx(-6.005)},${sy(37.31)}`}
        stroke="var(--color-inferred)"
        strokeOpacity={0.35}
        strokeWidth={6}
        fill="none"
      />
      {city.microzones.map((z) => {
        const hit = hits?.find((x) => x.microzoneId === z.id);
        const candidate = candidates?.find((x) => x.microzoneId === z.id && x.count > 0);
        const r = Math.max(10, Math.min(28, z.radiusM / 45));
        const active = z.id === activeId;
        const focused = focus.has(z.id);
        const dimmed = focusing && !focused && !hit && !active;
        const cx = sx(z.centroid.lng);
        const cy = sy(z.centroid.lat);
        // While a search focuses zones, only what matters keeps its label: the focus, the hits and the candidates.
        const labelled = focusing
          ? active || Boolean(hit) || focused || Boolean(candidate)
          : active || Boolean(hit) || !z.historicCentre;
        return (
          <g key={z.id} opacity={dimmed ? 0.55 : 1}>
            {focused ? (
              <circle
                className="anim-radar-ring"
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={1}
              />
            ) : null}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={
                active
                  ? "rgba(230,180,80,0.22)"
                  : hit
                    ? `rgba(79,191,139,${0.1 + (hit.score / maxScore) * 0.35})`
                    : focused
                      ? "rgba(230,180,80,0.08)"
                      : "rgba(255,255,255,0.03)"
              }
              stroke={active || focused ? "var(--color-accent)" : "var(--color-border-strong)"}
              strokeWidth={active ? 1.5 : focused ? 1.25 : 1}
            />
            {candidate ? (
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fontSize={9}
                fontFamily="var(--font-mono)"
                fill={hit ? "var(--color-text-primary)" : "var(--color-accent)"}
              >
                {candidate.count}
              </text>
            ) : null}
            {labelled ? (
              <text
                x={cx}
                y={cy + r + 9}
                textAnchor="middle"
                fontSize={7}
                fill={
                  focused
                    ? "var(--color-accent)"
                    : active || hit
                      ? "var(--color-text-primary)"
                      : "var(--color-text-muted)"
                }
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
