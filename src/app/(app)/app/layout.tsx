import { redirect } from "next/navigation";
import { AppShell } from "@/components/flippia/app-shell";
import { currentSession } from "@/server/auth/current";
import { csrfTokenFor } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login?next=/app");
  return (
    <AppShell session={session} csrf={csrfTokenFor(session.sessionId)}>
      {children}
    </AppShell>
  );
}
