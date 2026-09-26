/** Skeleton while a server page resolves its data. */
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Cargando">
      <div className="h-3 w-24 rounded bg-surface-raised" />
      <div className="h-8 w-2/3 max-w-md rounded bg-surface-raised" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 rounded-[var(--radius-lg)] bg-surface" />
        <div className="h-28 rounded-[var(--radius-lg)] bg-surface" />
        <div className="h-28 rounded-[var(--radius-lg)] bg-surface" />
      </div>
      <div className="h-64 rounded-[var(--radius-lg)] bg-surface" />
    </div>
  );
}
