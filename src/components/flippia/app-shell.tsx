import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionInfo } from "@/server/auth/session";
import { CommandPalette } from "./command-palette";
import { NavLinks } from "./nav-links";
import { LIAPulse } from "./visual/lia-pulse";
import { Wordmark } from "./wordmark";
import { LogoutButton } from "./logout-button";

/** Application shell: left rail on desktop, bottom bar on mobile. */
export function AppShell({
  session,
  csrf,
  children,
}: {
  session: SessionInfo;
  csrf: string;
  children: ReactNode;
}) {
  const isAdmin = session.role === "owner" || session.role === "admin";
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[224px_minmax(0,1fr)]">
      <meta name="csrf-token" content={csrf} />
      <aside className="hidden md:flex flex-col border-r border-line bg-bg-2 px-4 py-5 sticky top-0 h-dvh">
        <Link href="/" className="px-2 flex items-center gap-3">
          <Wordmark size="md" />
        </Link>
        <div className="px-2 mt-2 kicker">City Zero · Sevilla</div>
        <div className="mt-8 flex-1">
          <NavLinks admin={isAdmin} />
        </div>
        <div className="px-2 mb-5 flex items-center gap-2">
          <LIAPulse state="idle" size={6} />
          <span className="kicker">
            LIA · <kbd className="font-mono normal-case tracking-normal">⌘K</kbd>
          </span>
        </div>
        <div className="px-2 text-[12px] text-fg-3 space-y-1 border-t border-line pt-4">
          <div className="truncate text-fg-2">{session.organization.name}</div>
          <div className="truncate font-mono text-[11px]">{session.user.email}</div>
          {session.organization.demo ? <div className="kicker text-warning">Organización DEMO</div> : null}
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-line bg-bg-2/90 backdrop-blur sticky top-0 z-30">
          <Link href="/" className="flex items-center gap-2">
            <Wordmark size="sm" />
          </Link>
          <span className="kicker truncate max-w-[50%]">{session.organization.name}</span>
        </header>
        <main className="px-4 md:px-8 py-6 md:py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10 max-w-[1400px]">
          {children}
        </main>
        <nav
          aria-label="Navegación principal"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-bg-2/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        >
          <NavLinks mobile admin={isAdmin} />
        </nav>
      </div>
      <CommandPalette />
    </div>
  );
}
