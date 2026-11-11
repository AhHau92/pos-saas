"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/lib/client-api";

export function PurchaseOrderActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: "submit" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancel this purchase order?")) return;
    setBusy(action);
    try {
      await apiRequest(`/api/purchase-orders/${id}/${action}`, { method: "POST", body: {} });
      router.refresh();
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const canReceive = status === "DRAFT" || status === "ORDERED" || status === "PARTIALLY_RECEIVED";
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" ? (
        <>
          <Link href={`/purchasing/orders/${id}/edit`} className={buttonClass("secondary")}>
            Edit
          </Link>
          <Button variant="secondary" onClick={() => run("submit")} loading={busy === "submit"}>
            Mark as ordered
          </Button>
        </>
      ) : null}
      {status === "DRAFT" || status === "ORDERED" ? (
        <Button variant="ghost" onClick={() => run("cancel")} loading={busy === "cancel"}>
          Cancel order
        </Button>
      ) : null}
      {canReceive ? (
        <Link href={`/purchasing/orders/${id}/receive`} className={buttonClass("primary")}>
          Receive goods
        </Link>
      ) : null}
    </div>
  );
}
