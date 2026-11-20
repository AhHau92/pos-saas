"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toIncomingUnits, UnitEntry, type UnitDraft } from "@/components/inventory/unit-entry";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";

type Item = {
  id: string;
  label: string;
  sku: string;
  serialized: boolean;
  /** used / refurbished: grade and battery per unit */
  used: boolean;
  remaining: number;
  unitCostCents: number;
};
type LineState = { quantity: number; unitCostCents: number; units: UnitDraft[] };

export function ReceiveForm({ purchaseOrderId, currency, items }: { purchaseOrderId: string; currency: string; items: Item[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, { quantity: i.serialized ? 0 : i.remaining, unitCostCents: i.unitCostCents, units: [] }]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<LineState>) {
    setLines((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
  }

  const quantityOf = (item: Item) => (item.serialized ? lines[item.id].units.length : lines[item.id].quantity);
  const totalQuantity = items.reduce((sum, item) => sum + quantityOf(item), 0);
  const total = items.reduce((sum, item) => sum + quantityOf(item) * lines[item.id].unitCostCents, 0);

  async function submit() {
    setError(null);
    const payload = [];
    try {
      for (const item of items) {
        const line = lines[item.id];
        if (item.serialized) {
          if (line.units.length === 0) continue;
          if (line.units.length > item.remaining) {
            throw new Error(`${item.label}: ${line.units.length} scanned but only ${item.remaining} remaining`);
          }
          payload.push({
            purchaseOrderItemId: item.id,
            quantity: line.units.length,
            unitCostCents: line.unitCostCents,
            units: toIncomingUnits(line.units),
          });
        } else if (line.quantity > 0) {
          payload.push({ purchaseOrderItemId: item.id, quantity: line.quantity, unitCostCents: line.unitCostCents });
        }
      }
      if (payload.length === 0) throw new Error("Enter quantities or scan IMEIs for at least one item");
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/api/purchase-orders/${purchaseOrderId}/receive`, { body: { notes: notes || null, lines: payload } });
      router.push(`/purchasing/orders/${purchaseOrderId}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      {items.map((item) => {
        const line = lines[item.id];
        const scanned = line.units.length;
        return (
          <Card key={item.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-medium text-slate-900">{item.label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span>
                    {item.sku} · {item.remaining} remaining
                  </span>
                  {item.serialized ? <Badge tone="indigo">IMEI</Badge> : null}
                  {item.used ? <Badge tone="amber">Used</Badge> : null}
                </div>
              </div>
              <div className="flex items-end gap-3">
                {!item.serialized ? (
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-600">Qty received</span>
                    <input
                      type="number"
                      min={0}
                      max={item.remaining}
                      className={`${inputClass} w-24 text-right`}
                      value={line.quantity}
                      onChange={(e) =>
                        update(item.id, { quantity: Math.max(0, Math.min(item.remaining, Math.floor(Number(e.target.value) || 0))) })
                      }
                    />
                  </label>
                ) : (
                  <div className="text-right text-sm">
                    <div className="text-xs text-slate-600">Scanned</div>
                    <div className={`text-lg font-semibold tabular-nums ${scanned > item.remaining ? "text-rose-600" : ""}`}>
                      {scanned} / {item.remaining}
                    </div>
                  </div>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">Unit cost</span>
                  <MoneyInput className="w-32" value={line.unitCostCents} onChange={(c) => update(item.id, { unitCostCents: c })} ariaLabel="Unit cost" />
                </label>
                <div className="text-right text-sm">
                  <div className="text-xs text-slate-600">Amount</div>
                  <div className="text-lg font-semibold tabular-nums">{formatMoney(quantityOf(item) * line.unitCostCents, currency)}</div>
                </div>
              </div>
            </div>
            {item.serialized ? (
              <div className="mt-3">
                <UnitEntry
                  units={line.units}
                  onChange={(units) => update(item.id, { units })}
                  max={item.remaining}
                  withCondition={item.used}
                />
              </div>
            ) : null}
          </Card>
        );
      })}
      <Card className="px-5 py-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Notes (delivery order no., etc.)</span>
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            Receiving <span className="font-semibold">{totalQuantity}</span> item{totalQuantity === 1 ? "" : "s"} · value{" "}
            <span className="font-semibold">{formatMoney(total, currency)}</span>
          </div>
          <Button onClick={submit} loading={busy}>
            Confirm goods receipt
          </Button>
        </div>
      </Card>
    </div>
  );
}
