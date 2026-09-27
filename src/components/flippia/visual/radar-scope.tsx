import { cn } from "@/lib/cn";
import { SEVILLA } from "@/modules/city/sevilla";
import { CityCanvas, type CityBlip } from "./city-canvas";

/**
 * RadarScope — air traffic control for real estate opportunities.
 *
 * The city as a scope: range rings, a rotating sweep, and one blip per hit
 * the Radar Engine already returned. Blips sit around the microzone of their
 * listing (a schematic position, not a geocode). Purely presentational.
 */
export function RadarScope({
  blips,
  matching,
  total,
  className,
}: {
  blips: CityBlip[];
  matching: number;
  total: number;
  className?: string;
}) {
  return (
    <div
      className={cn("frame relative overflow-hidden border border-line bg-bg-2", className)}
      role="img"
      aria-label={`Radar: ${matching} de ${total} activos cumplen tus criterios`}
    >
      <div className="absolute inset-0 vignette">
        <CityCanvas
          zoom={1.25}
          focus={{ lat: SEVILLA.centroid.lat, lng: SEVILLA.centroid.lng }}
          labels="md"
          blips={blips}
        />
      </div>

      {/* range rings, centred on the city */}
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        {[120, 240, 360, 480].map((r) => (
          <circle
            key={r}
            cx={500}
            cy={500}
            r={r}
            fill="none"
            stroke="var(--viz-axis)"
            strokeOpacity={0.35}
            strokeWidth={0.8}
            strokeDasharray="2 4"
          />
        ))}
        <line
          x1={0}
          x2={1000}
          y1={500}
          y2={500}
          stroke="var(--viz-axis)"
          strokeOpacity={0.25}
          strokeWidth={0.6}
        />
        <line
          x1={500}
          x2={500}
          y1={0}
          y2={1000}
          stroke="var(--viz-axis)"
          strokeOpacity={0.25}
          strokeWidth={0.6}
        />
        {[0, 90, 180, 270].map((deg) => (
          <text
            key={deg}
            x={500 + Math.sin((deg * Math.PI) / 180) * 470}
            y={500 - Math.cos((deg * Math.PI) / 180) * 470 + 3}
            textAnchor="middle"
            fontSize={9}
            fontFamily="var(--font-mono)"
            letterSpacing="0.14em"
            fill="var(--color-text-muted)"
          >
            {String(deg).padStart(3, "0")}
          </text>
        ))}
      </svg>

      {/* the sweep */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 size-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full anim-rotate [animation-duration:9s] mix-blend-screen"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, var(--color-accent-soft) 345deg, color-mix(in srgb, var(--color-accent) 40%, transparent) 360deg)",
        }}
      />

      {/* readout */}
      <div className="absolute left-4 top-4 kicker flex items-center gap-2">
        <span aria-hidden className="inline-block size-1.5 bg-accent anim-pulse" />
        Radar · Sevilla
      </div>
      <div className="absolute right-4 top-4 text-right">
        <div className="display-xl text-4xl md:text-5xl num text-fg">
          {String(matching).padStart(2, "0")}
          <span className="text-fg-3 text-2xl md:text-3xl">/{String(total).padStart(2, "0")}</span>
        </div>
        <div className="kicker mt-1">en criterio</div>
      </div>
      <div className="absolute left-4 bottom-4 kicker flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2 rounded-full bg-accent" /> cumple
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2 rounded-full bg-fg-3" /> no cumple
        </span>
      </div>
    </div>
  );
}
