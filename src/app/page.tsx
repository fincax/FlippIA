import Link from "next/link";
import { FlippIACommand } from "@/components/flippia/command-bar";
import { Wordmark } from "@/components/flippia/wordmark";
import { currentSession } from "@/server/auth/current";
import { csrfTokenFor } from "@/server/auth/session";

export default async function HomePage() {
  const session = await currentSession();
  return (
    <main className="min-h-dvh grid-paper">
      {session ? <meta name="csrf-token" content={csrfTokenFor(session.sessionId)} /> : null}
      <header className="flex items-center justify-between px-5 md:px-10 h-16">
        <Wordmark size="md" />
        <nav className="flex items-center gap-4 text-sm">
          {session ? (
            <Link href="/app" className="text-fg-2 hover:text-fg">
              Ir a mi espacio →
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-fg-2 hover:text-fg">
                Entrar
              </Link>
              <Link
                href="/register"
                className="rounded-[var(--radius-md)] bg-fg text-bg px-3 py-1.5 font-medium"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </header>
      <section className="px-5 md:px-10 pt-[10vh] md:pt-[16vh] pb-16 max-w-4xl mx-auto anim-rise">
        <div className="text-[11px] uppercase tracking-[0.2em] text-fg-3 mb-4">
          Real Estate Transformation OS · City Zero: Sevilla
        </div>
        <h1 className="font-display text-4xl md:text-6xl leading-[1.05] text-fg">¿Qué quieres descubrir?</h1>
        <p className="mt-4 text-fg-2 text-base md:text-lg max-w-2xl">
          FlippIA descubre el mejor futuro posible de un inmueble. Una dirección se convierte en una tesis de
          inversión: estrategias, escenarios, financiación, normativa y riesgos, con evidencia.
        </p>
        <div className="mt-8 md:mt-10">
          <FlippIACommand size="lg" autoFocus />
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3 text-sm">
          <Claim
            n="01"
            title="¿Dónde está la oportunidad?"
            body="Radar de discrepancias de valor, no de pisos baratos."
          />
          <Claim
            n="02"
            title="¿Qué puedo hacer con ella?"
            body="MultiExit: reforma, redistribución, alquiler, cambio de uso, división. Nada se presenta como viable sin comprobación."
          />
          <Claim
            n="03"
            title="¿Cómo la ejecuto?"
            body="Precio máximo, estructura de capital, estrés, Deal Passport y vigilancia."
          />
        </div>
      </section>
      <footer className="px-5 md:px-10 py-8 text-[12px] text-fg-3 flex flex-wrap gap-x-6 gap-y-2">
        <span>
          Las conclusiones de FlippIA son estimaciones con fecha y fuente; no sustituyen licencias,
          resoluciones administrativas, certificados profesionales, asesoramiento jurídico ni tasaciones
          oficiales.
        </span>
      </footer>
    </main>
  );
}

function Claim({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface/60 p-4">
      <div className="text-[11px] text-accent num mb-2">{n}</div>
      <div className="font-display text-lg text-fg">{title}</div>
      <p className="text-fg-2 mt-1">{body}</p>
    </div>
  );
}
