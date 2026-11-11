"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VariantPicker } from "@/components/variant-picker";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert, Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { ProductTypeValue, VariantSearchResult } from "@/modules/products/client";

export type PurchaseOrderFormInitial = {
  id: string;
  supplierId: string;
  outletId: string;
  /** YYYY-MM-DD */
  expectedAt: string | null;
  notes: string | null;
  items: { variantId: string; label: string; sku: string; productType: ProductTypeValue; quantity: number; unitCostCents: number }[];
};

type Line = {
  key: string;
  variantId: string;
  label: string;
  sku: string;
  productType: ProductTypeValue;
  quantity: number;
  unitCostCents: number;
};

let seq = 0;
const lineKey = () => `po-${++seq}`;

export function PurchaseOrderForm({
  suppliers,
  outlets,
  defaultOutletId,
  currency,
  initial,
}: {
  suppliers: { id: string; name: string }[];
  outlets: { id: string; code: string; name: string }[];
  defaultOutletId: string;
  currency: string;
  initial?: PurchaseOrderFormInitial;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? suppliers[0]?.id ?? "");
  const [outletId, setOutletId] = useState(initial?.outletId ?? defaultOutletId);
  // initial.expectedAt is already "YYYY-MM-DD" in the business timezone
  const [expectedAt, setExpectedAt] = useState(initial?.expectedAt ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(initial ? initial.items.map((i) => ({ ...i, key: lineKey() })) : []);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCostCents, 0);

  function addVariant(v: VariantSearchResult) {
    setLines((list) => {
      const existing = list.find((l) => l.variantId === v.variantId);
      if (existing) return list.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...list,
        { key: lineKey(), variantId: v.variantId, label: v.label, sku: v.sku, productType: v.productType, quantity: 1, unitCostCents: v.costCents },
      ];
    });
  }

  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "draft");
    setError(null);
    const body = {
      supplierId,
      outletId,
      expectedAt: expectedAt || null,
      notes: notes || null,
      submit,
      items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCostCents: l.unitCostCents })),
    };
    try {
      const result = initial
        ? await apiRequest<{ id: string }>(`/api/purchase-orders/${initial.id}`, { method: "PUT", body })
        : await apiRequest<{ id: string }>("/api/purchase-orders", { body });
      router.push(`/purchasing/orders/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  if (suppliers.length === 0) {
    return (
      <Alert tone="amber">
        Add a supplier first:{" "}
        <Link href="/purchasing/suppliers" className="underline">
          Suppliers
        </Link>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      <Card>
        <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
          <Field label="Supplier">
            <select className={selectClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Deliver to outlet">
            <select className={selectClass} value={outletId} onChange={(e) => setOutletId(e.target.value)}>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expected date">
            <input type="date" className={inputClass} value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
          </Field>
          <Field label="Notes" className="md:col-span-3">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Items" description="Search and add products. Quantities of IMEI products are scanned when the goods arrive." />
        <div className="border-b border-slate-100 px-5 py-3">
          <VariantPicker currency={currency} types={["SERIALIZED", "NON_SERIALIZED"]} onSelect={addVariant} showCost />
        </div>
        {lines.length === 0 ? (
          <EmptyState title="No items yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Unit cost</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{l.label}</div>
                      <div className="text-xs text-slate-500">
                        {l.sku} {l.productType === "SERIALIZED" ? <Badge tone="indigo">IMEI</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        className={`${inputClass} ml-auto w-24 text-right`}
                        value={l.quantity}
                        onChange={(e) => {
                          const quantity = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setLines((list) => list.map((x) => (x.key === l.key ? { ...x, quantity } : x)));
                        }}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <MoneyInput
                        className="ml-auto w-32"
                        value={l.unitCostCents}
                        onChange={(c) => setLines((list) => list.map((x) => (x.key === l.key ? { ...x, unitCostCents: c } : x)))}
                        ariaLabel="Unit cost"
                      />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(l.quantity * l.unitCostCents, currency)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remove"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right font-semibold">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(total, currency)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => save(false)} loading={busy === "draft"} disabled={busy !== null || lines.length === 0}>
          Save draft
        </Button>
        <Button onClick={() => save(true)} loading={busy === "submit"} disabled={busy !== null || lines.length === 0}>
          Save &amp; mark as ordered
        </Button>
      </div>
    </div>
  );
}
