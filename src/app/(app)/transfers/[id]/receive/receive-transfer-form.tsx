"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, inputClass } from "@/components/ui/form";
import { Alert, Card, CardHeader } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { normalizeIdentifier } from "@/modules/inventory/client";

type UnitRow = { itemId: string; identifier: string; label: string; sku: string };
type QtyRow = { itemId: string; label: string; sku: string; outstanding: number };

export function ReceiveTransferForm({ transferId, units, lines }: { transferId: string; units: UnitRow[]; lines: QtyRow[] }) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.itemId, l.outstanding])),
  );
  const [scan, setScan] = useState("");
  const [notice, setNotice] = useState<{ tone: "red" | "green" | "amber"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const byIdentifier = new Map(units.map((u) => [normalizeIdentifier(u.identifier), u]));

  function toggle(itemId: string, on: boolean) {
    setTicked((set) => {
      const next = new Set(set);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  function onScan() {
    const values = scan.split(/[\s,;]+/).map(normalizeIdentifier).filter(Boolean);
    if (values.length === 0) return;
    const missing: string[] = [];
    let added = 0;
    for (const value of values) {
      const unit = byIdentifier.get(value);
      if (!unit) {
        missing.push(value);
        continue;
      }
      if (!ticked.has(unit.itemId)) added += 1;
      toggle(unit.itemId, true);
    }
    setScan("");
    if (missing.length > 0) {
      setNotice({ tone: "red", text: `Not on this transfer (or already received): ${missing.join(", ")}` });
    } else {
      setNotice({ tone: "green", text: added > 0 ? `${added} ticked` : "Already ticked" });
    }
  }

  const unitCount = ticked.size;
  const qtyCount = lines.reduce((s, l) => s + (quantities[l.itemId] ?? 0), 0);
  const totalOpen = units.length + lines.reduce((s, l) => s + l.outstanding, 0);
  const receiving = unitCount + qtyCount;

  async function submit() {
    if (receiving === 0) {
      setNotice({ tone: "red", text: "Scan or tick at least one item that arrived" });
      return;
    }
    const left = totalOpen - receiving;
    if (left > 0 && !window.confirm(`${left} item(s) are not ticked and will stay in transit. Continue?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      await apiRequest(`/api/transfers/${transferId}/receive`, {
        body: {
          lines: [
            ...[...ticked].map((itemId) => ({ itemId, quantity: 1 })),
            ...lines.filter((l) => (quantities[l.itemId] ?? 0) > 0).map((l) => ({ itemId: l.itemId, quantity: quantities[l.itemId] })),
          ],
        },
      });
      router.push(`/transfers/${transferId}`);
      router.refresh();
    } catch (err) {
      setNotice({ tone: "red", text: errorMessage(err) });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      {units.length > 0 ? (
        <Card>
          <CardHeader
            title={`Phones / devices (IMEI) · ${unitCount} of ${units.length} ticked`}
            actions={
              <>
                <Button variant="ghost" size="sm" onClick={() => setTicked(new Set(units.map((u) => u.itemId)))}>
                  Tick all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setTicked(new Set())}>
                  Clear
                </Button>
              </>
            }
          />
          <div className="space-y-3 px-5 py-4">
            <div className="flex gap-2">
              <input
                autoFocus
                className={`${inputClass} font-mono`}
                placeholder="Scan IMEI / serial and press Enter (or paste several)"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onScan();
                  }
                }}
                onBlur={() => {
                  if (scan.trim()) onScan();
                }}
              />
              <Button variant="secondary" onClick={onScan}>
                Tick
              </Button>
            </div>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {units.map((u) => (
                <li key={u.itemId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={ticked.has(u.itemId)}
                      onChange={(e) => toggle(u.itemId, e.target.checked)}
                    />
                    <span className="font-mono">{u.identifier}</span>
                    <span className="truncate text-slate-500">{u.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      {lines.length > 0 ? (
        <Card>
          <CardHeader title="Accessories (quantity)" description="Count what arrived. Default = everything still in transit." />
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => (
              <li key={l.itemId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-slate-900">{l.label}</span>
                  <span className="text-xs text-slate-500">
                    {l.sku} · {l.outstanding} in transit
                  </span>
                </span>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Arrived
                  <input
                    type="number"
                    min={0}
                    max={l.outstanding}
                    className={`${inputClass} w-24 text-right`}
                    value={quantities[l.itemId] ?? 0}
                    onChange={(e) => {
                      const quantity = Math.max(0, Math.min(l.outstanding, Math.floor(Number(e.target.value) || 0)));
                      setQuantities((all) => ({ ...all, [l.itemId]: quantity }));
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Receiving <span className="font-semibold">{receiving}</span> of {totalOpen}
          {receiving < totalOpen ? ` · ${totalOpen - receiving} stay in transit` : ""}
        </p>
        <Button variant="success" onClick={submit} loading={busy}>
          Confirm received
        </Button>
      </div>
    </div>
  );
}
