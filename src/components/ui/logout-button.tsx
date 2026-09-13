"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ onLogout }: { onLogout?: () => void }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const logout = async () => {
    setIsPending(true);
    try {
      await fetch("/api/auth/logout", { method: "DELETE" });
    } finally {
      onLogout?.();
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isPending}
      className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 disabled:opacity-60"
    >
      <LogOut className="h-5 w-5" />
      {isPending ? "Logging out…" : "Log out"}
    </button>
  );
}
