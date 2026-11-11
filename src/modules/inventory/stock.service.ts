/**
 * Inventory write operations. THE ONLY place that changes StockLevel, StockUnit,
 * StockUnitEvent and InventoryMovement (see docs/03-inventory-states.md).
 *
 * Every function takes a transaction client `tx` so that the calling module's document
 * (sale, goods receipt, transfer, refund, adjustment) and the stock change commit together.
 */
import type { TenantTx } from "@/lib/db/tenant";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { setVariantCost, variantLabel, type ProductTypeValue } from "@/modules/products";
import { isValidImei, isValidSerial, normalizeIdentifier } from "./imei";
import { canBeReacquired, canTransition, UNIT_STATUS_LABELS, type UnitStatus } from "./unit-state";

export type DocumentRef = {
  refType: "GOODS_RECEIPT" | "SALE" | "REFUND" | "TRANSFER" | "ADJUSTMENT";
  refId: string;
  refNo: string;
};

type MovementTypeValue =
  | "PURCHASE_RECEIPT"
  | "SALE"
  | "SALE_RETURN"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT";

export type IncomingUnit = {
  imei?: string | null;
  imei2?: string | null;
  serialNumber?: string | null;
  grade?: string | null;
  batteryHealth?: number | null;
  priceCents?: number | null;
  notes?: string | null;
};

type VariantInfo = {
  id: string;
  sku: string;
  label: string;
  type: ProductTypeValue;
  costCents: number;
};

type UnitRow = {
  id: string;
  variantId: string;
  outletId: string;
  status: UnitStatus;
  imei: string | null;
  serialNumber: string | null;
  costCents: number;
};

// ───────────────────────── primitives ─────────────────────────

async function loadVariant(tx: TenantTx, variantId: string): Promise<VariantInfo> {
  const v = await tx.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!v) throw new NotFoundError("Product variant not found");
  return { id: v.id, sku: v.sku, label: variantLabel(v.product.name, v), type: v.product.type, costCents: v.costCents };
}

async function loadUnit(tx: TenantTx, stockUnitId: string): Promise<UnitRow> {
  const u = await tx.stockUnit.findUnique({ where: { id: stockUnitId } });
  if (!u) throw new NotFoundError("IMEI / serial unit not found");
  return {
    id: u.id,
    variantId: u.variantId,
    outletId: u.outletId,
    status: u.status,
    imei: u.imei,
    serialNumber: u.serialNumber,
    costCents: u.costCents,
  };
}

function unitName(unit: { imei: string | null; serialNumber: string | null }): string {
  return unit.imei ? `IMEI ${unit.imei}` : unit.serialNumber ? `S/N ${unit.serialNumber}` : "Unit";
}

async function increaseLevel(tx: TenantTx, outletId: string, variantId: string, quantity: number): Promise<number> {
  await tx.stockLevel.createMany({ data: [{ outletId, variantId, quantity: 0 }], skipDuplicates: true });
  const level = await tx.stockLevel.update({
    where: { outletId_variantId: { outletId, variantId } },
    data: { quantity: { increment: quantity } },
  });
  return level.quantity;
}

/** Conditional decrement: fails instead of going negative. The row stays locked until commit. */
async function decreaseLevel(
  tx: TenantTx,
  outletId: string,
  variantId: string,
  quantity: number,
  label: string,
): Promise<number> {
  const result = await tx.stockLevel.updateMany({
    where: { outletId, variantId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (result.count !== 1) {
    const level = await tx.stockLevel.findUnique({ where: { outletId_variantId: { outletId, variantId } } });
    throw new ConflictError(`Not enough stock for ${label} (available: ${level?.quantity ?? 0}, needed: ${quantity})`);
  }
  const level = await tx.stockLevel.findUnique({ where: { outletId_variantId: { outletId, variantId } } });
  return level?.quantity ?? 0;
}

async function recordMovement(
  tx: TenantTx,
  movement: {
    outletId: string;
    variantId: string;
    stockUnitId?: string | null;
    type: MovementTypeValue;
    quantity: number;
    balanceAfter: number;
    unitCostCents: number;
    ref: DocumentRef;
    userId: string;
    note?: string | null;
  },
): Promise<void> {
  await tx.inventoryMovement.create({
    data: {
      outletId: movement.outletId,
      variantId: movement.variantId,
      stockUnitId: movement.stockUnitId ?? null,
      type: movement.type,
      quantity: movement.quantity,
      balanceAfter: movement.balanceAfter,
      unitCostCents: movement.unitCostCents,
      refType: movement.ref.refType,
      refId: movement.ref.refId,
      refNo: movement.ref.refNo,
      note: movement.note ?? null,
      userId: movement.userId,
    },
  });
}

type UnitChanges = {
  variantId?: string;
  costCents?: number;
  priceCents?: number | null;
  grade?: string | null;
  batteryHealth?: number | null;
  notes?: string | null;
  imei2?: string | null;
  goodsReceiptItemId?: string | null;
};

/**
 * Moves a unit to a new status using compare-and-set on (status, outlet), and writes the event.
 * Throws ConflictError if someone else changed the unit in the meantime.
 */
async function transitionUnit(
  tx: TenantTx,
  args: {
    unit: UnitRow;
    to: UnitStatus;
    newOutletId?: string;
    changes?: UnitChanges;
    ref: DocumentRef;
    userId: string;
    note?: string | null;
  },
): Promise<UnitRow> {
  const { unit, to } = args;
  if (!canTransition(unit.status, to)) {
    throw new ConflictError(
      `${unitName(unit)} is ${UNIT_STATUS_LABELS[unit.status]} and cannot become ${UNIT_STATUS_LABELS[to]}`,
    );
  }
  const outletId = args.newOutletId ?? unit.outletId;
  const result = await tx.stockUnit.updateMany({
    where: { id: unit.id, status: unit.status, outletId: unit.outletId },
    data: { ...args.changes, status: to, outletId },
  });
  if (result.count !== 1) {
    throw new ConflictError(`${unitName(unit)} was just changed by someone else. Please refresh and try again.`);
  }
  await tx.stockUnitEvent.create({
    data: {
      stockUnitId: unit.id,
      fromStatus: unit.status,
      toStatus: to,
      outletId,
      refType: args.ref.refType,
      refId: args.ref.refId,
      refNo: args.ref.refNo,
      note: args.note ?? null,
      userId: args.userId,
    },
  });
  return { ...unit, status: to, outletId, variantId: args.changes?.variantId ?? unit.variantId };
}

function normalizeIncomingUnit(raw: IncomingUnit, index: number) {
  const imei = raw.imei ? normalizeIdentifier(raw.imei) : null;
  const imei2 = raw.imei2 ? normalizeIdentifier(raw.imei2) : null;
  const serialNumber = raw.serialNumber ? normalizeIdentifier(raw.serialNumber) : null;
  if (!imei && !serialNumber) throw new ValidationError(`Unit ${index + 1}: IMEI or serial number is required`);
  if (imei && !isValidImei(imei)) throw new ValidationError(`Unit ${index + 1}: ${imei} is not a valid IMEI`);
  if (imei2 && !isValidImei(imei2)) throw new ValidationError(`Unit ${index + 1}: IMEI 2 ${imei2} is not valid`);
  if (serialNumber && !isValidSerial(serialNumber)) {
    throw new ValidationError(`Unit ${index + 1}: ${serialNumber} is not a valid serial number`);
  }
  return {
    imei,
    imei2,
    serialNumber,
    grade: raw.grade?.trim() ? raw.grade.trim().toUpperCase().slice(0, 5) : null,
    batteryHealth: raw.batteryHealth ?? null,
    priceCents: raw.priceCents ?? null,
    notes: raw.notes?.trim() ? raw.notes.trim() : null,
  };
}

// ───────────────────────── public operations ─────────────────────────

/**
 * Stock coming IN from a supplier (goods receipt) or a manual "stock in" adjustment.
 * Serialized: one unit per IMEI/serial. A unit that was SOLD / WRITTEN_OFF before is re-activated
 * (same record → full lifecycle history). Quantity items update the moving-average cost.
 */
export async function receiveStock(
  tx: TenantTx,
  input: {
    outletId: string;
    variantId: string;
    quantity: number;
    unitCostCents: number;
    units?: IncomingUnit[];
    goodsReceiptItemId?: string | null;
    movementType: "PURCHASE_RECEIPT" | "ADJUSTMENT_IN";
    ref: DocumentRef;
    userId: string;
    note?: string | null;
  },
): Promise<{ stockUnitIds: string[] }> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new ValidationError("Quantity must be at least 1");
  const variant = await loadVariant(tx, input.variantId);
  if (variant.type === "SERVICE") throw new ValidationError(`${variant.label} is a service and has no stock`);

  if (variant.type === "NON_SERIALIZED") {
    if (input.units && input.units.length > 0) throw new ValidationError(`${variant.label} is not tracked by IMEI`);
    const totals = await tx.stockLevel.aggregate({ where: { variantId: variant.id }, _sum: { quantity: true } });
    const onHand = Math.max(0, Number(totals._sum?.quantity ?? 0));
    const averageCost =
      onHand > 0
        ? Math.round((onHand * variant.costCents + input.quantity * input.unitCostCents) / (onHand + input.quantity))
        : input.unitCostCents;
    await setVariantCost(tx, variant.id, averageCost);
    const balanceAfter = await increaseLevel(tx, input.outletId, variant.id, input.quantity);
    await recordMovement(tx, {
      outletId: input.outletId,
      variantId: variant.id,
      type: input.movementType,
      quantity: input.quantity,
      balanceAfter,
      unitCostCents: input.unitCostCents,
      ref: input.ref,
      userId: input.userId,
      note: input.note,
    });
    return { stockUnitIds: [] };
  }

  // SERIALIZED
  const units = (input.units ?? []).map(normalizeIncomingUnit);
  if (units.length !== input.quantity) {
    throw new ValidationError(`${variant.label}: scan ${input.quantity} IMEI/serial number(s) (got ${units.length})`);
  }
  const seen = new Set<string>();
  for (const u of units) {
    for (const key of [u.imei, u.serialNumber]) {
      if (!key) continue;
      if (seen.has(key)) throw new ValidationError(`${key} appears twice`);
      seen.add(key);
    }
  }

  const stockUnitIds: string[] = [];
  for (const u of units) {
    const identifiers = [u.imei ? { imei: u.imei } : null, u.serialNumber ? { serialNumber: u.serialNumber } : null].filter(
      (x): x is { imei: string } | { serialNumber: string } => x !== null,
    );
    const existing = await tx.stockUnit.findFirst({ where: { OR: identifiers } });
    const unitData = {
      variantId: variant.id,
      costCents: input.unitCostCents,
      priceCents: u.priceCents,
      grade: u.grade,
      batteryHealth: u.batteryHealth,
      notes: u.notes,
      imei2: u.imei2,
      goodsReceiptItemId: input.goodsReceiptItemId ?? null,
    };
    if (existing) {
      if (!canBeReacquired(existing.status)) {
        throw new ConflictError(
          `${unitName(existing)} is already in the system (${UNIT_STATUS_LABELS[existing.status]})`,
        );
      }
      const unit = await transitionUnit(tx, {
        unit: {
          id: existing.id,
          variantId: existing.variantId,
          outletId: existing.outletId,
          status: existing.status,
          imei: existing.imei,
          serialNumber: existing.serialNumber,
          costCents: existing.costCents,
        },
        to: "IN_STOCK",
        newOutletId: input.outletId,
        changes: unitData,
        ref: input.ref,
        userId: input.userId,
        note: "Re-acquired",
      });
      stockUnitIds.push(unit.id);
    } else {
      const created = await tx.stockUnit.create({
        data: {
          ...unitData,
          outletId: input.outletId,
          status: "IN_STOCK",
          imei: u.imei,
          serialNumber: u.serialNumber,
        },
      });
      await tx.stockUnitEvent.create({
        data: {
          stockUnitId: created.id,
          fromStatus: null,
          toStatus: "IN_STOCK",
          outletId: input.outletId,
          refType: input.ref.refType,
          refId: input.ref.refId,
          refNo: input.ref.refNo,
          note: input.note ?? null,
          userId: input.userId,
        },
      });
      stockUnitIds.push(created.id);
    }
  }

  const balanceAfter = await increaseLevel(tx, input.outletId, variant.id, units.length);
  for (let i = 0; i < stockUnitIds.length; i++) {
    await recordMovement(tx, {
      outletId: input.outletId,
      variantId: variant.id,
      stockUnitId: stockUnitIds[i],
      type: input.movementType,
      quantity: 1,
      balanceAfter: balanceAfter - stockUnitIds.length + i + 1,
      unitCostCents: input.unitCostCents,
      ref: input.ref,
      userId: input.userId,
      note: input.note,
    });
  }
  return { stockUnitIds };
}

export type IssuedStock = {
  /** Cost of ONE unit (for margin reports) */
  unitCostCents: number;
  imei: string | null;
  serialNumber: string | null;
  label: string;
  sku: string;
};

/**
 * Stock going OUT of an outlet: sale, transfer dispatch, or "stock out" adjustment.
 * Services pass through without touching stock.
 */
export async function issueStock(
  tx: TenantTx,
  input: {
    outletId: string;
    variantId: string;
    quantity: number;
    stockUnitId?: string | null;
    movementType: "SALE" | "TRANSFER_OUT" | "ADJUSTMENT_OUT";
    /** New status of a serialized unit */
    unitStatus: "SOLD" | "IN_TRANSIT" | "DEFECTIVE" | "WRITTEN_OFF";
    ref: DocumentRef;
    userId: string;
    note?: string | null;
  },
): Promise<IssuedStock> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new ValidationError("Quantity must be at least 1");
  const variant = await loadVariant(tx, input.variantId);
  const base = { label: variant.label, sku: variant.sku };

  if (variant.type === "SERVICE") {
    if (input.movementType !== "SALE") throw new ValidationError(`${variant.label} is a service and has no stock`);
    return { ...base, unitCostCents: 0, imei: null, serialNumber: null };
  }

  if (variant.type === "NON_SERIALIZED") {
    if (input.stockUnitId) throw new ValidationError(`${variant.label} is not tracked by IMEI`);
    const balanceAfter = await decreaseLevel(tx, input.outletId, variant.id, input.quantity, variant.label);
    await recordMovement(tx, {
      outletId: input.outletId,
      variantId: variant.id,
      type: input.movementType,
      quantity: -input.quantity,
      balanceAfter,
      unitCostCents: variant.costCents,
      ref: input.ref,
      userId: input.userId,
      note: input.note,
    });
    return { ...base, unitCostCents: variant.costCents, imei: null, serialNumber: null };
  }

  // SERIALIZED
  if (!input.stockUnitId) throw new ValidationError(`${variant.label}: choose the IMEI / serial number`);
  if (input.quantity !== 1) throw new ValidationError(`${variant.label}: one line per IMEI`);
  const unit = await loadUnit(tx, input.stockUnitId);
  if (unit.variantId !== variant.id) throw new ValidationError(`${unitName(unit)} is not a ${variant.label}`);
  if (unit.status !== "IN_STOCK") {
    throw new ConflictError(`${unitName(unit)} is ${UNIT_STATUS_LABELS[unit.status]}, not available`);
  }
  if (unit.outletId !== input.outletId) throw new ConflictError(`${unitName(unit)} is at another outlet`);

  await transitionUnit(tx, { unit, to: input.unitStatus, ref: input.ref, userId: input.userId, note: input.note });
  const balanceAfter = await decreaseLevel(tx, input.outletId, variant.id, 1, variant.label);
  await recordMovement(tx, {
    outletId: input.outletId,
    variantId: variant.id,
    stockUnitId: unit.id,
    type: input.movementType,
    quantity: -1,
    balanceAfter,
    unitCostCents: unit.costCents,
    ref: input.ref,
    userId: input.userId,
    note: input.note,
  });
  return { ...base, unitCostCents: unit.costCents, imei: unit.imei, serialNumber: unit.serialNumber };
}

/** Goods coming back from a customer (refund). RESTOCK = sellable again; DEFECTIVE = not sellable. */
export async function returnStock(
  tx: TenantTx,
  input: {
    outletId: string;
    variantId: string;
    quantity: number;
    stockUnitId?: string | null;
    disposition: "RESTOCK" | "DEFECTIVE";
    unitCostCents: number;
    ref: DocumentRef;
    userId: string;
    note?: string | null;
  },
): Promise<void> {
  const variant = await loadVariant(tx, input.variantId);
  if (variant.type === "SERVICE") return;

  if (variant.type === "NON_SERIALIZED") {
    if (input.disposition === "DEFECTIVE") return; // faulty accessories are not put back into stock
    const balanceAfter = await increaseLevel(tx, input.outletId, variant.id, input.quantity);
    await recordMovement(tx, {
      outletId: input.outletId,
      variantId: variant.id,
      type: "SALE_RETURN",
      quantity: input.quantity,
      balanceAfter,
      unitCostCents: input.unitCostCents,
      ref: input.ref,
      userId: input.userId,
      note: input.note,
    });
    return;
  }

  if (!input.stockUnitId) throw new ValidationError(`${variant.label}: missing IMEI unit`);
  const unit = await loadUnit(tx, input.stockUnitId);
  if (unit.status !== "SOLD") {
    throw new ConflictError(`${unitName(unit)} is ${UNIT_STATUS_LABELS[unit.status]}, it cannot be returned`);
  }
  if (input.disposition === "DEFECTIVE") {
    await transitionUnit(tx, {
      unit,
      to: "DEFECTIVE",
      newOutletId: input.outletId,
      ref: input.ref,
      userId: input.userId,
      note: input.note ?? "Returned faulty",
    });
    return;
  }
  await transitionUnit(tx, {
    unit,
    to: "IN_STOCK",
    newOutletId: input.outletId,
    ref: input.ref,
    userId: input.userId,
    note: input.note ?? "Returned by customer",
  });
  const balanceAfter = await increaseLevel(tx, input.outletId, variant.id, 1);
  await recordMovement(tx, {
    outletId: input.outletId,
    variantId: variant.id,
    stockUnitId: unit.id,
    type: "SALE_RETURN",
    quantity: 1,
    balanceAfter,
    unitCostCents: unit.costCents,
    ref: input.ref,
    userId: input.userId,
    note: input.note,
  });
}

/** Destination outlet confirms a transfer: IN_TRANSIT → IN_STOCK at the destination. */
export async function receiveTransferredStock(
  tx: TenantTx,
  input: {
    toOutletId: string;
    variantId: string;
    quantity: number;
    stockUnitId?: string | null;
    unitCostCents: number;
    ref: DocumentRef;
    userId: string;
  },
): Promise<void> {
  const variant = await loadVariant(tx, input.variantId);
  if (variant.type === "SERVICE") return;

  if (variant.type === "SERIALIZED") {
    if (!input.stockUnitId) throw new ValidationError(`${variant.label}: missing IMEI unit`);
    const unit = await loadUnit(tx, input.stockUnitId);
    if (unit.status !== "IN_TRANSIT") {
      throw new ConflictError(`${unitName(unit)} is ${UNIT_STATUS_LABELS[unit.status]}, not in transit`);
    }
    await transitionUnit(tx, { unit, to: "IN_STOCK", newOutletId: input.toOutletId, ref: input.ref, userId: input.userId });
  }
  const balanceAfter = await increaseLevel(tx, input.toOutletId, variant.id, input.quantity);
  await recordMovement(tx, {
    outletId: input.toOutletId,
    variantId: variant.id,
    stockUnitId: input.stockUnitId ?? null,
    type: "TRANSFER_IN",
    quantity: input.quantity,
    balanceAfter,
    unitCostCents: input.unitCostCents,
    ref: input.ref,
    userId: input.userId,
  });
}

export type UnitAction = "MARK_DEFECTIVE" | "WRITE_OFF" | "RESTORE";

/** Manual status change of one IMEI unit (adjustments). Returns the outlet the unit belongs to. */
export async function changeUnitStatus(
  tx: TenantTx,
  input: { stockUnitId: string; action: UnitAction; ref: DocumentRef; userId: string; note?: string | null },
): Promise<void> {
  const unit = await loadUnit(tx, input.stockUnitId);
  const common = { ref: input.ref, userId: input.userId, note: input.note };

  if (input.action === "MARK_DEFECTIVE" || (input.action === "WRITE_OFF" && unit.status === "IN_STOCK")) {
    await issueStock(tx, {
      outletId: unit.outletId,
      variantId: unit.variantId,
      quantity: 1,
      stockUnitId: unit.id,
      movementType: "ADJUSTMENT_OUT",
      unitStatus: input.action === "MARK_DEFECTIVE" ? "DEFECTIVE" : "WRITTEN_OFF",
      ...common,
    });
    return;
  }
  if (input.action === "WRITE_OFF") {
    // DEFECTIVE → WRITTEN_OFF: not sellable stock either way, so no quantity movement
    await transitionUnit(tx, { unit, to: "WRITTEN_OFF", ...common });
    return;
  }
  // RESTORE: DEFECTIVE / WRITTEN_OFF → IN_STOCK
  if (unit.status !== "DEFECTIVE" && unit.status !== "WRITTEN_OFF") {
    throw new ConflictError(`${unitName(unit)} is ${UNIT_STATUS_LABELS[unit.status]} and cannot be restored`);
  }
  await transitionUnit(tx, { unit, to: "IN_STOCK", ...common });
  const variant = await loadVariant(tx, unit.variantId);
  const balanceAfter = await increaseLevel(tx, unit.outletId, unit.variantId, 1);
  await recordMovement(tx, {
    outletId: unit.outletId,
    variantId: unit.variantId,
    stockUnitId: unit.id,
    type: "ADJUSTMENT_IN",
    quantity: 1,
    balanceAfter,
    unitCostCents: unit.costCents,
    ref: input.ref,
    userId: input.userId,
    note: input.note ?? `${variant.label} restored`,
  });
}

/** Where is this unit? Used by adjustments to stamp the right outlet on the document. */
export async function getUnitOutletId(tx: TenantTx, stockUnitId: string): Promise<string> {
  return (await loadUnit(tx, stockUnitId)).outletId;
}
