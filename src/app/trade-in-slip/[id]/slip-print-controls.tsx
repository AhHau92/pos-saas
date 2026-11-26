"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function SlipPrintControls({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="no-print mx-auto mb-4 flex w-[80mm] items-center justify-between">
      <Button variant="secondary" size="sm" onClick={() => window.close()}>
        Close
      </Button>
      <span className="text-xs text-slate-500">Print 2 copies: customer + shop</span>
      <Button size="sm" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
