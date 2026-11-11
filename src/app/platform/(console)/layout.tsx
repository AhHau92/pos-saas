import Link from "next/link";
import type { ReactNode } from "react";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { PlatformLogoutButton } from "./logout-button";

export default async function PlatformConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requirePlatformAdmin();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 text-slate-200">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <span className="font-semibold text-white">{process.env.NEXT_PUBLIC_APP_NAME || "Phone POS"} · Platform</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/platform" className="hover:text-white">
              Tenants
            </Link>
            <Link href="/platform/tenants/new" className="hover:text-white">
              New tenant
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-400">{admin.email}</span>
            <PlatformLogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
