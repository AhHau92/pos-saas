/**
 * Unit tests for pure domain logic. Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocatePayments, lineTax, priceLines, refundAmountForLine } from "../src/modules/sales/pricing";
import { isValidImei, luhnValid, parseUnitLine, parseUnitLines } from "../src/modules/inventory/imei";
import { canTransition, UNIT_STATUSES } from "../src/modules/inventory/unit-state";
import { suggestSku, variantLabel } from "../src/modules/products/sku";
import { parseMoneyToCents } from "../src/lib/money";
import { parseDateInput, startOfDay, timeZoneOffsetMinutes, yearInTimeZone } from "../src/lib/time";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { signToken, verifyToken, type TenantSessionPayload } from "../src/lib/auth/session";
import { can } from "../src/lib/auth/permissions";
import { demoImei } from "../scripts/lib/demo-imei";

test("GST 9% inclusive: tax is contained in the price", () => {
  assert.equal(lineTax(109000, 900, true), 9000); // $1090 incl. → $90 GST
  assert.equal(lineTax(100000, 900, false), 9000); // $1000 excl. → +$90
  assert.equal(lineTax(5000, 0, true), 0);
});

test("priceLines: discounts, inclusive tax and totals", () => {
  const totals = priceLines(
    [
      { quantity: 1, unitPriceCents: 159900, discountCents: 10000 }, // phone 1599 - 100
      { quantity: 2, unitPriceCents: 2990, discountCents: 0 }, // 2 cases @ 29.90
    ],
    900,
    true,
  );
  assert.equal(totals.subtotalCents, 149900 + 5980);
  assert.equal(totals.totalCents, 155880);
  assert.equal(totals.discountCents, 10000);
  assert.equal(totals.taxCents, lineTax(149900, 900, true) + lineTax(5980, 900, true));
});

test("priceLines: exclusive tax is added on top", () => {
  const totals = priceLines([{ quantity: 1, unitPriceCents: 10000, discountCents: 0 }], 900, false);
  assert.equal(totals.taxCents, 900);
  assert.equal(totals.totalCents, 10900);
});

test("priceLines rejects bad input", () => {
  assert.throws(() => priceLines([{ quantity: 0, unitPriceCents: 100, discountCents: 0 }], 900, true));
  assert.throws(() => priceLines([{ quantity: 1, unitPriceCents: 100, discountCents: 101 }], 900, true));
});

test("allocatePayments: cash change", () => {
  const r = allocatePayments(155880, [
    { paymentMethodId: "nets", methodName: "NETS", isCash: false, amountCents: 100000 },
    { paymentMethodId: "cash", methodName: "Cash", isCash: true, amountCents: 60000 },
  ]);
  assert.equal(r.changeCents, 4120);
  assert.equal(r.paidCents, 160000);
  assert.equal(r.payments.reduce((s, p) => s + p.amountCents, 0), 155880);
  assert.equal(r.payments[1].tenderedCents, 60000);
  assert.equal(r.payments[1].amountCents, 55880);
});

test("allocatePayments: non-cash overpay and short payment are rejected", () => {
  assert.throws(() =>
    allocatePayments(1000, [{ paymentMethodId: "card", methodName: "Card", isCash: false, amountCents: 1200 }]),
  );
  assert.throws(() =>
    allocatePayments(1000, [{ paymentMethodId: "cash", methodName: "Cash", isCash: true, amountCents: 900 }]),
  );
});

test("refundAmountForLine: proportional, last refund takes remainder", () => {
  const line = { quantity: 3, totalCents: 1000, refundedQuantity: 0, refundedCents: 0 };
  const first = refundAmountForLine(line, 1);
  assert.equal(first, 333);
  const second = refundAmountForLine({ ...line, refundedQuantity: 1, refundedCents: first }, 2);
  assert.equal(first + second, 1000);
  assert.throws(() => refundAmountForLine({ ...line, refundedQuantity: 3, refundedCents: 1000 }, 1));
});

test("IMEI validation (Luhn)", () => {
  assert.equal(luhnValid("490154203237518"), true);
  assert.equal(isValidImei("490154203237518"), true);
  assert.equal(isValidImei("490154203237519"), false);
  assert.equal(isValidImei("49015420323751"), false);
});

test("demo IMEIs are valid and unique", () => {
  const set = new Set<string>();
  for (let i = 1; i <= 1000; i++) {
    const imei = demoImei(i);
    assert.equal(isValidImei(imei), true, imei);
    set.add(imei);
  }
  assert.equal(set.size, 1000);
});

test("parseUnitLine: IMEI, grade, battery, serial", () => {
  assert.deepEqual(parseUnitLine("490154203237518"), {
    imei: "490154203237518",
    serialNumber: null,
    grade: null,
    batteryHealth: null,
  });
  assert.deepEqual(parseUnitLine("49015420 3237518, a, 87%"), {
    imei: "490154203237518",
    serialNumber: null,
    grade: "A",
    batteryHealth: 87,
  });
  assert.equal(parseUnitLine("c02xk1jhjg5j").serialNumber, "C02XK1JHJG5J");
  assert.throws(() => parseUnitLine("490154203237519"));
});

test("parseUnitLines: duplicates and errors are reported", () => {
  const { units, errors } = parseUnitLines("490154203237518\n490154203237518\nbad!\n\nC02XK1JHJG5J");
  assert.equal(units.length, 2);
  assert.equal(errors.length, 2);
});

test("unit state machine", () => {
  assert.equal(canTransition("IN_STOCK", "SOLD"), true);
  assert.equal(canTransition("IN_TRANSIT", "SOLD"), false);
  assert.equal(canTransition("SOLD", "IN_STOCK"), true);
  assert.equal(canTransition("SOLD", "IN_TRANSIT"), false);
  assert.equal(canTransition("WRITTEN_OFF", "SOLD"), false);
  for (const s of UNIT_STATUSES) assert.equal(canTransition(s, s), false);
});

test("SKU suggestion and labels", () => {
  assert.equal(
    suggestSku({ brand: "Apple", name: "iPhone 16 Pro", storage: "256GB", color: "Black Titanium", condition: "NEW" }),
    "APPLE-IPHONE16PRO-256GB-BLAC-NEW",
  );
  assert.equal(
    suggestSku({ brand: "Samsung", name: "Samsung Galaxy S25", storage: "256GB", color: "Navy", condition: "USED" }),
    "SAMSU-GALAXYS25-256GB-NAVY-USED",
  );
  assert.equal(
    variantLabel("Galaxy S25", { ram: "12GB", storage: "256GB", color: "Navy", condition: "USED" }),
    "Galaxy S25 12GB/256GB Navy (Used)",
  );
});

test("money parsing", () => {
  assert.equal(parseMoneyToCents("1,299.5"), 129950);
  assert.equal(parseMoneyToCents("0.29"), 29);
  assert.equal(parseMoneyToCents("12.345"), null);
  assert.equal(parseMoneyToCents("abc"), null);
});

test("business timezone (Singapore)", () => {
  const instant = new Date("2026-11-10T17:30:00Z"); // 01:30 on 11 Nov in Singapore
  assert.equal(timeZoneOffsetMinutes(instant, "Asia/Singapore"), 480);
  assert.equal(startOfDay(instant, "Asia/Singapore").toISOString(), "2026-11-10T16:00:00.000Z");
  assert.equal(yearInTimeZone(new Date("2026-12-31T17:00:00Z"), "Asia/Singapore"), 2027);
  assert.equal(parseDateInput("2026-11-11", "Asia/Singapore")?.toISOString(), "2026-11-10T16:00:00.000Z");
});

test("password hashing", async () => {
  const hash = await hashPassword("s3cret-pass");
  assert.equal(await verifyPassword("s3cret-pass", hash), true);
  assert.equal(await verifyPassword("wrong-pass", hash), false);
});

test("session tokens are signed and expire", () => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
  const payload: TenantSessionPayload = { k: "t", t: "demo", u: "user1", exp: Math.floor(Date.now() / 1000) + 60 };
  const token = signToken(payload);
  assert.deepEqual(verifyToken<TenantSessionPayload>(token), payload);
  assert.equal(verifyToken(token.slice(0, -2) + "xx"), null);
  const expired = signToken({ ...payload, exp: Math.floor(Date.now() / 1000) - 1 });
  assert.equal(verifyToken(expired), null);
});

test("permissions", () => {
  assert.equal(can("CASHIER", "pos.sell"), true);
  assert.equal(can("CASHIER", "sales.refund"), false);
  assert.equal(can("MANAGER", "inventory.adjust"), true);
  assert.equal(can("MANAGER", "users.manage"), false);
  assert.equal(can("OWNER", "settings.manage"), true);
});
