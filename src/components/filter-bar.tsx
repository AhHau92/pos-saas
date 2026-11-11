import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";

/** GET form for list filters (works without JavaScript). */
export function FilterBar({ children, action }: { children: ReactNode; action?: string }) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-3">
      {children}
      <button type="submit" className={buttonClass("secondary")}>
        Apply
      </button>
    </form>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
