"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ds";
import { api } from "@/lib/client";

export function AuthForm({
  mode,
  next,
  demo,
}: {
  mode: "login" | "register";
  next?: string;
  demo?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<null | "form" | "demo">(null);
  const [error, setError] = useState<string | null>(null);
  const target = next && next.startsWith("/") ? next : "/app";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading("form");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const r = await api(`/api/auth/${mode}`, { body });
    setLoading(null);
    if (!r.ok) return setError(r.error?.message ?? "Error");
    router.push(mode === "register" ? "/app/onboarding" : target);
    router.refresh();
  }

  async function enterDemo() {
    setError(null);
    setLoading("demo");
    const r = await api("/api/auth/demo", { method: "POST" });
    setLoading(null);
    if (!r.ok) return setError(r.error?.message ?? "Error");
    router.push(target);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "register" ? (
        <Field label="Nombre">
          <Input name="name" required minLength={2} autoComplete="name" />
        </Field>
      ) : null}
      <Field label="Email">
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Contraseña" hint={mode === "register" ? "Mínimo 10 caracteres." : undefined}>
        <Input
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 10 : 1}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
        />
      </Field>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading === "form"}>
        {mode === "login" ? "Entrar" : "Crear cuenta"}
      </Button>
      {demo ? (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          loading={loading === "demo"}
          onClick={enterDemo}
        >
          Entrar con la demo de Sevilla
        </Button>
      ) : null}
    </form>
  );
}
