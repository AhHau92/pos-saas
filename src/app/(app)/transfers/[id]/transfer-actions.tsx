"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/lib/client-api";

/** Draft transfers: dispatch or cancel. (Receiving has its own page; missing items use the resolve panel.) */
export function TransferActions({ id, status, canManage }: { id: string; status: string; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: "dispatch" | "cancel", confirmText: string) {
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

  if (status !== "DRAFT" || !canManage) return null;
  return (
    <div className="flex gap-2">
      <Button variant="ghost" onClick={() => run("cancel", "Cancel this transfer?")} loading={busy === "cancel"}>
        Cancel
      </Button>
      <Button onClick={() => run("dispatch", "Dispatch now? Stock will leave the sending outlet.")} loading={busy === "dispatch"}>
        Dispatch
      </Button>
    </div>
  );
}
