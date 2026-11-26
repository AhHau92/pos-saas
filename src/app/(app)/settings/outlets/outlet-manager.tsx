"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, Table, Td, Th } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";

type Outlet = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  companyId: string | null;
  companyName: string | null;
};
type Draft = { id: string | null; code: string; name: string; address: string; phone: string; isActive: boolean; companyId: string };
type CompanyOption = { id: string; name: string; gstRegistered: boolean };

export function OutletManager({ outlets, companies }: { outlets: Outlet[]; companies: CompanyOption[] }) {
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
      code: draft.code,
      name: draft.name,
      address: draft.address || null,
      phone: draft.phone || null,
      companyId: draft.companyId || null,
    };
    try {
      if (draft.id) await apiRequest(`/api/outlets/${draft.id}`, { method: "PUT", body: { ...body, isActive: draft.isActive } });
      else await apiRequest("/api/outlets", { body });
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
            setDraft({ id: null, code: "", name: "", address: "", phone: "", isActive: true, companyId: "" });
          }}
        >
          <Icon name="plus" className="h-4 w-4" /> New outlet
        </Button>
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Address</Th>
              <Th>Phone</Th>
              {companies.length > 0 ? <Th>Company</Th> : null}
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {outlets.map((o) => (
              <tr key={o.id}>
                <Td className="font-mono font-semibold">{o.code}</Td>
                <Td>{o.name}</Td>
                <Td className="text-slate-500">{o.address ?? "—"}</Td>
                <Td>{o.phone ?? "—"}</Td>
                {companies.length > 0 ? <Td>{o.companyName ?? <span className="text-slate-400">Business profile</span>}</Td> : null}
                <Td>{o.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setError(null);
                      setDraft({
                        id: o.id,
                        code: o.code,
                        name: o.name,
                        address: o.address ?? "",
                        phone: o.phone ?? "",
                        isActive: o.isActive,
                        companyId: o.companyId ?? "",
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
      </Card>
      <Modal
        open={draft !== null}
        title={draft?.id ? "Edit outlet" : "New outlet"}
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
            <div className="grid grid-cols-3 gap-3">
              <Field label="Code" hint="e.g. HQ, TPY">
                <input className={`${inputClass} font-mono uppercase`} value={draft.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Name" className="col-span-2">
                <input className={inputClass} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
            </div>
            <Field label="Address">
              <textarea className={inputClass} rows={2} value={draft.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className={inputClass} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            {companies.length > 0 ? (
              <Field label="Company" hint="Decides GST and the UEN on receipts. New sales only — old receipts keep theirs.">
                <select className={selectClass} value={draft.companyId} onChange={(e) => set({ companyId: e.target.value })}>
                  <option value="">Business profile (default)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.gstRegistered ? "" : " — no GST"}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
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
