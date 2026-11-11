"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/lib/client-api";

export function TransferActions({
  id,
  status,
  canManage,
  canReceive,
}: {
  id: string;
  status: string;
  canManage: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: "dispatch" | "receive" | "cancel", confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(action);
    try {
      await apiRequest(`/api/transfers/${id}/${action}`, { method: "POST", body: {} });
      router.refresh();
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      {status === "DRAFT" && canManage ? (
        <>
          <Button variant="ghost" onClick={() => run("cancel", "Cancel this transfer?")} loading={busy === "cancel"}>
            Cancel
          </Button>
          <Button onClick={() => run("dispatch", "Dispatch now? Stock will leave the sending outlet.")} loading={busy === "dispatch"}>
            Dispatch
          </Button>
        </>
      ) : null}
      {canReceive ? (
        <Button variant="success" onClick={() => run("receive", "Confirm all items have arrived?")} loading={busy === "receive"}>
          Confirm receipt
        </Button>
      ) : null}
    </div>
  );
}
