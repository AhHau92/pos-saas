"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { VariantPicker } from "@/components/variant-picker";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass } from "@/components/ui/form";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { ADJUSTMENT_REASON_OPTIONS, parseUnitLines, UNIT_STATUS_LABELS, type UnitStatus } from "@/modules/inventory/client";
import type { VariantSearchResult } from "@/modules/products/client";

type Kind = "STOCK_IN" | "STOCK_OUT" | "UNIT_STATUS";
type Action = "MARK_DEFECTIVE" | "WRITE_OFF" | "RESTORE";

type UnitInfo = {
  id: string;
  imei: string | null;
  serialNumber: string | null;
  status: UnitStatus;
  outletCode: string;
  label: string;
};

const ACTIONS: { value: Action; label: string; from: UnitStatus[]; reason: string }[] = [
  { value: "MARK_DEFECTIVE", label: "Mark as defective", from: ["IN_STOCK"], reason: "DAMAGED" },
  { value: "WRITE_OFF", label: "Write off (lost / scrapped)", from: ["IN_STOCK", "DEFECTIVE"], reason: "LOST" },
  { value: "RESTORE", label: "Restore to stock (repaired / found)", from: ["DEFECTIVE", "WRITTEN_OFF"], reason: "REPAIRED" },
];

export function AdjustmentForm({
  outlets,
  defaultOutletId,
  currency,
}: {
  outlets: { id: string; code: string; name: string }[];
  defaultOutletId: string;
  currency: string;
}) {
  const [kind, setKind] = useState<Kind>("STOCK_IN");
  const [outletId, setOutletId] = useState(defaultOutletId);
  const [reason, setReason] = useState("OPENING_STOCK");
  const [note, setNote] = useState("");
  const [variant, setVariant] = useState<VariantSearchResult | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitCostCents, setUnitCostCents] = useState(0);
  const [unitText, setUnitText] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [unit, setUnit] = useState<UnitInfo | null>(null);
  const [action, setAction] = useState<Action>("MARK_DEFECTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const parsed = useMemo(() => parseUnitLines(unitText), [unitText]);
  const serialized = variant?.productType === "SERIALIZED";

  function switchKind(next: Kind) {
    setKind(next);
    setVariant(null);
    setUnit(null);
    setError(null);
    setSuccess(null);
    setReason(next === "STOCK_IN" ? "OPENING_STOCK" : next === "STOCK_OUT" ? "DAMAGED" : "DAMAGED");
  }

  function chooseVariant(v: VariantSearchResult) {
    setVariant(v);
    setUnitCostCents(v.costCents);
    setQuantity(1);
    setUnitText("");
  }

  async function lookupUnit() {
    setError(null);
    setUnit(null);
    if (!identifier.trim()) return;
    try {
      const found = await apiRequest<UnitInfo>(`/api/inventory/units/lookup?identifier=${encodeURIComponent(identifier.trim())}`);
      setUnit(found);
      const firstAllowed = ACTIONS.find((a) => a.from.includes(found.status));
      if (firstAllowed) {
        setAction(firstAllowed.value);
        setReason(firstAllowed.reason);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      let body: Record<string, unknown>;
      if (kind === "UNIT_STATUS") {
        if (!unit) throw new Error("Look up the IMEI first");
        body = { kind, reason, note: note || null, stockUnitId: unit.id, action };
      } else {
        if (!variant) throw new Error("Choose a product");
        if (kind === "STOCK_IN" && serialized) {
          if (parsed.errors.length > 0) throw new Error(parsed.errors[0]);
          if (parsed.units.length === 0) throw new Error("Scan at least one IMEI / serial number");
          body = {
            kind,
            reason,
            note: note || null,
            outletId,
            variantId: variant.variantId,
            unitCostCents,
            units: parsed.units.map((u) => ({ imei: u.imei, serialNumber: u.serialNumber, grade: u.grade, batteryHealth: u.batteryHealth })),
          };
        } else {
          body = {
            kind,
            reason,
            note: note || null,
            outletId,
            variantId: variant.variantId,
            quantity,
            unitCostCents: kind === "STOCK_IN" ? unitCostCents : undefined,
          };
        }
      }
      const result = await apiRequest<{ number: string }>("/api/inventory/adjustments", { body });
      setSuccess(`Saved as ${result.number}`);
      setVariant(null);
      setUnitText("");
      setUnit(null);
      setIdentifier("");
      setNote("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const tabs: { value: Kind; label: string }[] = [
    { value: "STOCK_IN", label: "Stock in" },
    { value: "STOCK_OUT", label: "Stock out (accessories)" },
    { value: "UNIT_STATUS", label: "IMEI status" },
  ];

  return (
    <Card className="max-w-3xl">
      <div className="flex border-b border-slate-100 px-2">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => switchKind(t.value)}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              kind === t.value ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-4 px-5 py-5">
        {error ? <Alert>{error}</Alert> : null}
        {success ? (
          <Alert tone="green">
            {success} ·{" "}
            <Link href="/inventory/movements" className="underline">
              view stock ledger
            </Link>
          </Alert>
        ) : null}

        {kind !== "UNIT_STATUS" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Outlet">
                <select className={selectClass} value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} · {o.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reason">
                <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                  {ADJUSTMENT_REASON_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Product">
              {variant ? (
                <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{variant.label}</span> <span className="text-slate-500">· {variant.sku}</span>{" "}
                    {serialized ? <Badge tone="indigo">IMEI</Badge> : null}
                  </span>
                  <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setVariant(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <VariantPicker
                  currency={currency}
                  outletId={outletId}
                  types={kind === "STOCK_OUT" ? ["NON_SERIALIZED"] : ["SERIALIZED", "NON_SERIALIZED"]}
                  onSelect={chooseVariant}
                  showCost
                />
              )}
            </Field>

            {variant && kind === "STOCK_IN" && serialized ? (
              <Field
                label={`IMEI / serial numbers (${parsed.units.length} scanned)`}
                hint="One per line. Used phones: IMEI,GRADE,BATTERY% — e.g. 356789012345678,A,87"
                error={parsed.errors[0]}
              >
                <textarea
                  className={`${inputClass} font-mono`}
                  rows={8}
                  value={unitText}
                  onChange={(e) => setUnitText(e.target.value)}
                  placeholder={"356789012345678\n356789012345679,B,85"}
                />
              </Field>
            ) : null}

            {variant && !(kind === "STOCK_IN" && serialized) ? (
              <Field label="Quantity">
                <input
                  type="number"
                  min={1}
                  className={`${inputClass} w-32`}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                />
              </Field>
            ) : null}

            {variant && kind === "STOCK_IN" ? (
              <Field label="Unit cost" hint="Used for stock value and profit reports">
                <MoneyInput className="w-40" value={unitCostCents} onChange={setUnitCostCents} ariaLabel="Unit cost" />
              </Field>
            ) : null}
          </>
        ) : (
          <>
            <Field label="IMEI / serial number">
              <div className="flex gap-2">
                <input
                  className={`${inputClass} font-mono`}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void lookupUnit();
                    }
                  }}
                  placeholder="Scan IMEI…"
                />
                <Button variant="secondary" onClick={lookupUnit}>
                  Find
                </Button>
              </div>
            </Field>
            {unit ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="font-medium">{unit.label}</div>
                <div className="text-slate-600">
                  {unit.imei ?? unit.serialNumber} · {unit.outletCode} · {UNIT_STATUS_LABELS[unit.status]}
                </div>
              </div>
            ) : null}
            {unit ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Action">
                  <select
                    className={selectClass}
                    value={action}
                    onChange={(e) => {
                      const next = ACTIONS.find((a) => a.value === e.target.value);
                      if (next) {
                        setAction(next.value);
                        setReason(next.reason);
                      }
                    }}
                  >
                    {ACTIONS.filter((a) => a.from.includes(unit.status)).map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reason">
                  <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                    {ADJUSTMENT_REASON_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}
            {unit && !ACTIONS.some((a) => a.from.includes(unit.status)) ? (
              <Alert tone="amber">No manual action is possible while the unit is {UNIT_STATUS_LABELS[unit.status].toLowerCase()}.</Alert>
            ) : null}
          </>
        )}

        <Field label="Note (optional)">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button onClick={submit} loading={busy}>
            Save adjustment
          </Button>
        </div>
      </div>
    </Card>
  );
}
