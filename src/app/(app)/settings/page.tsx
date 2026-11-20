import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getBusinessProfile, mailStatus } from "@/modules/settings";
import { EmailSettings } from "./email-settings";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Business profile" };

export default async function SettingsPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "settings.manage")) return <NoAccess />;
  const profile = await getBusinessProfile(ctx.db);
  return (
    <div>
      <PageHeader
        title="Business profile"
        description={`Shop code: ${ctx.tenant.slug}${ctx.tenant.plan ? ` · Plan: ${ctx.tenant.plan.name} (${ctx.tenant.plan.maxOutlets} outlets, ${ctx.tenant.plan.maxUsers} users)` : ""}`}
      />
      <div className="space-y-6">
        <ProfileForm profile={profile} />
        <EmailSettings status={mailStatus()} replyTo={profile.email} />
      </div>
    </div>
  );
}
