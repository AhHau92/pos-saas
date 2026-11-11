"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass } from "@/components/ui/form";
import { Alert, Card, CardHeader } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";

type Profile = {
  name: string;
  registrationNo: string | null;
  taxRegistrationNo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  taxName: string;
  taxRateBps: number;
  taxInclusive: boolean;
  receiptFooter: string | null;
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...profile,
    registrationNo: profile.registrationNo ?? "",
    taxRegistrationNo: profile.taxRegistrationNo ?? "",
    address: profile.address ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    receiptFooter: profile.receiptFooter ?? "",
    taxRate: (profile.taxRateBps / 100).toString(),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const rate = Number(form.taxRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
      setMessage({ tone: "red", text: "Tax rate must be between 0 and 50" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest("/api/settings/profile", {
        method: "PUT",
        body: {
          name: form.name,
          registrationNo: form.registrationNo || null,
          taxRegistrationNo: form.taxRegistrationNo || null,
          address: form.address || null,
          phone: form.phone || null,
          email: form.email || null,
          currency: form.currency,
          taxName: form.taxName,
          taxRateBps: Math.round(rate * 100),
          taxInclusive: form.taxInclusive,
          receiptFooter: form.receiptFooter || null,
        },
      });
      setMessage({ tone: "green", text: "Saved" });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "red", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Card>
        <CardHeader title="Company" description="Shown on receipts" />
        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <Field label="Business name" className="md:col-span-2">
            <input className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <Field label="Company registration no. (UEN)">
            <input className={inputClass} value={form.registrationNo} onChange={(e) => set({ registrationNo: e.target.value })} />
          </Field>
          <Field label="GST / tax registration no.">
            <input className={inputClass} value={form.taxRegistrationNo} onChange={(e) => set({ taxRegistrationNo: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className={inputClass} value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Address" className="md:col-span-2">
            <textarea className={inputClass} rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Currency & tax" description="Applied to new sales. Existing sales keep the rate they were made with." />
        <div className="grid gap-4 px-5 py-4 md:grid-cols-4">
          <Field label="Currency">
            <input className={inputClass} value={form.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} maxLength={3} />
          </Field>
          <Field label="Tax name">
            <input className={inputClass} value={form.taxName} onChange={(e) => set({ taxName: e.target.value })} />
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
      <Card>
        <CardHeader title="Receipt" />
        <div className="px-5 py-4">
          <Field label="Receipt footer" hint="e.g. warranty terms, return policy">
            <textarea className={inputClass} rows={4} value={form.receiptFooter} onChange={(e) => set({ receiptFooter: e.target.value })} />
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}
