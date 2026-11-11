"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/lib/client-api";

export function TenantStatusButton({ id, status }: { id: string; status: "ACTIVE" | "SUSPENDED" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  return (
    <Button
      size="sm"
      variant={next === "SUSPENDED" ? "ghost" : "secondary"}
      loading={busy}
      onClick={async () => {
        if (next === "SUSPENDED" && !window.confirm("Suspend this tenant? Its users will not be able to sign in.")) return;
        setBusy(true);
        try {
          await apiRequest(`/api/platform/tenants/${id}/status`, { body: { status: next } });
          router.refresh();
        } catch (error) {
          alert(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      {next === "SUSPENDED" ? "Suspend" : "Activate"}
    </Button>
  );
}
