"use client";

import { useEffect, useRef, useState } from "react";
import { inputClass } from "@/components/ui/form";
import { apiRequest } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { ProductTypeValue, VariantSearchResult } from "@/modules/products/client";

/** Typeahead to pick a product variant (SKU). */
export function VariantPicker({
  onSelect,
  types,
  outletId,
  currency,
  placeholder = "Search product, SKU or barcode…",
  showCost = false,
}: {
  onSelect: (variant: VariantSearchResult) => void;
  types?: ProductTypeValue[];
  outletId?: string;
  currency: string;
  placeholder?: string;
  showCost?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const latest = useRef("");

  useEffect(() => {
    latest.current = query;
    const text = query.trim();
    if (text.length < 1) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ q: text, take: "15" });
      if (types?.length) params.set("types", types.join(","));
      if (outletId) params.set("outletId", outletId);
      try {
        const found = await apiRequest<VariantSearchResult[]>(`/api/variants/search?${params.toString()}`);
        if (latest.current.trim() === text) {
          setResults(found);
          setOpen(true);
        }
      } catch {
        setResults([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, types, outletId]);

  function choose(variant: VariantSearchResult) {
    onSelect(variant);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        className={inputClass}
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (results[0]) choose(results[0]);
          }
        }}
      />
      {open && results.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.map((v) => (
            <li key={v.variantId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(v)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-indigo-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{v.label}</span>
                  <span className="block text-xs text-slate-500">
                    {v.sku}
                    {v.productType === "SERIALIZED" ? " · IMEI" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-500">
                  {showCost ? `cost ${formatMoney(v.costCents, currency)}` : formatMoney(v.priceCents, currency)}
                  {v.onHand !== null ? <span className="block">{v.onHand} on hand</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
