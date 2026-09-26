"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, Surface } from "@/components/ds";

/** Boundary for the authenticated app: keeps the shell, explains, offers retry. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    // The server already logged the failure; the digest lets support correlate it.
  }, [error]);
  return (
    <Surface className="p-8 max-w-xl">
      <div className="text-[11px] uppercase tracking-[0.18em] text-fg-3">Error</div>
      <h1 className="font-display text-xl mt-2">No hemos podido cargar esta vista.</h1>
      <p className="text-sm text-fg-2 mt-2">
        El resto de la aplicación sigue disponible. Si el problema continúa, indícanos esta referencia:{" "}
        <span className="num">{error.digest ?? "sin referencia"}</span>.
      </p>
      <div className="mt-5 flex gap-2">
        <Button variant="accent" onClick={reset}>
          Reintentar
        </Button>
        <Button variant="secondary" onClick={() => router.push("/app")}>
          Ir al inicio
        </Button>
      </div>
    </Surface>
  );
}
