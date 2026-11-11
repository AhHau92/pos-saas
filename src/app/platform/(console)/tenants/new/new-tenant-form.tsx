"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass, selectClass } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";

type Plan = { code: string; name: string; maxOutlets: number; maxUsers: number };

export function NewTenantForm({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    planCode: plans[0]?.code ?? "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    outletName: "Main Store",
    currency: "SGD",
    taxRate: "9",
    taxInclusive: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/platform/tenants", {
        body: {
          name: form.name,
          slug: form.slug,
          planCode: form.planCode,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerPassword: form.ownerPassword,
          outletName: form.outletName,
          currency: form.currency,
          taxRateBps: Math.round(Number(form.taxRate) * 100),
          taxInclusive: form.taxInclusive,
        },
      });
      router.push("/platform");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Card className="space-y-4 px-5 py-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Shop name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                const auto = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
                set({ name, slug: form.slug === "" || form.slug === autoSlug(form.name) ? auto : form.slug });
              }}
              required
            />
          </Field>
          <Field label="Shop code (login)" hint="Lowercase letters, numbers and dashes">
            <input className={`${inputClass} font-mono`} value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} required />
          </Field>
          <Field label="Plan">
            <select className={selectClass} value={form.planCode} onChange={(e) => set({ planCode: e.target.value })}>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} · {p.maxOutlets} outlets · {p.maxUsers} users
                </option>
              ))}
            </select>
          </Field>
          <Field label="First outlet name">
            <input className={inputClass} value={form.outletName} onChange={(e) => set({ outletName: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
          <Field label="Owner name">
            <input className={inputClass} value={form.ownerName} onChange={(e) => set({ ownerName: e.target.value })} required />
          </Field>
          <Field label="Owner email">
            <input className={inputClass} type="email" value={form.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} required />
          </Field>
          <Field label="Owner password" hint="At least 8 characters">
            <input className={inputClass} type="password" value={form.ownerPassword} onChange={(e) => set({ ownerPassword: e.target.value })} required />
          </Field>
        </div>
        <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
          <Field label="Currency">
            <input className={inputClass} value={form.currency} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Tax rate (%)">
            <input className={inputClass} inputMode="decimal" value={form.taxRate} onChange={(e) => set({ taxRate: e.target.value })} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" className={checkboxClass} checked={form.taxInclusive} onChange={(e) => set({ taxInclusive: e.target.checked })} />
            Prices include tax
          </label>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          {busy ? "Creating database…" : "Create tenant"}
        </Button>
      </div>
    </form>
  );
}

function autoSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}
