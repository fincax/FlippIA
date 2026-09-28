"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/app", label: "Pulso", short: "Pulso", icon: "01" },
  { href: "/app/deals", label: "Deals", short: "Deals", icon: "02" },
  { href: "/app/radar", label: "Radar", short: "Radar", icon: "03" },
  { href: "/app/watch", label: "Vigilancia", short: "Vigilar", icon: "04" },
  { href: "/app/onboarding", label: "Investor DNA", short: "DNA", icon: "05" },
  { href: "/app/observability", label: "Agentes", short: "Agentes", icon: "06" },
];

export function NavLinks({ mobile, admin }: { mobile?: boolean; admin?: boolean }) {
  const pathname = usePathname();
  const visible = admin ? NAV : NAV.filter((n) => n.href !== "/app/observability");
  const items = mobile ? visible.slice(0, 5) : visible;
  return (
    <ul className={cn(mobile ? "grid grid-cols-5" : "space-y-px")}>
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
                  ? "flex-col gap-0.5 py-2 text-[10px] uppercase tracking-[0.1em] font-mono"
                  : "gap-3 px-2.5 py-2 text-sm border-l-2",
                active ? "text-fg" : "text-fg-2 hover:text-fg",
                !mobile && (active ? "border-accent bg-surface" : "border-transparent"),
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "font-mono text-[10px] tracking-[0.12em]",
                  mobile ? (active ? "text-accent" : "text-fg-3") : active ? "text-accent" : "text-fg-3",
                )}
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
