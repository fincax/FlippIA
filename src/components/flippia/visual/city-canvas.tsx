import { cn } from "@/lib/cn";
import { SEVILLA } from "@/modules/city/sevilla";

/**
 * CityCanvas — an abstract Sevilla waiting to be interrogated.
 *
 * VISUAL REPRESENTATION ONLY. The parcel field is procedurally generated
 * (seeded, deterministic) around the CityProfile microzones so the drawing is
 * stable between server and client. It carries no cadastral geometry and makes
 * no claim about real parcels. When GIS layers become available from the
 * frontend they replace `parcelField()`; the props stay the same.
 *
 * Stages of focus: city → district → parcel. `zoom` scales the drawing around
 * `focus`; the transition is CSS, so the component stays server-renderable.
 */

export type CityFocus = { lat: number; lng: number } | { microzoneId: string };

const W = 1000;
const H = 1000;
const [MIN_LNG, MIN_LAT, MAX_LNG, MAX_LAT] = SEVILLA.bbox;
const PX_PER_M = W / 15_000; // the bbox spans roughly 15 km

export function projectLng(lng: number): number {
  return ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * W;
}
export function projectLat(lat: number): number {
  return (1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * H;
}

/** mulberry32: small, fast, deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Field {
  /** Parcel outlines, one path per microzone (denser, brighter). */
  parcels: Array<{ id: string; d: string; historic: boolean }>;
  /** The continuous urban fabric between microzones (fainter). */
  fabric: string;
  /** Street network between neighbouring microzones. */
  streets: string;
}

function rotRect(cx: number, cy: number, w: number, h: number, angle: number): string {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pts: Array<[number, number]> = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  return (
    pts
      .map(
        ([x, y], i) =>
          `${i === 0 ? "M" : "L"}${(cx + x * c - y * s).toFixed(1)},${(cy + x * s + y * c).toFixed(1)}`,
      )
      .join(" ") + "Z"
  );
}

// River geometry, sampled, so the fabric leaves the water alone.
const RIVER_CTRL: Array<[number, number]> = [
  [-5.992, 37.45],
  [-6.012, 37.415],
  [-5.988, 37.385],
  [-6.001, 37.36],
  [-6.003, 37.31],
];
function riverSamples(): Array<[number, number]> {
  const p = RIVER_CTRL.map(([lng, lat]) => [projectLng(lng), projectLat(lat)] as [number, number]);
  const out: Array<[number, number]> = [];
  const bez = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
    d: [number, number],
    t: number,
  ) => {
    const m = 1 - t;
    return [
      m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t * t * t * d[0],
      m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t * t * t * d[1],
    ] as [number, number];
  };
  const [p0, p1, p2, p3, p4] = p as [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
  for (let i = 0; i <= 40; i++) out.push(bez(p0, p1, p2, p3, i / 40));
  // the S segment: reflected control point, then p4
  const p3r: [number, number] = [2 * p3[0] - p2[0], 2 * p3[1] - p2[1]];
  for (let i = 1; i <= 20; i++) out.push(bez(p3, p3r, p4, p4, i / 20));
  return out;
}
function nearRiver(x: number, y: number, samples: Array<[number, number]>, d = 15): boolean {
  for (const [sx, sy] of samples)
    if (Math.abs(sx - x) < d && Math.abs(sy - y) < d && Math.hypot(sx - x, sy - y) < d) return true;
  return false;
}

/** Lays a rotated grid of blocks inside a disc; each block is split into parcels. */
function blockGrid(
  r: () => number,
  cx: number,
  cy: number,
  radius: number,
  axis: number,
  spec: {
    bw: [number, number];
    bh: [number, number];
    street: number;
    parcels: [number, number];
    skip: number;
  },
  river: Array<[number, number]>,
): string {
  const parts: string[] = [];
  const bwMean = (spec.bw[0] + spec.bw[1]) / 2;
  const bhMean = (spec.bh[0] + spec.bh[1]) / 2;
  const sx = bwMean + spec.street;
  const sy = bhMean + spec.street;
  const c = Math.cos(axis);
  const s = Math.sin(axis);
  const ni = Math.ceil(radius / sx) + 1;
  const nj = Math.ceil(radius / sy) + 1;
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      const lx = i * sx + (r() - 0.5) * spec.street * 0.6;
      const ly = j * sy + (r() - 0.5) * spec.street * 0.6;
      const edge = radius * (0.8 + r() * 0.3);
      if (Math.hypot(lx, ly) > edge) continue;
      if (r() < spec.skip) continue;
      const bx = cx + lx * c - ly * s;
      const by = cy + lx * s + ly * c;
      if (bx < 0 || by < 0 || bx > W || by > H) continue;
      if (nearRiver(bx, by, river)) continue;
      const bw = spec.bw[0] + r() * (spec.bw[1] - spec.bw[0]);
      const bh = spec.bh[0] + r() * (spec.bh[1] - spec.bh[0]);
      const n = spec.parcels[0] + Math.floor(r() * (spec.parcels[1] - spec.parcels[0] + 1));
      const gap = 0.9;
      const pw = (bw - gap * (n - 1)) / n;
      for (let k = 0; k < n; k++) {
        const ox = -bw / 2 + pw / 2 + k * (pw + gap);
        parts.push(rotRect(bx + ox * c, by + ox * s, pw, bh, axis));
      }
    }
  }
  return parts.join(" ");
}

let cached: Field | null = null;

function parcelField(): Field {
  if (cached) return cached;
  const zones = SEVILLA.microzones;
  const river = riverSamples();
  const parcels: Field["parcels"] = [];
  for (const z of zones) {
    const r = rng(hash(z.id));
    const cx = projectLng(z.centroid.lng);
    const cy = projectLat(z.centroid.lat);
    const radius = z.radiusM * PX_PER_M * 1.35;
    const axis = z.historicCentre ? r() * Math.PI : Math.round(r() * 6) * (Math.PI / 12);
    const d = blockGrid(
      r,
      cx,
      cy,
      radius,
      axis,
      z.historicCentre
        ? { bw: [9, 14], bh: [6, 9], street: 2.6, parcels: [3, 5], skip: 0.12 }
        : { bw: [20, 28], bh: [11, 14], street: 4.5, parcels: [4, 7], skip: 0.16 },
      river,
    );
    parcels.push({ id: z.id, d, historic: z.historicCentre });
  }
  // The continuous city between the microzones: a fainter, coarser fabric.
  const rb = rng(hash("sevilla-fabric"));
  const ccx = projectLng(SEVILLA.centroid.lng);
  const ccy = projectLat(SEVILLA.centroid.lat);
  const fabric = blockGrid(
    rb,
    ccx,
    ccy,
    360,
    Math.PI / 14,
    { bw: [24, 34], bh: [13, 17], street: 6, parcels: [3, 6], skip: 0.42 },
    river,
  );
  // Streets: each microzone connects to its three nearest neighbours.
  const seen = new Set<string>();
  const segs: string[] = [];
  for (const z of zones) {
    const near = zones
      .filter((o) => o.id !== z.id)
      .map((o) => ({
        o,
        d: Math.hypot(
          projectLng(o.centroid.lng) - projectLng(z.centroid.lng),
          projectLat(o.centroid.lat) - projectLat(z.centroid.lat),
        ),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    for (const { o } of near) {
      const key = [z.id, o.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      segs.push(
        `M${projectLng(z.centroid.lng).toFixed(1)},${projectLat(z.centroid.lat).toFixed(1)} L${projectLng(o.centroid.lng).toFixed(1)},${projectLat(o.centroid.lat).toFixed(1)}`,
      );
    }
  }
  cached = { parcels, fabric, streets: segs.join(" ") };
  return cached;
}

/** The Guadalquivir, schematically: the one line every sevillano recognises. */
const RIVER = `M${projectLng(-5.992).toFixed(1)},${projectLat(37.45).toFixed(1)} C${projectLng(-6.012).toFixed(1)},${projectLat(37.415).toFixed(1)} ${projectLng(-5.988).toFixed(1)},${projectLat(37.385).toFixed(1)} ${projectLng(-6.001).toFixed(1)},${projectLat(37.36).toFixed(1)} S${projectLng(-6.003).toFixed(1)},${projectLat(37.31).toFixed(1)} ${projectLng(-6.006).toFixed(1)},${projectLat(37.31).toFixed(1)}`;

function resolveFocus(focus?: CityFocus): { x: number; y: number; zoneId?: string } | null {
  if (!focus) return null;
  if ("microzoneId" in focus) {
    const z = SEVILLA.microzones.find((m) => m.id === focus.microzoneId);
    if (!z) return null;
    return { x: projectLng(z.centroid.lng), y: projectLat(z.centroid.lat), zoneId: z.id };
  }
  return { x: projectLng(focus.lng), y: projectLat(focus.lat) };
}

export function CityCanvas({
  focus,
  zoom = 1,
  labels = true,
  marker = false,
  scanning = false,
  className,
  title,
}: {
  focus?: CityFocus;
  /** 1 = city, ~3 = district, ~7 = parcel. */
  zoom?: number;
  /** true: always; "md": only from the md breakpoint (keeps phones legible). */
  labels?: boolean | "md";
  /** Draw a parcel marker at the focus point (a marker, not a geometry). */
  marker?: boolean;
  /** Sweep a scan line over the drawing. */
  scanning?: boolean;
  className?: string;
  /** Accessible title. Without it the canvas is decorative. */
  title?: string;
}) {
  const field = parcelField();
  const f = resolveFocus(focus);
  const cx = f?.x ?? W / 2;
  const cy = f?.y ?? H / 2;
  const transform = `translate(${W / 2}px, ${H / 2}px) scale(${zoom}) translate(${-cx}px, ${-cy}px)`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn("block w-full h-full", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-visual="schematic"
    >
      <g
        style={{
          transform,
          transformOrigin: "0 0",
          transition: "transform var(--motion-slow) var(--ease-in-out)",
        }}
      >
        <path d={RIVER} fill="none" stroke="var(--viz-river)" strokeWidth={14} strokeLinecap="round" />
        <path
          d={RIVER}
          fill="none"
          stroke="var(--viz-river)"
          strokeWidth={1}
          strokeOpacity={0.9}
          strokeLinecap="round"
        />
        <path
          d={field.streets}
          fill="none"
          stroke="var(--viz-street)"
          strokeWidth={1.2 / Math.sqrt(zoom)}
          strokeLinecap="round"
        />
        <path
          d={field.fabric}
          fill="var(--viz-fill-soft)"
          stroke="var(--viz-parcel-line)"
          strokeOpacity={0.55}
          strokeWidth={0.6 / Math.sqrt(zoom)}
          strokeLinejoin="round"
        />
        {field.parcels.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill={f?.zoneId === p.id ? "var(--viz-parcel-active)" : "var(--viz-parcel)"}
            stroke={f?.zoneId === p.id ? "var(--color-accent)" : "var(--viz-parcel-line)"}
            strokeWidth={0.7 / Math.sqrt(zoom)}
            strokeOpacity={f?.zoneId === p.id ? 0.55 : 1}
            strokeLinejoin="round"
          />
        ))}
        {labels && zoom < 2.5
          ? SEVILLA.microzones.map((z) => (
              <text
                key={z.id}
                x={projectLng(z.centroid.lng)}
                y={projectLat(z.centroid.lat) - z.radiusM * PX_PER_M * 1.15 - (hash(z.id) % 2) * 9}
                textAnchor="middle"
                fontSize={8}
                fontFamily="var(--font-mono)"
                letterSpacing="0.16em"
                className={labels === "md" ? "hidden md:block" : undefined}
                fill={f?.zoneId === z.id ? "var(--color-accent)" : "var(--color-text-muted)"}
                opacity={f?.zoneId === z.id ? 1 : 0.75}
              >
                {z.name.split(" /")[0]?.toUpperCase()}
              </text>
            ))
          : null}
        {f && marker ? (
          <g>
            <line
              x1={f.x - 40 / zoom}
              x2={f.x + 40 / zoom}
              y1={f.y}
              y2={f.y}
              stroke="var(--color-accent)"
              strokeWidth={0.8 / zoom}
              strokeOpacity={0.7}
            />
            <line
              x1={f.x}
              x2={f.x}
              y1={f.y - 40 / zoom}
              y2={f.y + 40 / zoom}
              stroke="var(--color-accent)"
              strokeWidth={0.8 / zoom}
              strokeOpacity={0.7}
            />
            <rect
              x={f.x - 9 / zoom}
              y={f.y - 6 / zoom}
              width={18 / zoom}
              height={12 / zoom}
              fill="var(--viz-parcel-active)"
              stroke="var(--color-accent)"
              strokeWidth={1.2 / zoom}
              strokeDasharray={`${3 / zoom} ${2 / zoom}`}
            />
            <circle cx={f.x} cy={f.y} r={2.2 / zoom} fill="var(--color-accent)" />
          </g>
        ) : null}
      </g>
      {scanning ? (
        <g className="anim-scan" style={{ transformOrigin: "0 0" }}>
          <rect x={0} y={0} width={W} height={1.5} fill="var(--viz-scan)" />
          <rect x={0} y={1.5} width={W} height={60} fill="url(#flippia-scan-fade)" />
          <defs>
            <linearGradient id="flippia-scan-fade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity={0.16} />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
        </g>
      ) : null}
    </svg>
  );
}
