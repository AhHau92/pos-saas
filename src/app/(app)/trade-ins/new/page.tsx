import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/modules/sales";
import { getBusinessProfile } from "@/modules/settings";
import { BuyBackForm } from "./buy-back-form";

export const metadata: Metadata = { title: "New buy-back" };

export default async function NewTradeInPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "tradeins.create")) return <NoAccess />;
  const [profile, methods] = await Promise.all([getBusinessProfile(ctx.db), listPaymentMethods(ctx.db)]);
  return (
    <div>
      <PageHeader
        back={
          <Link href="/trade-ins" className="text-indigo-600 hover:underline">
            ← Trade-ins
          </Link>
        }
        title="Buy a used device"
        description={`The customer sells device(s) to ${ctx.outlet.code} and is paid. For a trade-in towards a new phone, use “Trade-in” in the POS instead.`}
      />
      <BuyBackForm
        currency={profile.currency}
        rules={{ requireSellerId: profile.tradeInRequireSellerId, requirePoliceCheck: profile.tradeInRequirePoliceCheck }}
        paymentMethods={methods.map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}
