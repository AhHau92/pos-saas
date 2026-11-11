"use client";

import { apiRequest } from "@/lib/client-api";

export function PlatformLogoutButton() {
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-slate-300 hover:bg-white/10 hover:text-white"
      onClick={async () => {
        await apiRequest("/api/platform/logout", { method: "POST", body: {} }).catch(() => undefined);
        window.location.href = "/platform/login";
      }}
    >
      Sign out
    </button>
  );
}
