/**
 * Unit tests for pure domain logic. Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocatePayments, lineTax, priceLines, refundAmountForLine } from "../src/modules/sales/pricing";
import {
  isValidImei,
  luhnValid,
  normalizeGrade,
  parseBatteryHealth,
  parseIdentifierInput,
} from "../src/modules/inventory/imei";
import { canTransition, UNIT_STATUSES } from "../src/modules/inventory/unit-state";
import { outstandingQuantity, transferStatusAfter } from "../src/modules/transfers/transfer-status";
import { suggestSku, variantLabel } from "../src/modules/products/sku";
import { parseMoneyToCents } from "../src/lib/money";
import { parseDateInput, startOfDay, timeZoneOffsetMinutes, yearInTimeZone } from "../src/lib/time";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { signToken, verifyToken, type TenantSessionPayload } from "../src/lib/auth/session";
import { can } from "../src/lib/auth/permissions";
import { demoImei } from "../scripts/lib/demo-imei";
import { isValidEmail, normalizeEmail, whatsappLink, whatsappNumber } from "../src/lib/contact";
import {
  buildReceiptHeader,
  formatTaxRate,
  maskPhone,
  parseReceiptHeader,
  receiptText,
  type ReceiptData,
} from "../src/modules/sales/receipt";
import { escapeHtml, receiptEmailHtml, receiptEmailSubject, receiptEmailText } from "../src/modules/sales/receipt-email";

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

test("IMEI input: newline, comma and space separated lists", () => {
  // the case reported from testing: two IMEIs separated by a comma
  const commaList = parseIdentifierInput("359900000005007, 359900000005015");
  assert.deepEqual(
    commaList.identifiers.map((i) => i.imei),
    ["359900000005007", "359900000005015"],
  );
  assert.equal(commaList.errors.length, 0);

  assert.equal(parseIdentifierInput("359900000005007\n359900000005015\r\n359900000005023").identifiers.length, 3);
  assert.equal(parseIdentifierInput("359900000005007 359900000005015").identifiers.length, 2);
  assert.equal(parseIdentifierInput("359900000005007;359900000005015\t359900000005023").identifiers.length, 3);
});

test("IMEI input: spaced IMEI, glued IMEIs and serial numbers", () => {
  // an IMEI printed with spaces on the box stays one IMEI
  assert.deepEqual(parseIdentifierInput("35 990000 000500 7").identifiers, [{ imei: "359900000005007", serialNumber: null }]);
  // a scanner without Enter glues IMEIs together
  assert.equal(parseIdentifierInput("359900000005007359900000005015").identifiers.length, 2);
  assert.deepEqual(parseIdentifierInput("c02xk1jhjg5j").identifiers, [{ imei: null, serialNumber: "C02XK1JHJG5J" }]);
});

test("IMEI input: bad values and duplicates are reported, never guessed", () => {
  // the old "IMEI,GRADE,BATTERY" format is no longer read as grade/battery
  const oldFormat = parseIdentifierInput("359900000005007,A,87");
  assert.equal(oldFormat.identifiers.length, 1);
  assert.deepEqual(oldFormat.invalidTokens, ["A", "87"]);

  const bad = parseIdentifierInput("359900000005008\n35990000000500\n359900000005007\n359900000005007");
  assert.equal(bad.identifiers.length, 1);
  assert.equal(bad.errors.length, 3); // wrong check digit, 14 digits, duplicate
  assert.deepEqual(bad.invalidTokens, ["359900000005008", "35990000000500"]);
});

test("grade and battery health validation", () => {
  assert.equal(normalizeGrade("a"), "A");
  assert.equal(normalizeGrade(" b "), "B");
  assert.equal(normalizeGrade("A+"), "A+");
  assert.equal(normalizeGrade(""), null);
  assert.equal(normalizeGrade(null), null);
  assert.throws(() => normalizeGrade("35990"));
  assert.throws(() => normalizeGrade("Z"));
  assert.equal(parseBatteryHealth("87"), 87);
  assert.equal(parseBatteryHealth("87%"), 87);
  assert.equal(parseBatteryHealth(""), null);
  assert.equal(parseBatteryHealth(100), 100);
  assert.throws(() => parseBatteryHealth("101"));
  assert.throws(() => parseBatteryHealth("8.5"));
});

test("unit state machine", () => {
  assert.equal(canTransition("IN_STOCK", "SOLD"), true);
  assert.equal(canTransition("IN_TRANSIT", "SOLD"), false);
  assert.equal(canTransition("IN_TRANSIT", "IN_STOCK"), true); // received, or returned to the sender
  assert.equal(canTransition("IN_TRANSIT", "WRITTEN_OFF"), true); // lost in transit
  assert.equal(canTransition("SOLD", "IN_STOCK"), true);
  assert.equal(canTransition("SOLD", "IN_TRANSIT"), false);
  assert.equal(canTransition("WRITTEN_OFF", "SOLD"), false);
  for (const s of UNIT_STATUSES) assert.equal(canTransition(s, s), false);
});

test("transfer status: partial receipt, losses and returns", () => {
  const item = (quantity: number, received = 0, lost = 0, returned = 0) => ({
    quantity,
    receivedQuantity: received,
    lostQuantity: lost,
    returnedQuantity: returned,
  });
  assert.equal(outstandingQuantity(item(10, 6, 1, 2)), 1);
  assert.equal(transferStatusAfter([item(1), item(10)]), "IN_TRANSIT");
  assert.equal(transferStatusAfter([item(1, 1), item(10, 4)]), "PARTIALLY_RECEIVED");
  assert.equal(transferStatusAfter([item(1, 1), item(10, 10)]), "RECEIVED");
  assert.equal(transferStatusAfter([item(1, 0, 1), item(10, 10)]), "CLOSED"); // one phone lost
  assert.equal(transferStatusAfter([item(1, 1), item(10, 8, 0, 2)]), "CLOSED"); // 2 cases went back
  assert.equal(transferStatusAfter([item(1, 0, 0, 1), item(10, 0, 0, 10)]), "CANCELLED"); // nothing left the shop
  assert.equal(transferStatusAfter([item(1, 0, 1), item(10)]), "IN_TRANSIT"); // lost one, rest still on the way
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

// ───────────── receipts, e-receipt email, WhatsApp ─────────────

function sampleReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  const header = buildReceiptHeader({
    profile: {
      name: "Mobile Relation <Pte Ltd>",
      registrationNo: "201912345K",
      taxRegistrationNo: "M90312345A",
      address: "1 Orchard Road",
      phone: "6000 0000",
      email: "shop@example.com",
      receiptFooter: "7-day exchange\nWarranty by manufacturer",
    },
    outlet: { code: "ORC", name: "Orchard", address: "Orchard Road #01-01", phone: "6000 0001" },
    cashierName: "Cathy",
  });
  return {
    saleId: "s1",
    number: "ORC-2026-000123",
    createdAt: "2026-11-20T07:30:00.000Z",
    status: "COMPLETED",
    header,
    headerSnapshot: true,
    currency: "SGD",
    taxName: "GST",
    taxRateBps: 900,
    taxInclusive: true,
    customer: { name: "Jason", phone: "+6591234567", email: "jason@example.com" },
    items: [
      { description: "iPhone 16 Pro 256GB Black", imei: "359900000005007", quantity: 1, unitPriceCents: 174900, discountCents: 5000, totalCents: 169900 },
      { description: "Screen protector", imei: null, quantity: 2, unitPriceCents: 2500, discountCents: 0, totalCents: 5000 },
    ],
    subtotalCents: 174900,
    discountCents: 5000,
    taxCents: 14441,
    totalCents: 174900,
    changeCents: 100,
    refundedCents: 0,
    payments: [{ methodName: "NETS", amountCents: 174900, tenderedCents: null }],
    printCount: 0,
    ...overrides,
  };
}

test("receipt header snapshot: stored JSON round-trips, old sales have none", () => {
  const header = sampleReceipt().header;
  assert.deepEqual(parseReceiptHeader(JSON.parse(JSON.stringify(header))), header);
  assert.equal(parseReceiptHeader(null), null);
  assert.equal(parseReceiptHeader({}), null);
  assert.equal(parseReceiptHeader("x"), null);
  assert.equal(formatTaxRate(900), "9");
  assert.equal(formatTaxRate(850), "8.5");
  assert.equal(maskPhone("+65 9123 4567"), "••••4567");
});

test("WhatsApp receipt text and link", () => {
  const link = "https://pos.example.com/r/demo/abc";
  const text = receiptText(sampleReceipt(), { link });
  assert.match(text, /ORC-2026-000123/);
  assert.match(text, /IMEI\/SN: 359900000005007/);
  assert.match(text, /Total: \$1,749\.00/);
  assert.ok(text.includes(link));
  assert.equal(whatsappNumber("9123 4567"), "6591234567");
  assert.equal(whatsappNumber("+65 9123 4567"), "6591234567");
  assert.equal(whatsappNumber("0065 9123 4567"), "6591234567");
  assert.equal(whatsappNumber("+60 12-345 6789", "65"), "60123456789");
  assert.equal(whatsappNumber("123"), null);
  assert.equal(whatsappNumber(null), null);
  assert.equal(whatsappLink("Hi & bye", "6591234567"), "https://wa.me/6591234567?text=Hi%20%26%20bye");
  assert.equal(whatsappLink("Hi", null), "https://wa.me/?text=Hi");
});

test("e-receipt email: escaped HTML, IMEI, totals, link", () => {
  const receipt = sampleReceipt();
  const html = receiptEmailHtml(receipt, { link: "https://pos.example.com/r/demo/abc?x=1&y=2" });
  assert.ok(html.includes("Mobile Relation &lt;Pte Ltd&gt;"));
  assert.ok(!html.includes("<Pte Ltd>"));
  assert.ok(html.includes("359900000005007"));
  assert.ok(html.includes("$1,749.00"));
  assert.ok(html.includes("GST Reg No: M90312345A"));
  assert.ok(html.includes("https://pos.example.com/r/demo/abc?x=1&amp;y=2"));
  assert.ok(html.includes("7-day exchange<br>Warranty by manufacturer"));
  assert.ok(html.includes("••••4567"));
  assert.ok(!html.includes("91234567"));
  assert.equal(receiptEmailSubject(receipt), "Your tax invoice from Mobile Relation <Pte Ltd> — ORC-2026-000123");
  const text = receiptEmailText(receipt);
  assert.match(text, /TOTAL: \$1,749\.00/);
  assert.match(text, /Incl\. GST 9%: \$144\.41/);
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("email address helpers", () => {
  assert.equal(isValidEmail("jason@example.com"), true);
  assert.equal(isValidEmail("gene@mobilerelation.com.sg"), true);
  assert.equal(isValidEmail("jason@example"), false);
  assert.equal(isValidEmail("jason example.com"), false);
  assert.equal(normalizeEmail("  Jason@Example.COM "), "Jason@example.com");
});
