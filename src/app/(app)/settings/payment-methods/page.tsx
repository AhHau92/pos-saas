import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/ui/primitives";
import { requireTenantContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/modules/sales";
import { PaymentMethodManager } from "./payment-method-manager";

export const metadata: Metadata = { title: "Payment methods" };

export default async function PaymentMethodsPage() {
  const ctx = await requireTenantContext();
  if (!can(ctx.role, "settings.manage")) return <NoAccess />;
  const methods = await listPaymentMethods(ctx.db, { includeInactive: true });
  return (
    <div>
      <PageHeader title="Payment methods" description="Buttons shown on the POS. Only “cash” methods can give change." />
      <PaymentMethodManager methods={methods} />
    </div>
  );
}
