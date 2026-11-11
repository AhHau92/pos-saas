"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function PrintControls({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="no-print mx-auto mb-4 flex w-[80mm] justify-between">
      <Button variant="secondary" size="sm" onClick={() => window.close()}>
        Close
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
