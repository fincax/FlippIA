import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div className="max-w-md text-center anim-rise">
        <div className="text-[11px] uppercase tracking-[0.18em] text-fg-3">404</div>
        <h1 className="font-display text-2xl mt-2">Esta página no existe.</h1>
        <p className="text-sm text-fg-2 mt-2">
          El enlace puede haber caducado o el recurso pertenece a otra organización.
        </p>
        <Link
          href="/app"
          className="inline-block mt-6 rounded-[var(--radius-md)] bg-accent text-bg px-4 py-2 text-sm font-medium"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
