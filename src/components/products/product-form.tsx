"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert, Card, CardHeader } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import {
  CONDITION_LABELS,
  PRODUCT_TYPE_LABELS,
  suggestSku,
  type ConditionValue,
  type ProductDetail,
  type ProductTypeValue,
} from "@/modules/products/client";

type VariantRow = {
  key: string;
  id?: string;
  sku: string;
  barcode: string;
  color: string;
  storage: string;
  ram: string;
  condition: ConditionValue;
  priceCents: number;
  costCents: number;
  minStock: number;
  isActive: boolean;
};

let rowSeq = 0;
const rowKey = () => `v${++rowSeq}`;

function emptyRow(condition: ConditionValue = "NEW"): VariantRow {
  return {
    key: rowKey(),
    sku: "",
    barcode: "",
    color: "",
    storage: "",
    ram: "",
    condition,
    priceCents: 0,
    costCents: 0,
    minStock: 0,
    isActive: true,
  };
}

const CONDITIONS: ConditionValue[] = ["NEW", "USED", "REFURBISHED"];
const TYPES: ProductTypeValue[] = ["SERIALIZED", "NON_SERIALIZED", "SERVICE"];

export function ProductForm({
  product,
  brandNames,
  categoryNames,
}: {
  product?: ProductDetail;
  brandNames: string[];
  categoryNames: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(product?.name ?? "");
  const [type, setType] = useState<ProductTypeValue>(product?.type ?? "SERIALIZED");
  const [brandName, setBrandName] = useState(product?.brandName ?? "");
  const [categoryName, setCategoryName] = useState(product?.categoryName ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [rows, setRows] = useState<VariantRow[]>(
    product
      ? product.variants.map((v) => ({
          key: rowKey(),
          id: v.id,
          sku: v.sku,
          barcode: v.barcode ?? "",
          color: v.color ?? "",
          storage: v.storage ?? "",
          ram: v.ram ?? "",
          condition: v.condition,
          priceCents: v.priceCents,
          costCents: v.costCents,
          minStock: v.minStock,
          isActive: v.isActive,
        }))
      : [emptyRow()],
  );
  const [bulk, setBulk] = useState({ colors: "", storages: "", condition: "NEW" as ConditionValue, priceCents: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: string, patch: Partial<VariantRow>) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function generateCombinations() {
    const colors = bulk.colors.split(",").map((s) => s.trim()).filter(Boolean);
    const storages = bulk.storages.split(",").map((s) => s.trim()).filter(Boolean);
    const combos: VariantRow[] = [];
    for (const storage of storages.length ? storages : [""]) {
      for (const color of colors.length ? colors : [""]) {
        combos.push({ ...emptyRow(bulk.condition), color, storage, priceCents: bulk.priceCents });
      }
    }
    // replace the single untouched empty row of a new product
    setRows((list) => {
      const untouched = list.length === 1 && !list[0].id && !list[0].color && !list[0].storage && !list[0].sku;
      return untouched ? combos : [...list, ...combos];
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name,
      type,
      brandName: brandName || null,
      categoryName: categoryName || null,
      description: description || null,
      isActive,
      variants: rows.map((r) => ({
        id: r.id,
        sku: r.sku || null,
        barcode: r.barcode || null,
        color: r.color || null,
        storage: r.storage || null,
        ram: r.ram || null,
        condition: r.condition,
        priceCents: r.priceCents,
        costCents: r.costCents,
        minStock: r.minStock,
        isActive: r.isActive,
      })),
    };
    try {
      const result = product
        ? await apiRequest<{ id: string }>(`/api/products/${product.id}`, { method: "PUT", body })
        : await apiRequest<{ id: string }>("/api/products", { body });
      router.push(`/products/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      <Card>
        <CardHeader title="Product" description="A product is a model, e.g. “iPhone 16 Pro”. Each colour / storage / condition is a variant (SKU)." />
        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required placeholder="iPhone 16 Pro" />
          </Field>
          <Field label="Stock tracking" hint={type === "SERIALIZED" ? "Each unit is scanned by IMEI / serial number" : undefined}>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as ProductTypeValue)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Brand">
            <input className={inputClass} value={brandName} onChange={(e) => setBrandName(e.target.value)} list="brand-options" placeholder="Apple" />
            <datalist id="brand-options">
              {brandNames.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Category">
            <input className={inputClass} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} list="category-options" placeholder="Smartphone" />
            <datalist id="category-options">
              {categoryNames.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Description" className="md:col-span-2">
            <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Variants (SKU)"
          description="Leave SKU blank to generate one automatically. Removing a saved variant deactivates it."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setRows((list) => [...list, emptyRow()])}>
              <Icon name="plus" className="h-4 w-4" /> Add variant
            </Button>
          }
        />
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div className="mb-2 text-xs font-medium text-slate-600">Quick add: colours × storage</div>
          <div className="grid gap-2 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
            <input className={inputClass} placeholder="Colours: Black, White, Desert" value={bulk.colors} onChange={(e) => setBulk({ ...bulk, colors: e.target.value })} />
            <input className={inputClass} placeholder="Storage: 128GB, 256GB, 512GB" value={bulk.storages} onChange={(e) => setBulk({ ...bulk, storages: e.target.value })} />
            <select className={selectClass} value={bulk.condition} onChange={(e) => setBulk({ ...bulk, condition: e.target.value as ConditionValue })}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
            <MoneyInput value={bulk.priceCents} onChange={(c) => setBulk({ ...bulk, priceCents: c })} ariaLabel="Price" />
            <Button variant="secondary" onClick={generateCombinations}>
              Generate
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Colour</th>
                <th className="px-3 py-2">Storage</th>
                <th className="px-3 py-2">RAM</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Barcode</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Min stock</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key} className={r.isActive ? "" : "opacity-60"}>
                  <td className="px-3 py-2">
                    <input className={inputClass} value={r.color} onChange={(e) => updateRow(r.key, { color: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={`${inputClass} w-24`} value={r.storage} onChange={(e) => updateRow(r.key, { storage: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={`${inputClass} w-20`} value={r.ram} onChange={(e) => updateRow(r.key, { ram: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <select className={selectClass} value={r.condition} onChange={(e) => updateRow(r.key, { condition: e.target.value as ConditionValue })}>
                      {CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {CONDITION_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={`${inputClass} w-56 font-mono text-xs`}
                      value={r.sku}
                      onChange={(e) => updateRow(r.key, { sku: e.target.value.toUpperCase() })}
                      placeholder={suggestSku({ brand: brandName, name: name || "PRODUCT", storage: r.storage, color: r.color, condition: r.condition })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input className={`${inputClass} w-36`} value={r.barcode} onChange={(e) => updateRow(r.key, { barcode: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <MoneyInput className="w-28" value={r.priceCents} onChange={(c) => updateRow(r.key, { priceCents: c })} ariaLabel="Price" />
                  </td>
                  <td className="px-3 py-2">
                    <MoneyInput className="w-28" value={r.costCents} onChange={(c) => updateRow(r.key, { costCents: c })} ariaLabel="Cost" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      className={`${inputClass} w-20 text-right`}
                      value={r.minStock}
                      onChange={(e) => updateRow(r.key, { minStock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" className={checkboxClass} checked={r.isActive} onChange={(e) => updateRow(r.key, { isActive: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setRows((list) => (list.length > 1 ? list.filter((x) => x.key !== r.key) : list))}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Remove variant"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {product ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
