import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { Alert } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { isMailConfigured } from "@/lib/mail";
import { getOutletTax } from "@/modules/outlets";
import { listPaymentMethods } from "@/modules/sales";
import { getBusinessProfile } from "@/modules/settings";

export const metadata: Metadata = { title: "POS" };

export default async function PosPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "pos.sell")) return <NoAccess />;
  const [profile, methods] = await Promise.all([getBusinessProfile(ctx.db), listPaymentMethods(ctx.db)]);
  // GST of the company this outlet trades as (an outlet of a non-registered company charges no GST)
  const tax = await getOutletTax(ctx.db, ctx.outletId, profile);
  return (
    <div className="space-y-4">
      {methods.length === 0 ? <Alert tone="amber">No payment methods are active. Ask the owner to add one in Settings.</Alert> : null}
      <PosTerminal
        key={ctx.outletId}
        currency={profile.currency}
        taxName={profile.taxName}
        taxRateBps={tax.taxRateBps}
        taxInclusive={tax.taxInclusive}
        outletLabel={`${ctx.outlet.code} · ${ctx.outlet.name}`}
        paymentMethods={methods.map((m) => ({ id: m.id, name: m.name, isCash: m.isCash }))}
        mailEnabled={isMailConfigured()}
        canTradeIn={can(ctx.role, "tradeins.create")}
        tradeInRules={{ requireSellerId: profile.tradeInRequireSellerId, requirePoliceCheck: profile.tradeInRequirePoliceCheck }}
      />
    </div>
  );
}
