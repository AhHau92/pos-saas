"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass, selectClass } from "@/components/ui/form";
import { Alert, Card, CardHeader } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { refundAmountForLine } from "@/modules/sales/client";

type Item = {
  id: string;
  description: string;
  imei: string | null;
  serialized: boolean;
  quantity: number;
  refundedQuantity: number;
  totalCents: number;
  refundedCents: number;
};

type Selection = { quantity: number; disposition: "RESTOCK" | "DEFECTIVE" };

export function RefundPanel({
  saleId,
  currency,
  items,
  paymentMethods,
}: {
  saleId: string;
  currency: string;
  items: Item[];
  paymentMethods: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refundable = items.filter((i) => i.quantity - i.refundedQuantity > 0);

  const total = useMemo(
    () =>
      refundable.reduce((sum, item) => {
        const sel = selection[item.id];
        if (!sel || sel.quantity <= 0) return sum;
        try {
          return sum + refundAmountForLine(item, sel.quantity);
        } catch {
          return sum;
        }
      }, 0),
    [refundable, selection],
  );

  function setQty(item: Item, quantity: number) {
    const remaining = item.quantity - item.refundedQuantity;
    const q = Math.max(0, Math.min(remaining, Math.floor(quantity) || 0));
    setSelection((s) => ({ ...s, [item.id]: { quantity: q, disposition: s[item.id]?.disposition ?? "RESTOCK" } }));
  }

  async function submit() {
    const chosen = Object.entries(selection)
      .filter(([, sel]) => sel.quantity > 0)
      .map(([saleItemId, sel]) => ({ saleItemId, quantity: sel.quantity, disposition: sel.disposition }));
    if (chosen.length === 0) {
      setError("Choose at least one item to refund");
      return;
    }
    if (!window.confirm(`Refund ${formatMoney(total, currency)}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ number: string }>(`/api/sales/${saleId}/refunds`, {
        body: { items: chosen, paymentMethodId: methodId, reason: reason.trim() || null },
      });
      setDone(`Refund ${result.number} created`);
      setSelection({});
      setReason("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (refundable.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Refund" description="Returned items go back to the current outlet" />
      <div className="space-y-4 px-5 py-4">
        {error ? <Alert>{error}</Alert> : null}
        {done ? <Alert tone="green">{done}</Alert> : null}
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {refundable.map((item) => {
            const remaining = item.quantity - item.refundedQuantity;
            const sel = selection[item.id];
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.description}</div>
                  <div className="text-xs text-slate-500">
                    {item.imei ? `${item.imei} · ` : ""}
                    {remaining} refundable
                  </div>
                </div>
                {item.serialized ? (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={(sel?.quantity ?? 0) > 0} onChange={(e) => setQty(item, e.target.checked ? 1 : 0)} />
                    Refund
                  </label>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={remaining}
                    value={sel?.quantity ?? 0}
                    onChange={(e) => setQty(item, Number(e.target.value))}
                    className={`${inputClass} w-20 text-center`}
                    aria-label="Quantity to refund"
                  />
                )}
                <select
                  value={sel?.disposition ?? "RESTOCK"}
                  onChange={(e) =>
                    setSelection((s) => ({
                      ...s,
                      [item.id]: { quantity: s[item.id]?.quantity ?? 0, disposition: e.target.value === "DEFECTIVE" ? "DEFECTIVE" : "RESTOCK" },
                    }))
                  }
                  className={`${selectClass} w-44`}
                  aria-label="Condition"
                >
                  <option value="RESTOCK">Back to stock</option>
                  <option value="DEFECTIVE">Defective</option>
                </select>
              </div>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Refund method</span>
            <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className={selectClass}>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-700">Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. faulty screen" />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm">
            Refund amount: <span className="text-lg font-semibold text-rose-600">{formatMoney(total, currency)}</span>
          </div>
          <Button variant="danger" onClick={submit} loading={busy} disabled={total <= 0 && !Object.values(selection).some((s) => s.quantity > 0)}>
            Refund
          </Button>
        </div>
      </div>
    </Card>
  );
}
