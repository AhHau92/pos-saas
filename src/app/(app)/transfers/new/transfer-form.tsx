"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { VariantPicker } from "@/components/variant-picker";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Alert, Card, CardHeader } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { UNIT_STATUS_LABELS, type UnitStatus } from "@/modules/inventory/client";
import type { VariantSearchResult } from "@/modules/products/client";

type UnitInfo = {
  id: string;
  imei: string | null;
  serialNumber: string | null;
  status: UnitStatus;
  outletId: string;
  outletCode: string;
  label: string;
};

type QtyLine = { variantId: string; label: string; sku: string; quantity: number; max: number };

export function TransferForm({
  fromOutletId,
  destinations,
  currency,
}: {
  fromOutletId: string;
  destinations: { id: string; code: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const [toOutletId, setToOutletId] = useState(destinations[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [scan, setScan] = useState("");
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [lines, setLines] = useState<QtyLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "dispatch" | null>(null);

  async function addScan() {
    const identifier = scan.trim();
    if (!identifier) return;
    setError(null);
    try {
      const unit = await apiRequest<UnitInfo>(`/api/inventory/units/lookup?identifier=${encodeURIComponent(identifier)}`);
      if (unit.status !== "IN_STOCK") throw new Error(`${identifier} is ${UNIT_STATUS_LABELS[unit.status].toLowerCase()}`);
      if (unit.outletId !== fromOutletId) throw new Error(`${identifier} is at ${unit.outletCode}, not at this outlet`);
      if (units.some((u) => u.id === unit.id)) throw new Error(`${identifier} is already on this transfer`);
      setUnits((list) => [...list, unit]);
      setScan("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function addVariant(v: VariantSearchResult) {
    const max = v.onHand ?? 0;
    if (max <= 0) {
      setError(`${v.label} has no stock at this outlet`);
      return;
    }
    setError(null);
    setLines((list) =>
      list.some((l) => l.variantId === v.variantId)
        ? list
        : [...list, { variantId: v.variantId, label: v.label, sku: v.sku, quantity: 1, max }],
    );
  }

  async function save(dispatch: boolean) {
    setBusy(dispatch ? "dispatch" : "draft");
    setError(null);
    try {
      const result = await apiRequest<{ id: string }>("/api/transfers", {
        body: {
          fromOutletId,
          toOutletId,
          notes: notes || null,
          stockUnitIds: units.map((u) => u.id),
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          dispatch,
        },
      });
      router.push(`/transfers/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  if (destinations.length === 0) {
    return <Alert tone="amber">You need at least two active outlets to transfer stock.</Alert>;
  }

  const empty = units.length === 0 && lines.length === 0;

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      <Card>
        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <Field label="Send to">
            <select className={selectClass} value={toOutletId} onChange={(e) => setToOutletId(e.target.value)}>
              {destinations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={`Phones / devices (IMEI) · ${units.length}`} />
        <div className="px-5 py-4">
          <div className="flex gap-2">
            <input
              className={`${inputClass} font-mono`}
              placeholder="Scan IMEI / serial and press Enter"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addScan();
                }
              }}
            />
            <Button variant="secondary" onClick={addScan}>
              Add
            </Button>
          </div>
          {units.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
              {units.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    <span className="font-mono">{u.imei ?? u.serialNumber}</span>
                    <span className="text-slate-500"> · {u.label}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUnits((list) => list.filter((x) => x.id !== u.id))}
                    className="rounded p-1 text-slate-400 hover:text-rose-600"
                    aria-label="Remove"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title={`Accessories (quantity) · ${lines.length}`} />
        <div className="space-y-3 px-5 py-4">
          <VariantPicker currency={currency} types={["NON_SERIALIZED"]} outletId={fromOutletId} onSelect={addVariant} />
          {lines.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {lines.map((l) => (
                <li key={l.variantId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{l.label}</span>
                    <span className="text-xs text-slate-500">
                      {l.sku} · {l.max} available
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={l.max}
                      className={`${inputClass} w-20 text-right`}
                      value={l.quantity}
                      onChange={(e) => {
                        const quantity = Math.max(1, Math.min(l.max, Math.floor(Number(e.target.value) || 1)));
                        setLines((list) => list.map((x) => (x.variantId === l.variantId ? { ...x, quantity } : x)));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setLines((list) => list.filter((x) => x.variantId !== l.variantId))}
                      className="rounded p-1 text-slate-400 hover:text-rose-600"
                      aria-label="Remove"
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => save(false)} loading={busy === "draft"} disabled={busy !== null || empty}>
          Save draft
        </Button>
        <Button onClick={() => save(true)} loading={busy === "dispatch"} disabled={busy !== null || empty}>
          Dispatch now
        </Button>
      </div>
    </div>
  );
}
