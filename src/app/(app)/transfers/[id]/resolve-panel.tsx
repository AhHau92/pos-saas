"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass } from "@/components/ui/form";
import { Alert, Card, CardHeader } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";

type Item = {
  itemId: string;
  label: string;
  sku: string;
  identifier: string | null;
  serialized: boolean;
  outstanding: number;
};

type Action = "" | "LOST" | "RETURN";
type Row = { action: Action; quantity: number };

/**
 * Manager: settle items that did not arrive.
 *   Lost              → written off (the stock value is lost)
 *   Return to sender  → back into the sending outlet's stock (never left, or came back)
 * Items left on "Still in transit" can still be received later.
 */
export function ResolvePanel({ transferId, fromOutlet, items }: { transferId: string; fromOutlet: string; items: Item[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(items.map((i) => [i.itemId, { action: "" as Action, quantity: i.outstanding }])),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = items.filter((i) => rows[i.itemId]?.action);
  const count = (action: Action) =>
    chosen.filter((i) => rows[i.itemId].action === action).reduce((s, i) => s + rows[i.itemId].quantity, 0);

  function setAll(action: Action) {
    setRows((all) => Object.fromEntries(items.map((i) => [i.itemId, { ...all[i.itemId], action }])));
  }

  async function submit() {
    setError(null);
    if (chosen.length === 0) {
      setError("Choose what happened to at least one item");
      return;
    }
    const lost = count("LOST");
    const returned = count("RETURN");
    const parts = [lost > 0 ? `${lost} written off as lost` : null, returned > 0 ? `${returned} returned to ${fromOutlet}` : null];
    if (!window.confirm(`Confirm: ${parts.filter(Boolean).join(" and ")}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiRequest(`/api/transfers/${transferId}/resolve`, {
        body: {
          note: note.trim() || null,
          lines: chosen.map((i) => ({ itemId: i.itemId, quantity: rows[i.itemId].quantity, action: rows[i.itemId].action })),
        },
      });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Missing items"
        description={`For items that did not arrive. "Lost" writes them off; "Return to ${fromOutlet}" puts them back into ${fromOutlet}'s stock. Leave "Still in transit" if they may still turn up.`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAll("RETURN")}>
              All: return
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAll("")}>
              Reset
            </Button>
          </>
        }
      />
      <div className="space-y-4 px-5 py-4">
        {error ? <Alert>{error}</Alert> : null}
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {items.map((i) => {
            const row = rows[i.itemId];
            return (
              <li key={i.itemId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-slate-900">{i.label}</span>
                  <span className="text-xs text-slate-500">
                    {i.serialized ? <span className="font-mono">{i.identifier}</span> : `${i.sku} · ${i.outstanding} in transit`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {!i.serialized && row.action ? (
                    <input
                      type="number"
                      min={1}
                      max={i.outstanding}
                      className={`${inputClass} w-20 text-right`}
                      value={row.quantity}
                      onChange={(e) => {
                        const quantity = Math.max(1, Math.min(i.outstanding, Math.floor(Number(e.target.value) || 1)));
                        setRows((all) => ({ ...all, [i.itemId]: { ...row, quantity } }));
                      }}
                      aria-label={`Quantity of ${i.label}`}
                    />
                  ) : null}
                  <select
                    className={`${selectClass} w-48`}
                    value={row.action}
                    onChange={(e) => setRows((all) => ({ ...all, [i.itemId]: { ...row, action: e.target.value as Action } }))}
                    aria-label={`What happened to ${i.label}`}
                  >
                    <option value="">Still in transit</option>
                    <option value="LOST">Lost (write off)</option>
                    <option value="RETURN">Return to {fromOutlet}</option>
                  </select>
                </span>
              </li>
            );
          })}
        </ul>
        <Field label="Note (optional)" hint="e.g. police report no., courier claim, who checked">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex justify-end">
          <Button variant="danger" onClick={submit} loading={busy} disabled={chosen.length === 0}>
            Settle {chosen.length > 0 ? `${count("LOST") + count("RETURN")} item(s)` : "items"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
