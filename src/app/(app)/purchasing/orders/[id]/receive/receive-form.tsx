"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { parseUnitLines } from "@/modules/inventory/client";

type Item = { id: string; label: string; sku: string; serialized: boolean; remaining: number; unitCostCents: number };
type LineState = { quantity: number; unitCostCents: number; unitText: string };

export function ReceiveForm({ purchaseOrderId, currency, items }: { purchaseOrderId: string; currency: string; items: Item[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, { quantity: i.serialized ? 0 : i.remaining, unitCostCents: i.unitCostCents, unitText: "" }]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(
    () => Object.fromEntries(items.filter((i) => i.serialized).map((i) => [i.id, parseUnitLines(lines[i.id]?.unitText ?? "")])),
    [items, lines],
  );

  function update(id: string, patch: Partial<LineState>) {
    setLines((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
  }

  const total = items.reduce((sum, item) => {
    const line = lines[item.id];
    const qty = item.serialized ? (parsed[item.id]?.units.length ?? 0) : line.quantity;
    return sum + qty * line.unitCostCents;
  }, 0);

  async function submit() {
    setError(null);
    const payload = [];
    for (const item of items) {
      const line = lines[item.id];
      if (item.serialized) {
        const p = parsed[item.id];
        if (!p || p.units.length === 0) continue;
        if (p.errors.length > 0) {
          setError(`${item.label}: ${p.errors[0]}`);
          return;
        }
        if (p.units.length > item.remaining) {
          setError(`${item.label}: ${p.units.length} scanned but only ${item.remaining} remaining`);
          return;
        }
        payload.push({
          purchaseOrderItemId: item.id,
          quantity: p.units.length,
          unitCostCents: line.unitCostCents,
          units: p.units.map((u) => ({ imei: u.imei, serialNumber: u.serialNumber, grade: u.grade, batteryHealth: u.batteryHealth })),
        });
      } else if (line.quantity > 0) {
        payload.push({ purchaseOrderItemId: item.id, quantity: line.quantity, unitCostCents: line.unitCostCents });
      }
    }
    if (payload.length === 0) {
      setError("Enter quantities or scan IMEIs for at least one item");
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
        const p = parsed[item.id];
        return (
          <Card key={item.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-medium text-slate-900">{item.label}</div>
                <div className="text-xs text-slate-500">
                  {item.sku} · {item.remaining} remaining {item.serialized ? <Badge tone="indigo">IMEI</Badge> : null}
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
                    <div className={`text-lg font-semibold ${p && p.units.length > item.remaining ? "text-rose-600" : ""}`}>
                      {p?.units.length ?? 0} / {item.remaining}
                    </div>
                  </div>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">Unit cost</span>
                  <MoneyInput className="w-32" value={line.unitCostCents} onChange={(c) => update(item.id, { unitCostCents: c })} ariaLabel="Unit cost" />
                </label>
              </div>
            </div>
            {item.serialized ? (
              <div className="mt-3">
                <textarea
                  rows={Math.min(10, Math.max(3, item.remaining))}
                  className={`${inputClass} font-mono`}
                  placeholder={"Scan one IMEI / serial per line\nUsed phone: IMEI,GRADE,BATTERY%  e.g. 356789012345678,A,87"}
                  value={line.unitText}
                  onChange={(e) => update(item.id, { unitText: e.target.value })}
                />
                {p && p.errors.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-rose-600">
                    {p.errors.slice(0, 5).map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                ) : null}
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
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm">
            Receiving value: <span className="font-semibold">{formatMoney(total, currency)}</span>
          </div>
          <Button onClick={submit} loading={busy}>
            Confirm goods receipt
          </Button>
        </div>
      </Card>
    </div>
  );
}
