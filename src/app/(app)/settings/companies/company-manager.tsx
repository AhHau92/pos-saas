"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import type { CompanyDTO } from "@/modules/outlets/client";

type Draft = {
  id: string | null;
  name: string;
  registrationNo: string;
  gstRegistered: boolean;
  taxRegistrationNo: string;
  address: string;
  isActive: boolean;
};

const EMPTY: Draft = { id: null, name: "", registrationNo: "", gstRegistered: true, taxRegistrationNo: "", address: "", isActive: true };

export function CompanyManager({
  companies,
  defaultCompany,
}: {
  companies: CompanyDTO[];
  defaultCompany: { name: string; registrationNo: string | null; taxRegistrationNo: string | null; taxName: string; taxRate: number };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const body = {
      name: draft.name,
      registrationNo: draft.registrationNo || null,
      gstRegistered: draft.gstRegistered,
      taxRegistrationNo: draft.gstRegistered ? draft.taxRegistrationNo || null : null,
      address: draft.address || null,
      isActive: draft.isActive,
    };
    try {
      if (draft.id) await apiRequest(`/api/companies/${draft.id}`, { method: "PUT", body });
      else await apiRequest("/api/companies", { body });
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setError(null);
            setDraft({ ...EMPTY });
          }}
        >
          <Icon name="plus" className="h-4 w-4" /> New company
        </Button>
      </div>
      <Card>
        {companies.length === 0 ? (
          <EmptyState title="One company for all outlets">
            All outlets use the details in Business profile: {defaultCompany.name}
            {defaultCompany.registrationNo ? ` · UEN ${defaultCompany.registrationNo}` : ""}
            {defaultCompany.taxRegistrationNo
              ? ` · ${defaultCompany.taxName} ${defaultCompany.taxRate}% (reg. ${defaultCompany.taxRegistrationNo})`
              : ""}
            . Add companies only if some outlets belong to another company.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>UEN</Th>
                <Th>GST</Th>
                <Th>Outlets</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td>{c.registrationNo ?? "—"}</Td>
                  <Td>
                    {c.gstRegistered ? (
                      <Badge tone="green">
                        {defaultCompany.taxName} {defaultCompany.taxRate}% · {c.taxRegistrationNo}
                      </Badge>
                    ) : (
                      <Badge tone="amber">Not registered — no {defaultCompany.taxName}</Badge>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{c.outletCodes.join(", ") || "—"}</Td>
                  <Td>{c.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setError(null);
                        setDraft({
                          id: c.id,
                          name: c.name,
                          registrationNo: c.registrationNo ?? "",
                          gstRegistered: c.gstRegistered,
                          taxRegistrationNo: c.taxRegistrationNo ?? "",
                          address: c.address ?? "",
                          isActive: c.isActive,
                        });
                      }}
                    >
                      Edit
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Modal
        open={draft !== null}
        title={draft?.id ? "Edit company" : "New company"}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-3">
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Legal name" hint="As registered, e.g. Mobile Relation 1 Pte Ltd">
              <input className={inputClass} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="UEN">
              <input className={inputClass} value={draft.registrationNo} onChange={(e) => set({ registrationNo: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={draft.gstRegistered}
                onChange={(e) => set({ gstRegistered: e.target.checked })}
              />
              {defaultCompany.taxName} registered (charges {defaultCompany.taxRate}% and issues tax invoices)
            </label>
            {draft.gstRegistered ? (
              <Field label={`${defaultCompany.taxName} registration no.`}>
                <input className={inputClass} value={draft.taxRegistrationNo} onChange={(e) => set({ taxRegistrationNo: e.target.value })} />
              </Field>
            ) : (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Outlets of this company charge no {defaultCompany.taxName}: prices have no {defaultCompany.taxName} in them and
                receipts say “RECEIPT” without a {defaultCompany.taxName} amount.
              </p>
            )}
            <Field label="Registered address (optional)">
              <textarea className={inputClass} rows={2} value={draft.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            {draft.id ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className={checkboxClass} checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                Active
              </label>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
