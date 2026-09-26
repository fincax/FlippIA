import { cn } from "@/lib/cn";

/** FlippIA wordmark: the "IA" carries the accent through tokens. */
export function Wordmark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl", xl: "text-6xl md:text-7xl" };
  return (
    <span
      className={cn("font-display tracking-tight text-fg select-none", sizes[size], className)}
      aria-label="FlippIA"
    >
      Flipp<span className="text-accent">IA</span>
    </span>
  );
}
