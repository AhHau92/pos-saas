import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listOutlets } from "@/modules/outlets";
import { listUsers } from "@/modules/users";
import { UserManager } from "./user-manager";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "users.manage")) return <NoAccess />;
  const [users, outlets] = await Promise.all([listUsers(ctx.db), listOutlets(ctx.db)]);
  return (
    <div>
      <PageHeader
        title="Users"
        description={`Staff sign in with shop code "${ctx.tenant.slug}", their email and password.${ctx.tenant.plan ? ` Plan limit: ${ctx.tenant.plan.maxUsers} active users.` : ""}`}
      />
      <UserManager
        users={users}
        outlets={outlets.map((o) => ({ id: o.id, code: o.code, name: o.name }))}
        currentUserId={ctx.userId}
      />
    </div>
  );
}
