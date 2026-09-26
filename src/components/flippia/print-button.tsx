"use client";

import { Button } from "@/components/ds";

export function PrintButton() {
  return (
    <Button variant="secondary" className="no-print" onClick={() => window.print()}>
      Exportar / imprimir PDF
    </Button>
  );
}
