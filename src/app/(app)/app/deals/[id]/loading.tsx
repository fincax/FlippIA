/** Skeleton while a server page resolves its data. */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando">
      <div className="h-3 w-24 bg-surface-raised anim-pulse" />
      <div className="h-9 w-2/3 max-w-md bg-surface-raised anim-pulse" />
      <div className="grid gap-px md:grid-cols-3 bg-line border border-line">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 bg-surface relative overflow-hidden">
            <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-fg/5 to-transparent anim-sweep" />
          </div>
        ))}
      </div>
      <div className="h-64 border border-line bg-surface relative overflow-hidden">
        <div className="absolute inset-x-0 h-px bg-accent/60 anim-scan" />
      </div>
    </div>
  );
}
