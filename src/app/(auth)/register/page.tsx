import Link from "next/link";
import { AuthForm } from "@/components/flippia/auth-form";
import { Wordmark } from "@/components/flippia/wordmark";

export const metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm anim-rise">
        <Link href="/" className="inline-block mb-8">
          <Wordmark />
        </Link>
        <h1 className="font-display text-2xl mb-1">Crear cuenta</h1>
        <p className="text-sm text-fg-2 mb-6">Cada cuenta crea su propia organización aislada.</p>
        <AuthForm mode="register" demo={process.env.DEMO_MODE === "true"} />
        <p className="text-sm text-fg-3 mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link className="text-fg underline-offset-4 hover:underline" href="/login">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
