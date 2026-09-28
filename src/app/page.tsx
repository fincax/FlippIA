import Link from "next/link";
import { FlippIACommand } from "@/components/flippia/command-bar";
import { CityCanvas } from "@/components/flippia/visual/city-canvas";
import { LIAPulse } from "@/components/flippia/visual/lia-pulse";
import { Wordmark } from "@/components/flippia/wordmark";
import { currentSession } from "@/server/auth/current";
import { csrfTokenFor } from "@/server/auth/session";

/**
 * SCREEN 01 — Home. A city waiting to be interrogated.
 * The command bar is the existing FlippIACommand; nothing else on this page is
 * functional. The city behind it is a schematic drawing, not data.
 */
export default async function HomePage() {
  const session = await currentSession();
  return (
    <main className="relative min-h-dvh overflow-hidden">
      {session ? <meta name="csrf-token" content={csrfTokenFor(session.sessionId)} /> : null}

      {/* ── the city ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 vignette" aria-hidden>
        <CityCanvas zoom={1.35} focus={{ microzoneId: "sev-triana" }} labels="md" className="opacity-90" />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,12,11,0.35)_0%,rgba(12,12,11,0)_35%,rgba(12,12,11,0.55)_80%,var(--color-bg-primary)_100%)]"
      />

      {/* ── header ───────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-[var(--gutter)] md:px-10 h-16">
        <div className="flex items-center gap-3">
          <Wordmark size="md" />
          <span className="hidden sm:inline kicker">Real Estate Transformation OS</span>
        </div>
        <nav className="flex items-center gap-5 text-[13px]">
          {session ? (
            <Link href="/app" className="text-fg-2 hover:text-fg kicker !text-[11px]">
              Mi espacio →
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-fg-2 hover:text-fg">
                Entrar
              </Link>
              <Link
                href="/register"
                className="border border-fg/80 text-fg px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase hover:bg-fg hover:text-bg transition-colors"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* ── the question ─────────────────────────────────────────────── */}
      <section className="relative z-10 px-[var(--gutter)] md:px-10 pt-[12vh] md:pt-[18vh] pb-24 max-w-5xl">
        <div className="flex items-center gap-3 anim-rise">
          <LIAPulse state="listening" size={8} />
          <span className="kicker">
            City Zero · Sevilla<span className="hidden sm:inline"> · 37.389 N · 5.984 W</span>
          </span>
        </div>
        <h1 className="display-xl text-[15vw] sm:text-7xl md:text-8xl lg:text-[7.5rem] text-fg mt-6 anim-rise [animation-delay:80ms]">
          Dame una
          <br />
          dirección.
        </h1>
        <p className="mt-6 max-w-xl text-fg-2 text-base md:text-lg leading-relaxed anim-rise [animation-delay:160ms]">
          FlippIA no busca casas. Revela lo que un inmueble puede llegar a ser: estrategias, capital, plazo,
          normativa y riesgo, con evidencia y fecha.
        </p>
        <div className="mt-10 md:mt-12 max-w-3xl anim-rise [animation-delay:240ms]">
          <FlippIACommand size="lg" autoFocus showActions />
        </div>

        {/* the sequence, as a dimension line */}
        <ol
          className="mt-14 hidden md:flex items-center gap-0 kicker anim-rise [animation-delay:360ms]"
          aria-label="Secuencia"
        >
          {["Ciudad", "Barrio", "Calle", "Parcela", "Activo", "Inteligencia", "Futuros"].map((s, i, a) => (
            <li key={s} className="flex items-center">
              <span className={i === a.length - 1 ? "text-accent" : undefined}>{s}</span>
              {i < a.length - 1 ? <span aria-hidden className="mx-3 h-px w-8 bg-line-strong" /> : null}
            </li>
          ))}
        </ol>
      </section>

      {/* ── the three questions ──────────────────────────────────────── */}
      <section className="relative z-10 px-[var(--gutter)] md:px-10 pb-12 grid gap-px md:grid-cols-3 border-y border-line bg-line max-w-[1400px]">
        <Claim
          n="01"
          title="¿Dónde está la oportunidad?"
          body="Radar de discrepancias de valor, no de pisos baratos."
        />
        <Claim
          n="02"
          title="¿Qué puedo hacer con ella?"
          body="MultiExit: reforma, redistribución, alquiler, cambio de uso, división. Nada es viable sin comprobación."
        />
        <Claim
          n="03"
          title="¿Cómo la ejecuto?"
          body="Precio máximo, estructura de capital, estrés, Deal Passport y vigilancia."
        />
      </section>

      <footer className="relative z-10 px-[var(--gutter)] md:px-10 py-8 text-[12px] text-fg-3 max-w-3xl">
        Las conclusiones de FlippIA son estimaciones con fecha y fuente; no sustituyen licencias, resoluciones
        administrativas, certificados profesionales, asesoramiento jurídico ni tasaciones oficiales. La ciudad
        del fondo es una representación esquemática.
      </footer>
    </main>
  );
}

function Claim({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="bg-bg/90 backdrop-blur-sm p-5 md:p-6">
      <div className="kicker text-accent">{n}</div>
      <div className="font-display text-lg text-fg mt-2">{title}</div>
      <p className="text-fg-2 text-sm mt-1.5">{body}</p>
    </div>
  );
}
