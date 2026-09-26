"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function LinkTabs({
  tabs,
  className,
}: {
  tabs: Array<{ href: string; label: string; count?: number }>;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      className={cn("flex gap-1 overflow-x-auto border-b border-line -mx-4 px-4 md:mx-0 md:px-0", className)}
      aria-label="Secciones"
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors",
              active ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="ml-1.5 text-[11px] text-fg-3 num">{t.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
