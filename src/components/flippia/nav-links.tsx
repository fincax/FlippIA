"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/app", label: "Pulse", short: "Pulse", icon: "◉" },
  { href: "/app/deals", label: "Deals", short: "Deals", icon: "▤" },
  { href: "/app/radar", label: "Radar", short: "Radar", icon: "◎" },
  { href: "/app/watch", label: "Vigilancia", short: "Watch", icon: "◷" },
  { href: "/app/onboarding", label: "Investor DNA", short: "DNA", icon: "◈" },
  { href: "/app/observability", label: "Agentes", short: "Agentes", icon: "⌁" },
];

export function NavLinks({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname();
  const items = mobile ? NAV.slice(0, 5) : NAV;
  return (
    <ul className={cn(mobile ? "grid grid-cols-5" : "space-y-0.5")}>
      {items.map((n) => {
        const active = n.href === "/app" ? pathname === "/app" : pathname.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center transition-colors",
                mobile
                  ? "flex-col gap-0.5 py-2 text-[10px]"
                  : "gap-3 rounded-[var(--radius-md)] px-2.5 py-2 text-sm",
                active ? "text-fg" : "text-fg-2 hover:text-fg",
                !mobile && active && "bg-surface-raised",
              )}
            >
              <span
                aria-hidden
                className={cn("font-mono", mobile ? "text-base" : "w-4 text-center text-fg-3")}
              >
                {n.icon}
              </span>
              <span>{mobile ? n.short : n.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
