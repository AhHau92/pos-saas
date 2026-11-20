"use client";

import { Button } from "@/components/ui/button";

/** The browser's print dialog also offers "Save as PDF" (desktop and mobile). */
export function SaveReceiptButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      Save / print
    </Button>
  );
}
