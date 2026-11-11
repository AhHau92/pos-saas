"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { Icon, type IconName } from "@/components/ui/icons";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  children?: { href: string; label: string }[];
};

type Props = {
  appName: string;
  tenantName: string;
  user: { name: string; role: Role };
  outlet: { id: string; code: string; name: string };
  outlets: { id: string; code: string; name: string }[];
  nav: NavItem[];
  children: ReactNode;
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ appName, tenantName, user, outlet, outlets, nav, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function switchOutlet(outletId: string) {
    setSwitching(true);
    try {
      await apiRequest("/api/auth/outlet", { body: { outletId } });
      router.refresh();
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setSwitching(false);
    }
  }

  async function logout() {
    await apiRequest("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    window.location.href = "/login";
  }

  const sidebar = (
    <nav className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
          <Icon name="phone" className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{tenantName}</div>
          <div className="truncate text-[11px] text-slate-400">{appName}</div>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {nav.map((item) => {
          const active = isActive(pathname, item.href) || (item.children ?? []).some((c) => isActive(pathname, c.href));
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  active ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon name={item.icon} className="h-4.5 w-4.5 shrink-0" />
                {item.label}
              </Link>
              {active && item.children ? (
                <div className="mb-1 ml-9 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block rounded px-2 py-1 text-[13px] ${
                        pathname === child.href ? "text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="px-1 text-sm text-white">{user.name}</div>
        <div className="px-1 text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
        <button
          type="button"
          onClick={logout}
          className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <Icon name="logout" className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-60 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-60">{sidebar}</div>
      </aside>
      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Icon name="store" className="h-4 w-4" />
            {outlets.length > 1 ? (
              <select
                value={outlet.id}
                disabled={switching}
                onChange={(e) => switchOutlet(e.target.value)}
                className="rounded-md border border-slate-200 bg-white py-1 pl-2 pr-7 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
                aria-label="Current outlet"
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium text-slate-900">
                {outlet.code} · {outlet.name}
              </span>
            )}
          </div>
          <div className="ml-auto">
            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <Icon name="pos" className="h-4 w-4" /> Open POS
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
