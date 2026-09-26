"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-fg-3 hover:text-fg text-left"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Salir
    </button>
  );
}
