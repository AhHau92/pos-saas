/**
 * Role-based permissions. Enforced in the service layer (assertCan) and used by the UI to hide actions.
 * Pure module — safe in client components.
 */

export type Role = "OWNER" | "MANAGER" | "CASHIER";

const ALL: readonly Role[] = ["OWNER", "MANAGER", "CASHIER"];
const MANAGEMENT: readonly Role[] = ["OWNER", "MANAGER"];
const OWNER_ONLY: readonly Role[] = ["OWNER"];

export const PERMISSIONS = {
  "pos.sell": ALL,
  "sales.view": ALL,
  "sales.refund": MANAGEMENT,
  "customers.manage": ALL,
  "products.view": ALL,
  "products.manage": MANAGEMENT,
  "inventory.view": ALL,
  "inventory.adjust": MANAGEMENT,
  "purchasing.view": MANAGEMENT,
  "purchasing.manage": MANAGEMENT,
  "transfers.view": ALL,
  "transfers.manage": MANAGEMENT,
  "transfers.receive": ALL,
  "reports.view": MANAGEMENT,
  /** Work at any outlet (cashiers are bound to their default outlet) */
  "outlets.switch": MANAGEMENT,
  "outlets.manage": OWNER_ONLY,
  "users.manage": OWNER_ONLY,
  "settings.manage": OWNER_ONLY,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};
