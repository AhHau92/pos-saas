"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert, Badge } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import type { AvailableUnit } from "@/modules/inventory/client";
import type { ProductTypeValue, VariantSearchResult } from "@/modules/products/client";
import { priceLines, type CustomerDTO, type PosLookupResult, type PosUnit } from "@/modules/sales/client";

type PaymentMethodOption = { id: string; name: string; isCash: boolean };

type Props = {
  currency: string;
  taxName: string;
  taxRateBps: number;
  taxInclusive: boolean;
  outletLabel: string;
  paymentMethods: PaymentMethodOption[];
};

type CartLine = {
  key: string;
  variantId: string;
  stockUnitId: string | null;
  identifier: string | null;
  label: string;
  sku: string;
  productType: ProductTypeValue;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  /** on-hand limit for quantity items */
  maxQuantity: number | null;
};

type PaymentLine = {
  key: string;
  paymentMethodId: string;
  name: string;
  isCash: boolean;
  amount: string;
  reference: string;
};

type CustomerState = { id: string | null; name: string; phone: string };
type Notice = { tone: "red" | "amber" | "green"; text: string } | null;

let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

export function PosTerminal({ currency, taxName, taxRateBps, taxInclusive, outletLabel, paymentMethods }: Props) {
  const money = (cents: number) => formatMoney(cents, currency);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const latestQuery = useRef("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [customer, setCustomer] = useState<CustomerState>({ id: null, name: "", phone: "" });
  const [customerMatches, setCustomerMatches] = useState<CustomerDTO[]>([]);
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<{ variant: VariantSearchResult; units: AvailableUnit[]; loading: boolean; filter: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<{ id: string; number: string; changeCents: number } | null>(null);

  const focusSearch = () => window.setTimeout(() => searchRef.current?.focus(), 0);

  // ── live search while typing (names / SKUs) ──
  useEffect(() => {
    latestQuery.current = query;
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const found = await apiRequest<VariantSearchResult[]>(`/api/variants/search?q=${encodeURIComponent(text)}&take=12`);
        if (latestQuery.current.trim() === text) setResults(found);
      } catch {
        // ignore typeahead errors
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  // ── customer lookup by phone / name ──
  useEffect(() => {
    const text = (customer.phone || customer.name).trim();
    if (customer.id || text.length < 3) {
      setCustomerMatches([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setCustomerMatches(await apiRequest<CustomerDTO[]>(`/api/customers?q=${encodeURIComponent(text)}`));
      } catch {
        setCustomerMatches([]);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [customer.phone, customer.name, customer.id]);

  // ── totals (same pricing code as the server) ──
  const pricing = useMemo(() => {
    try {
      return {
        totals: priceLines(
          cart.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents, discountCents: l.discountCents })),
          taxRateBps,
          taxInclusive,
        ),
        error: null as string | null,
      };
    } catch (error) {
      return { totals: null, error: errorMessage(error) };
    }
  }, [cart, taxRateBps, taxInclusive]);

  const totalCents = pricing.totals?.totalCents ?? 0;
  const paymentCents = payments.map((p) => parseMoneyToCents(p.amount));
  const paidCents = paymentCents.reduce<number>((s, c) => s + (c ?? 0), 0);
  const nonCashCents = payments.reduce((s, p, i) => s + (p.isCash ? 0 : (paymentCents[i] ?? 0)), 0);
  const cashCents = paidCents - nonCashCents;
  const remainingCents = Math.max(0, totalCents - paidCents);
  const changeCents = Math.max(0, paidCents - totalCents);

  let paymentError: string | null = null;
  if (paymentCents.some((c) => c === null || c <= 0)) paymentError = "Enter a valid amount for every payment";
  else if (nonCashCents > totalCents) paymentError = "Card / e-wallet payments are more than the total";
  else if (changeCents > 0 && changeCents >= cashCents) paymentError = "Remove the extra cash payment";

  const canComplete =
    cart.length > 0 && !pricing.error && !paymentError && paidCents >= totalCents && !submitting && (totalCents > 0 || payments.length === 0);

  // ── adding items ──
  function addUnit(unit: Pick<PosUnit, "stockUnitId" | "variantId" | "sku" | "label" | "imei" | "serialNumber" | "priceCents">) {
    if (cart.some((l) => l.stockUnitId === unit.stockUnitId)) {
      setNotice({ tone: "amber", text: `${unit.imei ?? unit.serialNumber} is already in the cart` });
      return;
    }
    setCart((c) => [
      ...c,
      {
        key: nextKey(),
        variantId: unit.variantId,
        stockUnitId: unit.stockUnitId,
        identifier: unit.imei ?? unit.serialNumber,
        label: unit.label,
        sku: unit.sku,
        productType: "SERIALIZED",
        quantity: 1,
        unitPriceCents: unit.priceCents,
        discountCents: 0,
        maxQuantity: 1,
      },
    ]);
    setNotice(null);
  }

  async function openPicker(variant: VariantSearchResult) {
    setPicker({ variant, units: [], loading: true, filter: "" });
    try {
      const units = await apiRequest<AvailableUnit[]>(`/api/inventory/units/available?variantId=${encodeURIComponent(variant.variantId)}`);
      const inCart = new Set(cart.map((l) => l.stockUnitId));
      setPicker({ variant, units: units.filter((u) => !inCart.has(u.id)), loading: false, filter: "" });
    } catch (error) {
      setPicker(null);
      setNotice({ tone: "red", text: errorMessage(error) });
    }
  }

  async function addVariant(variant: VariantSearchResult) {
    if (variant.productType === "SERIALIZED") {
      await openPicker(variant);
      return;
    }
    const existing = cart.find((l) => l.variantId === variant.variantId && !l.stockUnitId);
    const limit = variant.productType === "NON_SERIALIZED" ? (variant.onHand ?? 0) : null;
    if (limit !== null && (existing ? existing.quantity : 0) >= limit) {
      setNotice({ tone: "red", text: `${variant.label}: only ${limit} in stock at this outlet` });
      return;
    }
    if (existing) {
      setCart((c) => c.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l)));
    } else {
      setCart((c) => [
        ...c,
        {
          key: nextKey(),
          variantId: variant.variantId,
          stockUnitId: null,
          identifier: null,
          label: variant.label,
          sku: variant.sku,
          productType: variant.productType,
          quantity: 1,
          unitPriceCents: variant.priceCents,
          discountCents: 0,
          maxQuantity: limit,
        },
      ]);
    }
    setNotice(null);
  }

  async function onSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    setNotice(null);
    try {
      const result = await apiRequest<PosLookupResult>(`/api/pos/lookup?q=${encodeURIComponent(text)}`);
      if (result.kind === "unit") {
        if (result.unit.available) {
          addUnit(result.unit);
          setQuery("");
          setResults([]);
        } else {
          setNotice({ tone: "red", text: `${result.unit.imei ?? result.unit.serialNumber}: ${result.unit.message}` });
        }
      } else if (result.kind === "variants") {
        const exact = result.variants.find((v) => v.sku.toUpperCase() === text.toUpperCase() || v.barcode === text);
        if (exact) {
          await addVariant(exact);
          setQuery("");
          setResults([]);
        } else {
          setResults(result.variants);
        }
      } else {
        setResults([]);
        setNotice({ tone: "amber", text: result.message });
      }
    } catch (error) {
      setNotice({ tone: "red", text: errorMessage(error) });
    } finally {
      setSearching(false);
      focusSearch();
    }
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addPayment(method: PaymentMethodOption) {
    const due = Math.max(0, totalCents - paidCents);
    setPayments((p) => [
      ...p,
      { key: nextKey(), paymentMethodId: method.id, name: method.name, isCash: method.isCash, amount: centsToInput(due), reference: "" },
    ]);
  }

  async function completeSale() {
    if (!canComplete) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const hasCustomer = Boolean(customer.id || customer.phone.trim() || customer.name.trim());
      const sale = await apiRequest<{ id: string; number: string }>("/api/sales", {
        body: {
          lines: cart.map((l) => ({
            variantId: l.variantId,
            stockUnitId: l.stockUnitId,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            discountCents: l.discountCents,
          })),
          payments: payments.map((p, i) => ({
            paymentMethodId: p.paymentMethodId,
            amountCents: paymentCents[i] ?? 0,
            reference: p.reference.trim() || null,
          })),
          customer: hasCustomer
            ? { id: customer.id, name: customer.name.trim() || null, phone: customer.phone.trim() || null }
            : null,
          notes: notes.trim() || null,
        },
      });
      setCompleted({ id: sale.id, number: sale.number, changeCents });
    } catch (error) {
      setNotice({ tone: "red", text: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  function newSale() {
    setCart([]);
    setPayments([]);
    setCustomer({ id: null, name: "", phone: "" });
    setNotes("");
    setResults([]);
    setQuery("");
    setNotice(null);
    setCompleted(null);
    focusSearch();
  }

  const filteredUnits =
    picker?.units.filter((u) => {
      const f = picker.filter.trim().toUpperCase();
      return !f || (u.imei ?? "").includes(f) || (u.serialNumber ?? "").includes(f);
    }) ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      {/* ───────── left: search + cart ───────── */}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <form onSubmit={onSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan IMEI / barcode, or search product name / SKU…"
                className={`${inputClass} py-3 pl-9 text-base`}
              />
            </div>
            <Button type="submit" size="lg" loading={searching}>
              Add
            </Button>
          </form>
          {notice ? (
            <div className="mt-3">
              <Alert tone={notice.tone}>{notice.text}</Alert>
            </div>
          ) : null}
          {results.length > 0 ? (
            <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {results.map((v) => (
                <li key={v.variantId}>
                  <button
                    type="button"
                    onClick={async () => {
                      await addVariant(v);
                      setQuery("");
                      setResults([]);
                      focusSearch();
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-indigo-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{v.label}</div>
                      <div className="text-xs text-slate-500">
                        {v.sku}
                        {v.productType === "SERIALIZED" ? " · IMEI" : v.productType === "SERVICE" ? " · Service" : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums">{money(v.priceCents)}</div>
                      {v.onHand !== null ? (
                        <div className={`text-xs ${v.onHand > 0 ? "text-emerald-600" : "text-rose-600"}`}>{v.onHand} in stock</div>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold">Cart · {outletLabel}</h2>
            {cart.length > 0 ? (
              <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => setCart([])}>
                Clear
              </button>
            ) : null}
          </div>
          {cart.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-slate-500">Scan an IMEI or search for a product to start.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cart.map((line, index) => {
                const priced = pricing.totals?.lines[index];
                return (
                  <li key={line.key} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                    <div className="col-span-12 min-w-0 md:col-span-5">
                      <div className="truncate text-sm font-medium text-slate-900">{line.label}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{line.sku}</span>
                        {line.identifier ? <Badge tone="indigo">{line.identifier}</Badge> : null}
                      </div>
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      {line.stockUnitId ? (
                        <div className="text-center text-sm text-slate-500">1</div>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={line.maxQuantity ?? undefined}
                          value={line.quantity}
                          onChange={(e) => {
                            const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                            updateLine(line.key, { quantity: line.maxQuantity !== null ? Math.min(n, line.maxQuantity) : n });
                          }}
                          className={`${inputClass} text-center`}
                          aria-label="Quantity"
                        />
                      )}
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <MoneyInput value={line.unitPriceCents} onChange={(c) => updateLine(line.key, { unitPriceCents: c })} ariaLabel="Unit price" />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <MoneyInput value={line.discountCents} onChange={(c) => updateLine(line.key, { discountCents: c })} ariaLabel="Discount" />
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2 md:col-span-1">
                      <button
                        type="button"
                        onClick={() => setCart((c) => c.filter((l) => l.key !== line.key))}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remove"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="col-span-12 -mt-1 text-right text-xs text-slate-500">
                      Line total: <span className="font-medium text-slate-800">{priced ? money(priced.totalCents) : "—"}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {cart.length > 0 ? (
            <div className="border-t border-slate-100 px-4 py-2 text-[11px] uppercase tracking-wide text-slate-400">
              Columns: qty · unit price · discount
            </div>
          ) : null}
        </div>
      </div>

      {/* ───────── right: customer, totals, payment ───────── */}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="mb-2 text-sm font-semibold">Customer (optional)</h2>
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              placeholder="Phone"
              value={customer.phone}
              onChange={(e) => setCustomer({ ...customer, id: null, phone: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Name"
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, id: null, name: e.target.value })}
            />
          </div>
          {customer.id ? <p className="mt-1 text-xs text-emerald-600">Existing customer selected</p> : null}
          {customerMatches.length > 0 ? (
            <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
              {customerMatches.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-slate-50"
                    onClick={() => {
                      setCustomer({ id: c.id, name: c.name, phone: c.phone ?? "" });
                      setCustomerMatches([]);
                    }}
                  >
                    <span>{c.name}</span>
                    <span className="text-slate-500">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{money(pricing.totals?.subtotalCents ?? 0)}</dd>
            </div>
            {pricing.totals && pricing.totals.discountCents > 0 ? (
              <div className="flex justify-between text-slate-600">
                <dt>Discount</dt>
                <dd className="tabular-nums">−{money(pricing.totals.discountCents)}</dd>
              </div>
            ) : null}
            {taxRateBps > 0 ? (
              <div className="flex justify-between text-slate-600">
                <dt>
                  {taxInclusive ? "Incl. " : ""}
                  {taxName} {(taxRateBps / 100).toFixed(taxRateBps % 100 === 0 ? 0 : 2)}%
                </dt>
                <dd className="tabular-nums">{money(pricing.totals?.taxCents ?? 0)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-semibold text-slate-900">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(totalCents)}</dd>
            </div>
          </dl>
          {pricing.error ? (
            <div className="mt-2">
              <Alert>{pricing.error}</Alert>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="mb-2 text-sm font-semibold">Payment</h2>
          <div className="grid grid-cols-2 gap-2">
            {paymentMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={cart.length === 0}
                onClick={() => addPayment(m)}
                className="rounded-md border border-slate-200 px-2 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-40"
              >
                {m.name}
              </button>
            ))}
          </div>
          {payments.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {payments.map((p) => (
                <li key={p.key} className="rounded-md bg-slate-50 p-2">
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>{p.name}</span>
                    <button
                      type="button"
                      onClick={() => setPayments((list) => list.filter((x) => x.key !== p.key))}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label="Remove payment"
                    >
                      <Icon name="x" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      inputMode="decimal"
                      className={`${inputClass} text-right tabular-nums`}
                      value={p.amount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setPayments((list) => list.map((x) => (x.key === p.key ? { ...x, amount: e.target.value } : x)))
                      }
                      aria-label={`${p.name} amount`}
                    />
                    {!p.isCash ? (
                      <input
                        className={inputClass}
                        placeholder="Ref / approval"
                        value={p.reference}
                        onChange={(e) =>
                          setPayments((list) => list.map((x) => (x.key === p.key ? { ...x, reference: e.target.value } : x)))
                        }
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Paid</dt>
              <dd className="tabular-nums">{money(paidCents)}</dd>
            </div>
            {remainingCents > 0 ? (
              <div className="flex justify-between font-medium text-rose-600">
                <dt>Remaining</dt>
                <dd className="tabular-nums">{money(remainingCents)}</dd>
              </div>
            ) : null}
            {changeCents > 0 ? (
              <div className="flex justify-between text-base font-semibold text-emerald-700">
                <dt>Change</dt>
                <dd className="tabular-nums">{money(changeCents)}</dd>
              </div>
            ) : null}
          </dl>
          {paymentError && payments.length > 0 ? (
            <div className="mt-2">
              <Alert tone="amber">{paymentError}</Alert>
            </div>
          ) : null}

          <textarea
            className={`${inputClass} mt-3`}
            rows={2}
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button size="lg" variant="success" className="mt-3 w-full" disabled={!canComplete} loading={submitting} onClick={completeSale}>
            <Icon name="check" className="h-5 w-5" /> Complete sale · {money(totalCents)}
          </Button>
        </div>
      </div>

      {/* IMEI picker */}
      <Modal open={picker !== null} title={picker ? `Choose unit · ${picker.variant.label}` : ""} onClose={() => setPicker(null)} size="lg">
        {picker?.loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
        ) : picker && picker.units.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No units in stock at this outlet.</p>
        ) : picker ? (
          <div className="space-y-3">
            <input
              autoFocus
              className={inputClass}
              placeholder="Filter by IMEI / serial…"
              value={picker.filter}
              onChange={(e) => setPicker({ ...picker, filter: e.target.value })}
            />
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {filteredUnits.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-indigo-50"
                    onClick={() => {
                      addUnit({
                        stockUnitId: u.id,
                        variantId: picker.variant.variantId,
                        sku: picker.variant.sku,
                        label: picker.variant.label,
                        imei: u.imei,
                        serialNumber: u.serialNumber,
                        priceCents: u.priceCents,
                      });
                      setPicker(null);
                      focusSearch();
                    }}
                  >
                    <div>
                      <div className="font-mono text-sm">{u.imei ?? u.serialNumber}</div>
                      <div className="text-xs text-slate-500">
                        {[u.grade ? `Grade ${u.grade}` : null, u.batteryHealth !== null ? `Battery ${u.batteryHealth}%` : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">{money(u.priceCents)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      {/* Sale completed */}
      <Modal
        open={completed !== null}
        title="Sale completed"
        onClose={newSale}
        footer={
          <>
            <Button variant="secondary" onClick={() => completed && window.open(`/receipt/${completed.id}?print=1`, "_blank")}>
              <Icon name="printer" className="h-4 w-4" /> Print receipt
            </Button>
            <Button onClick={newSale}>New sale</Button>
          </>
        }
      >
        {completed ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Icon name="check" className="h-6 w-6" />
            </div>
            <p className="text-sm text-slate-500">Receipt</p>
            <p className="text-lg font-semibold">{completed.number}</p>
            {completed.changeCents > 0 ? (
              <p className="mt-3 text-2xl font-bold text-emerald-700">Change {money(completed.changeCents)}</p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
