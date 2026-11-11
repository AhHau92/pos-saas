import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { formatDate } from "@/lib/time";
import { listTenants } from "@/modules/tenant";
import { TenantStatusButton } from "./tenant-status-button";

export const metadata: Metadata = { title: "Tenants" };

export default async function PlatformHomePage() {
  // Every page checks auth itself (layouts are not re-run on client navigation)
  await requirePlatformAdmin();
  const tenants = await listTenants();
  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Each tenant (shop) has its own database"
        actions={
          <Link href="/platform/tenants/new" className={buttonClass("primary")}>
            <Icon name="plus" className="h-4 w-4" /> New tenant
          </Link>
        }
      />
      <Card>
        {tenants.length === 0 ? (
          <EmptyState title="No tenants yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Shop</Th>
                <Th>Shop code</Th>
                <Th>Database</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Period end</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <div className="font-medium text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.ownerEmail}</div>
                    {t.provisionError ? <div className="mt-1 max-w-md text-xs text-rose-600">{t.provisionError.slice(0, 300)}</div> : null}
                  </Td>
                  <Td className="font-mono text-xs">{t.slug}</Td>
                  <Td className="font-mono text-xs text-slate-500">{t.dbName}</Td>
                  <Td>
                    {t.planName ?? "—"}
                    {t.subscriptionStatus ? (
                      <div className="mt-0.5">
                        <StatusBadge status={t.subscriptionStatus} />
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td>{t.currentPeriodEnd ? formatDate(t.currentPeriodEnd) : "—"}</Td>
                  <Td>{formatDate(t.createdAt)}</Td>
                  <Td className="text-right">
                    {t.status === "ACTIVE" || t.status === "SUSPENDED" ? <TenantStatusButton id={t.id} status={t.status} /> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
