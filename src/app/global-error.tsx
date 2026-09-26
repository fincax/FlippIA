"use client";

/** Last-resort boundary: replaces the root layout when even it fails. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0b0d10",
          color: "#f2f1ec",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: 16,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 500 }}>Algo ha fallado.</h1>
          <p style={{ fontSize: 14, color: "#a3a9b3" }}>
            No hemos podido mostrar la aplicación. Vuelve a intentarlo en unos segundos.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              background: "#e6b450",
              color: "#0b0d10",
              border: 0,
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
