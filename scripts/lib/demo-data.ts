/**
 * Demo data for the "demo" tenant. Everything is created through the module services,
 * so stock levels, ledger and IMEI history are consistent — exactly like real usage.
 */
import type { TenantDb } from "@/lib/db/tenant";
import type { ServiceContext } from "@/lib/service-context";
import { createAdjustment } from "@/modules/inventory";
import { createOutlet } from "@/modules/outlets";
import { createProduct } from "@/modules/products";
import { createPurchaseOrder, createSupplier, receivePurchaseOrder } from "@/modules/purchasing";
import { checkout, listPaymentMethods, refundSale } from "@/modules/sales";
import { createTransfer, receiveTransfer } from "@/modules/transfers";
import { createUser } from "@/modules/users";
import { demoImei } from "./demo-imei";

async function variantIdBySku(db: TenantDb, sku: string): Promise<string> {
  const v = await db.productVariant.findUnique({ where: { sku } });
  if (!v) throw new Error(`Demo SKU ${sku} not found`);
  return v.id;
}

export async function seedDemoData(db: TenantDb): Promise<void> {
  if ((await db.product.count()) > 0) {
    console.log("   demo data already present — skipped");
    return;
  }
  const owner = await db.user.findFirst({ where: { role: "OWNER" }, orderBy: { createdAt: "asc" } });
  const hq = await db.outlet.findUnique({ where: { code: "HQ" } });
  if (!owner || !hq) throw new Error("Tenant is not provisioned (owner / HQ outlet missing)");
  const ctxAt = (outletId: string): ServiceContext => ({ db, userId: owner.id, role: "OWNER", outletId });
  const ctx = ctxAt(hq.id);

  // ── outlets & staff ──
  const orchard = await createOutlet(ctx, { code: "ORC", name: "Orchard", address: "Orchard Road, Singapore", phone: "6000 0001" });
  const toaPayoh = await createOutlet(ctx, { code: "TPY", name: "Toa Payoh", address: "Toa Payoh Central, Singapore", phone: "6000 0002" });
  await createUser(ctx, { name: "Mandy Manager", email: "manager@example.com", password: "demo1234", role: "MANAGER", defaultOutletId: hq.id });
  await createUser(ctx, { name: "Cathy Cashier", email: "cashier@example.com", password: "demo1234", role: "CASHIER", defaultOutletId: toaPayoh.id });

  // ── products ──
  await createProduct(ctx, {
    name: "iPhone 16 Pro",
    type: "SERIALIZED",
    brandName: "Apple",
    categoryName: "Smartphone",
    variants: [
      { sku: "APL-IP16P-256-BLK", color: "Black Titanium", storage: "256GB", condition: "NEW", priceCents: 174900, costCents: 0, minStock: 2 },
      { sku: "APL-IP16P-256-NAT", color: "Natural Titanium", storage: "256GB", condition: "NEW", priceCents: 174900, costCents: 0, minStock: 2 },
      { sku: "APL-IP16P-512-DST", color: "Desert Titanium", storage: "512GB", condition: "NEW", priceCents: 206900, costCents: 0, minStock: 1 },
    ],
  });
  await createProduct(ctx, {
    name: "Galaxy S25 Ultra",
    type: "SERIALIZED",
    brandName: "Samsung",
    categoryName: "Smartphone",
    variants: [
      { sku: "SAM-S25U-256-BLK", color: "Titanium Black", storage: "256GB", ram: "12GB", condition: "NEW", priceCents: 179800, costCents: 0, minStock: 1 },
    ],
  });
  await createProduct(ctx, {
    name: "iPhone 13",
    type: "SERIALIZED",
    brandName: "Apple",
    categoryName: "Smartphone",
    variants: [{ sku: "APL-IP13-128-MID-U", color: "Midnight", storage: "128GB", condition: "USED", priceCents: 49900, costCents: 0 }],
  });
  await createProduct(ctx, {
    name: "Tempered Glass Screen Protector (iPhone 16 Pro)",
    type: "NON_SERIALIZED",
    categoryName: "Accessory",
    variants: [{ sku: "ACC-SP-IP16P", barcode: "8880000000017", condition: "NEW", priceCents: 2500, costCents: 400, minStock: 10 }],
  });
  await createProduct(ctx, {
    name: "USB-C 20W Charger",
    type: "NON_SERIALIZED",
    brandName: "Apple",
    categoryName: "Accessory",
    variants: [{ sku: "ACC-CHG-20W", barcode: "8880000000024", condition: "NEW", priceCents: 3500, costCents: 1200, minStock: 5 }],
  });
  await createProduct(ctx, {
    name: "Clear Case (iPhone 16 Pro)",
    type: "NON_SERIALIZED",
    categoryName: "Accessory",
    variants: [{ sku: "ACC-CASE-IP16P", barcode: "8880000000031", condition: "NEW", priceCents: 2900, costCents: 500, minStock: 5 }],
  });
  await createProduct(ctx, {
    name: "Screen Protector Installation",
    type: "SERVICE",
    categoryName: "Service",
    variants: [{ sku: "SVC-SP-INSTALL", condition: "NEW", priceCents: 1000 }],
  });

  const sku = {
    ip16Blk: await variantIdBySku(db, "APL-IP16P-256-BLK"),
    ip16Nat: await variantIdBySku(db, "APL-IP16P-256-NAT"),
    ip16Dst: await variantIdBySku(db, "APL-IP16P-512-DST"),
    s25: await variantIdBySku(db, "SAM-S25U-256-BLK"),
    ip13: await variantIdBySku(db, "APL-IP13-128-MID-U"),
    protector: await variantIdBySku(db, "ACC-SP-IP16P"),
    charger: await variantIdBySku(db, "ACC-CHG-20W"),
    case: await variantIdBySku(db, "ACC-CASE-IP16P"),
    install: await variantIdBySku(db, "SVC-SP-INSTALL"),
  };

  // ── purchasing: order and receive at HQ ──
  const supplier = await createSupplier(ctx, { name: "Demo Distributor Pte Ltd", contactName: "Alex Tan", phone: "6000 1000" });
  const accessories = await createSupplier(ctx, { name: "Accessory Wholesale", phone: "6000 2000" });
  const po = await createPurchaseOrder(ctx, {
    supplierId: supplier.id,
    outletId: hq.id,
    submit: true,
    items: [
      { variantId: sku.ip16Blk, quantity: 5, unitCostCents: 152000 },
      { variantId: sku.ip16Nat, quantity: 3, unitCostCents: 152000 },
      { variantId: sku.ip16Dst, quantity: 2, unitCostCents: 181000 },
      { variantId: sku.s25, quantity: 3, unitCostCents: 151000 },
    ],
  });
  let imeiSeq = 1;
  const imeis = (n: number) => Array.from({ length: n }, () => ({ imei: demoImei(imeiSeq++) }));
  const poItems = await db.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
  const itemFor = (variantId: string) => {
    const item = poItems.find((i) => i.variantId === variantId);
    if (!item) throw new Error("PO item missing");
    return item.id;
  };
  // first delivery: everything except the 512GB (partial receipt)
  await receivePurchaseOrder(ctx, po.id, {
    notes: "DO-1001",
    lines: [
      { purchaseOrderItemId: itemFor(sku.ip16Blk), quantity: 5, units: imeis(5) },
      { purchaseOrderItemId: itemFor(sku.ip16Nat), quantity: 3, units: imeis(3) },
      { purchaseOrderItemId: itemFor(sku.s25), quantity: 3, units: imeis(3) },
    ],
  });

  const accPo = await createPurchaseOrder(ctx, {
    supplierId: accessories.id,
    outletId: hq.id,
    submit: true,
    items: [
      { variantId: sku.protector, quantity: 60, unitCostCents: 400 },
      { variantId: sku.charger, quantity: 20, unitCostCents: 1200 },
      { variantId: sku.case, quantity: 30, unitCostCents: 500 },
    ],
  });
  const accItems = await db.purchaseOrderItem.findMany({ where: { purchaseOrderId: accPo.id } });
  await receivePurchaseOrder(ctx, accPo.id, {
    lines: accItems.map((i) => ({ purchaseOrderItemId: i.id, quantity: i.quantity })),
  });

  // ── opening stock: used phones at Toa Payoh ──
  await createAdjustment(ctxAt(toaPayoh.id), {
    kind: "STOCK_IN",
    reason: "OPENING_STOCK",
    outletId: toaPayoh.id,
    variantId: sku.ip13,
    unitCostCents: 32000,
    units: [
      { imei: demoImei(900), grade: "A", batteryHealth: 88 },
      { imei: demoImei(901), grade: "B", batteryHealth: 81 },
    ],
  });

  // ── transfer HQ → Orchard and HQ → Toa Payoh ──
  const hqUnits = await db.stockUnit.findMany({
    where: { outletId: hq.id, variantId: sku.ip16Blk, status: "IN_STOCK" },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  const toOrchard = await createTransfer(ctx, {
    toOutletId: orchard.id,
    stockUnitIds: hqUnits.map((u) => u.id),
    items: [{ variantId: sku.protector, quantity: 15 }],
    dispatch: true,
    notes: "Weekly replenishment",
  });
  await receiveTransfer(ctx, toOrchard.id);
  await createTransfer(ctx, {
    toOutletId: toaPayoh.id,
    items: [
      { variantId: sku.protector, quantity: 10 },
      { variantId: sku.case, quantity: 5 },
    ],
    dispatch: true,
    notes: "In transit — confirm at Toa Payoh",
  });

  // ── sales ──
  const methods = await listPaymentMethods(db);
  const cash = methods.find((m) => m.isCash);
  const nets = methods.find((m) => m.name === "NETS") ?? methods.find((m) => !m.isCash);
  if (!cash || !nets) throw new Error("Payment methods missing");

  const unitToSell = await db.stockUnit.findFirst({ where: { outletId: hq.id, variantId: sku.ip16Nat, status: "IN_STOCK" } });
  if (!unitToSell) throw new Error("No demo unit to sell");
  await checkout(ctx, {
    lines: [
      { variantId: sku.ip16Nat, stockUnitId: unitToSell.id, quantity: 1, unitPriceCents: 174900, discountCents: 5000 },
      { variantId: sku.protector, quantity: 1, unitPriceCents: 2500 },
      { variantId: sku.install, quantity: 1, unitPriceCents: 1000 },
    ],
    payments: [
      { paymentMethodId: nets.id, amountCents: 150000 },
      { paymentMethodId: cash.id, amountCents: 30000 },
    ],
    customer: { name: "Jason Lim", phone: "+65 9123 4567" },
  });

  const accessorySale = await checkout(ctx, {
    lines: [
      { variantId: sku.charger, quantity: 2, unitPriceCents: 3500 },
      { variantId: sku.case, quantity: 1, unitPriceCents: 2900 },
    ],
    payments: [{ paymentMethodId: cash.id, amountCents: 10000 }],
  });
  // refund one charger from that sale
  const chargerLine = await db.saleItem.findFirst({ where: { saleId: accessorySale.id, variantId: sku.charger } });
  if (chargerLine) {
    await refundSale(ctx, accessorySale.id, {
      items: [{ saleItemId: chargerLine.id, quantity: 1, disposition: "RESTOCK" }],
      paymentMethodId: cash.id,
      reason: "Customer changed mind",
    });
  }

  const usedPhone = await db.stockUnit.findFirst({ where: { outletId: toaPayoh.id, variantId: sku.ip13, status: "IN_STOCK" } });
  if (usedPhone) {
    await checkout(ctxAt(toaPayoh.id), {
      lines: [{ variantId: sku.ip13, stockUnitId: usedPhone.id, quantity: 1, unitPriceCents: 49900 }],
      payments: [{ paymentMethodId: cash.id, amountCents: 50000 }],
      customer: { name: "Siti", phone: "+65 9876 5432" },
    });
  }
}
