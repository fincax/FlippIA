import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FlippIA — Real Estate Transformation OS", template: "%s · FlippIA" },
  description:
    "FlippIA descubre el mejor futuro posible de un inmueble. De una dirección a una tesis de inversión completa.",
  applicationName: "FlippIA",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0c0c0b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The CSP nonce is generated per request by `src/proxy.ts` and injected by
  // Next.js at render time, so every page must render dynamically: a page
  // prerendered at build time would ship scripts without a nonce.
  await connection();
  return (
    <html lang="es" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
