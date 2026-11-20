"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Counts the print on the server first, so any later print of this sale is marked REPRINT. */
export function PrintControls({ saleId, autoPrint, printCount }: { saleId: string; autoPrint: boolean; printCount: number }) {
  const router = useRouter();

  async function print() {
    try {
      await fetch(`/api/sales/${saleId}/receipt/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // printing must still work when the network hiccups
    }
    // after the print dialog closes, reload so any further print shows the REPRINT mark
    window.addEventListener("afterprint", () => router.refresh(), { once: true });
    window.print();
  }

  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => void print(), 300);
    return () => window.clearTimeout(timer);
    // print once when the page opens with ?print=1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint]);

  return (
    <div className="no-print mx-auto mb-4 flex w-[80mm] items-center justify-between">
      <Button variant="secondary" size="sm" onClick={() => window.close()}>
        Close
      </Button>
      <span className="text-xs text-slate-500">{printCount > 0 ? `Printed ${printCount}×` : "Not printed yet"}</span>
      <Button size="sm" onClick={() => void print()}>
        {printCount > 0 ? "Reprint" : "Print"}
      </Button>
    </div>
  );
}
