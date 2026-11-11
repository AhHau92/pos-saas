import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireTenantContext } from "@/lib/auth/context";
import { can, type Role } from "@/lib/auth/permissions";
import { getBusinessProfile } from "@/modules/settings";

function buildNav(role: Role): NavItem[] {
  const nav: NavItem[] = [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }];
  if (can(role, "pos.sell")) nav.push({ href: "/pos", label: "POS", icon: "pos" });
  if (can(role, "sales.view")) nav.push({ href: "/sales", label: "Sales", icon: "receipt" });
  if (can(role, "products.view")) nav.push({ href: "/products", label: "Products", icon: "box" });
  if (can(role, "inventory.view")) {
    const children = [
      { href: "/inventory", label: "Stock by outlet" },
      { href: "/inventory/units", label: "IMEI / Serial" },
      { href: "/inventory/movements", label: "Stock ledger" },
    ];
    if (can(role, "inventory.adjust")) children.push({ href: "/inventory/adjustments", label: "Adjustments" });
    nav.push({ href: "/inventory", label: "Inventory", icon: "layers", children });
  }
  if (can(role, "purchasing.view")) {
    nav.push({
      href: "/purchasing/orders",
      label: "Purchasing",
      icon: "truck",
      children: [
        { href: "/purchasing/orders", label: "Purchase orders" },
        { href: "/purchasing/suppliers", label: "Suppliers" },
      ],
    });
  }
  if (can(role, "transfers.view")) nav.push({ href: "/transfers", label: "Transfers", icon: "transfer" });
  if (can(role, "settings.manage")) {
    nav.push({
      href: "/settings",
      label: "Settings",
      icon: "settings",
      children: [
        { href: "/settings", label: "Business profile" },
        { href: "/settings/outlets", label: "Outlets" },
        { href: "/settings/users", label: "Users" },
        { href: "/settings/payment-methods", label: "Payment methods" },
      ],
    });
  }
  return nav;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireTenantContext();
  const profile = await getBusinessProfile(ctx.db);
  return (
    <AppShell
      appName={process.env.NEXT_PUBLIC_APP_NAME || "Phone POS"}
      tenantName={profile.name}
      user={{ name: ctx.user.name, role: ctx.user.role }}
      outlet={ctx.outlet}
      outlets={ctx.outlets}
      nav={buildNav(ctx.role)}
    >
      {children}
    </AppShell>
  );
}
