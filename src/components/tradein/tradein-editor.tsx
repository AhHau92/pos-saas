"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "@/components/ui/money-input";
import { Badge } from "@/components/ui/primitives";
import { VariantPicker } from "@/components/variant-picker";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { UNIT_GRADES } from "@/modules/inventory/client";
import {
  missingRequiredChecks,
  SELLER_ID_LABELS,
  SELLER_ID_TYPES,
  TRADE_IN_CHECKS,
  tradeInTotal,
  type SellerIdType,
  type TradeInChecklist,
  type TradeInDeviceLookup,
} from "@/modules/sales/client";

export type TradeInDevice = {
  key: string;
  variant: { variantId: string; label: string; condition: string } | null;
  identifier: string;
  lookup: TradeInDeviceLookup | null;
  grade: string;
  battery: string;
  priceCents: number;
  checklist: TradeInChecklist;
  notes: string;
};

export type TradeInDraft = {
  seller: { name: string; phone: string; idType: SellerIdType; idNumber: string; address: string };
  devices: TradeInDevice[];
  policeScreened: boolean;
  policeReference: string;
  bookingRef: string;
  notes: string;
};

export type TradeInRules = { requireSellerId: boolean; requirePoliceCheck: boolean };

let counter = 0;
export function newTradeInDevice(): TradeInDevice {
  counter += 1;
  return {
    key: `d${Date.now()}${counter}`,
    variant: null,
    identifier: "",
    lookup: null,
    grade: "",
    battery: "",
    priceCents: 0,
    checklist: {},
    notes: "",
  };
}

export function emptyTradeInDraft(seller?: { name?: string; phone?: string }): TradeInDraft {
  return {
    seller: { name: seller?.name ?? "", phone: seller?.phone ?? "", idType: "NRIC", idNumber: "", address: "" },
    devices: [newTradeInDevice()],
    policeScreened: false,
    policeReference: "",
    bookingRef: "",
    notes: "",
  };
}

/** First problem that stops the trade-in, or null. (The server checks everything again.) */
export function tradeInProblem(draft: TradeInDraft, rules: TradeInRules): string | null {
  if (!draft.seller.name.trim()) return "Enter the seller's name";
  if (rules.requireSellerId && (!draft.seller.idNumber.trim() || !draft.seller.address.trim())) {
    return "Enter the seller's ID number and address";
  }
  if (draft.devices.length === 0) return "Add at least one device";
  for (const [index, d] of draft.devices.entries()) {
    const name = `Device ${index + 1}`;
    if (!d.variant) return `${name}: choose the model`;
    if (!d.identifier.trim()) return `${name}: enter the IMEI / serial number`;
    if (d.lookup?.status === "BLOCKED") return `${name}: ${d.lookup.message}`;
    if (d.battery !== "" && Number(d.battery) > 100) return `${name}: battery health must be 0–100`;
    const missing = missingRequiredChecks(d.checklist);
    if (missing.length > 0) return `${name}: ${missing[0]}`;
  }
  if (rules.requirePoliceCheck && !draft.policeScreened) return "Screen the device(s) on the Police system and tick the box";
  return null;
}

/** Draft → API payload (tradeInInputSchema). */
export function tradeInPayload(draft: TradeInDraft) {
  return {
    seller: {
      name: draft.seller.name.trim(),
      phone: draft.seller.phone.trim() || null,
      idType: draft.seller.idNumber.trim() ? draft.seller.idType : null,
      idNumber: draft.seller.idNumber.trim() || null,
      address: draft.seller.address.trim() || null,
    },
    devices: draft.devices.map((d) => ({
      variantId: d.variant?.variantId ?? "",
      identifier: d.identifier.trim(),
      grade: d.grade || null,
      batteryHealth: d.battery === "" ? null : Number(d.battery),
      checklist: d.checklist,
      priceCents: d.priceCents,
      notes: d.notes.trim() || null,
    })),
    policeScreened: draft.policeScreened,
    policeReference: draft.policeReference.trim() || null,
    bookingRef: draft.bookingRef.trim() || null,
    notes: draft.notes.trim() || null,
  };
}

export function draftTotal(draft: TradeInDraft): number {
  return tradeInTotal(draft.devices);
}

/** Seller particulars + devices + condition checks + Police screening. Used by Trade-ins → New and the POS. */
export function TradeInEditor({
  value,
  onChange,
  currency,
  rules,
}: {
  value: TradeInDraft;
  onChange: (draft: TradeInDraft) => void;
  currency: string;
  rules: TradeInRules;
}) {
  const setSeller = (patch: Partial<TradeInDraft["seller"]>) => onChange({ ...value, seller: { ...value.seller, ...patch } });
  const setDevice = (key: string, patch: Partial<TradeInDevice>) =>
    onChange({ ...value, devices: value.devices.map((d) => (d.key === key ? { ...d, ...patch } : d)) });

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Seller</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name (as on ID)">
            <input className={inputClass} value={value.seller.name} onChange={(e) => setSeller({ name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} inputMode="tel" value={value.seller.phone} onChange={(e) => setSeller({ phone: e.target.value })} />
          </Field>
          <Field label={rules.requireSellerId ? "ID number" : "ID number (optional)"}>
            <div className="flex gap-2">
              <select
                className={`${selectClass} w-32`}
                value={value.seller.idType}
                onChange={(e) => setSeller({ idType: e.target.value as SellerIdType })}
                aria-label="ID type"
              >
                {SELLER_ID_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SELLER_ID_LABELS[t]}
                  </option>
                ))}
              </select>
              <input
                className={`${inputClass} uppercase`}
                value={value.seller.idNumber}
                autoComplete="off"
                placeholder={value.seller.idType === "NRIC" || value.seller.idType === "FIN" ? "S1234567A" : ""}
                onChange={(e) => setSeller({ idNumber: e.target.value.toUpperCase() })}
              />
            </div>
          </Field>
          <Field label={rules.requireSellerId ? "Address" : "Address (optional)"}>
            <input className={inputClass} value={value.seller.address} onChange={(e) => setSeller({ address: e.target.value })} />
          </Field>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Devices</h3>
          <span className="text-sm">
            Total <span className="font-semibold tabular-nums">{formatMoney(draftTotal(value), currency)}</span>
          </span>
        </div>
        <div className="space-y-3">
          {value.devices.map((d, index) => (
            <DeviceCard
              key={d.key}
              index={index}
              device={d}
              currency={currency}
              canRemove={value.devices.length > 1}
              onChange={(patch) => setDevice(d.key, patch)}
              onRemove={() => onChange({ ...value, devices: value.devices.filter((x) => x.key !== d.key) })}
            />
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange({ ...value, devices: [...value.devices, newTradeInDevice()] })}>
          <Icon name="plus" className="h-4 w-4" /> Add another device
        </Button>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className={`${checkboxClass} mt-0.5`}
            checked={value.policeScreened}
            onChange={(e) => onChange({ ...value, policeScreened: e.target.checked })}
          />
          <span>
            Screened on the Police secondhand goods system — no record found
            {rules.requirePoliceCheck ? <span className="text-rose-600"> *</span> : null}
            <span className="block text-xs text-slate-500">If the result is “RECORD FOUND”, do not buy the device.</span>
          </span>
        </label>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Police / transaction ref. (optional)">
            <input className={inputClass} value={value.policeReference} onChange={(e) => onChange({ ...value, policeReference: e.target.value })} />
          </Field>
          <Field label="Booking / quote no. (optional)">
            <input className={inputClass} value={value.bookingRef} onChange={(e) => onChange({ ...value, bookingRef: e.target.value })} />
          </Field>
          <Field label="Notes (optional)">
            <input className={inputClass} value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
          </Field>
        </div>
      </section>
    </div>
  );
}

function DeviceCard({
  index,
  device,
  currency,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  device: TradeInDevice;
  currency: string;
  canRemove: boolean;
  onChange: (patch: Partial<TradeInDevice>) => void;
  onRemove: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [showChecks, setShowChecks] = useState(true);
  const problems = TRADE_IN_CHECKS.filter((c) => device.checklist[c.key] === false).length;

  async function checkImei() {
    const identifier = device.identifier.trim();
    if (!identifier) return;
    setChecking(true);
    try {
      const lookup = await apiRequest<TradeInDeviceLookup>(`/api/trade-ins/lookup?identifier=${encodeURIComponent(identifier)}`);
      onChange({ lookup });
    } catch (err) {
      onChange({ lookup: { status: "BLOCKED", message: errorMessage(err) } });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Device {index + 1}</span>
        {canRemove ? (
          <button type="button" onClick={onRemove} className="text-xs text-rose-600 hover:underline">
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="IMEI / serial no.">
          <input
            className={`${inputClass} font-mono`}
            value={device.identifier}
            onChange={(e) => onChange({ identifier: e.target.value, lookup: null })}
            onBlur={() => void checkImei()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void checkImei();
              }
            }}
            placeholder="Scan, or dial *#06# on the phone"
          />
        </Field>
        <Field label="Model">
          {device.variant ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <span className="truncate">
                {device.variant.label}{" "}
                {device.variant.condition === "NEW" ? <Badge tone="amber">New variant</Badge> : <Badge>{device.variant.condition.toLowerCase()}</Badge>}
              </span>
              <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => onChange({ variant: null })}>
                Change
              </button>
            </div>
          ) : (
            <VariantPicker
              types={["SERIALIZED"]}
              currency={currency}
              placeholder="Search model, e.g. iPhone 13 128GB used"
              onSelect={(v) => onChange({ variant: { variantId: v.variantId, label: v.label, condition: v.condition } })}
            />
          )}
        </Field>
      </div>
      {checking ? <p className="mt-1 text-xs text-slate-500">Checking IMEI…</p> : null}
      {device.lookup && device.lookup.status !== "NEW" ? (
        <p className={`mt-1 text-xs ${device.lookup.status === "BLOCKED" ? "text-rose-600" : "text-indigo-700"}`}>{device.lookup.message}</p>
      ) : null}
      {device.variant?.condition === "NEW" ? (
        <p className="mt-1 text-xs text-amber-700">
          This is a NEW variant. Used phones normally go into a “Used” variant (Products → add one if it is missing).
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Field label="Grade">
          <select className={selectClass} value={device.grade} onChange={(e) => onChange({ grade: e.target.value })}>
            <option value="">—</option>
            {UNIT_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Battery %">
          <input
            className={inputClass}
            inputMode="numeric"
            value={device.battery}
            placeholder="—"
            onChange={(e) => onChange({ battery: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
          />
        </Field>
        <Field label="Trade-in price" className="md:col-span-2">
          <MoneyInput value={device.priceCents} onChange={(cents) => onChange({ priceCents: cents })} ariaLabel="Trade-in price" />
        </Field>
      </div>

      <div className="mt-3">
        <button type="button" className="text-xs font-medium text-slate-600 hover:underline" onClick={() => setShowChecks((v) => !v)}>
          Condition checks {problems > 0 ? `· ${problems} issue(s)` : ""} {showChecks ? "▲" : "▼"}
        </button>
        {showChecks ? (
          <ul className="mt-2 grid gap-1 md:grid-cols-2">
            {TRADE_IN_CHECKS.map((c) => {
              const answer = device.checklist[c.key];
              return (
                <li key={c.key} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1 text-xs">
                  <span>
                    {c.label}
                    {c.required ? <span className="text-rose-600"> *</span> : null}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => onChange({ checklist: { ...device.checklist, [c.key]: true } })}
                      className={`rounded px-2 py-0.5 ${answer === true ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
                    >
                      OK
                    </button>
                    {c.required ? null : (
                      <button
                        type="button"
                        onClick={() => onChange({ checklist: { ...device.checklist, [c.key]: false } })}
                        className={`rounded px-2 py-0.5 ${answer === false ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600"}`}
                      >
                        Issue
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <input
          className={`${inputClass} mt-2`}
          placeholder="Notes on condition (optional), e.g. small scratch on back"
          value={device.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}
