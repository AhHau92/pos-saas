"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";

type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

type Draft = Omit<Supplier, "id"> & { id: string | null };

const EMPTY: Draft = { id: null, name: "", contactName: "", phone: "", email: "", address: "", notes: "", isActive: true };

export function SupplierManager({ suppliers, canManage }: { suppliers: Supplier[]; canManage: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const body = {
      name: draft.name,
      contactName: draft.contactName || null,
      phone: draft.phone || null,
      email: draft.email || null,
      address: draft.address || null,
      notes: draft.notes || null,
      isActive: draft.isActive,
    };
    try {
      if (draft.id) await apiRequest(`/api/suppliers/${draft.id}`, { method: "PUT", body });
      else await apiRequest("/api/suppliers", { body });
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              setError(null);
              setDraft({ ...EMPTY });
            }}
          >
            <Icon name="plus" className="h-4 w-4" /> New supplier
          </Button>
        </div>
      ) : null}
      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title="No suppliers yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium text-slate-900">{s.name}</Td>
                  <Td>{s.contactName ?? "—"}</Td>
                  <Td>{s.phone ?? "—"}</Td>
                  <Td>{s.email ?? "—"}</Td>
                  <Td>{s.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  <Td className="text-right">
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setError(null);
                          setDraft({ ...s });
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={draft !== null}
        title={draft?.id ? "Edit supplier" : "New supplier"}
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
            <Field label="Company name">
              <input className={inputClass} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact person">
                <input className={inputClass} value={draft.contactName ?? ""} onChange={(e) => set({ contactName: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className={inputClass} value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
            </div>
            <Field label="Email">
              <input className={inputClass} value={draft.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Address">
              <textarea className={inputClass} rows={2} value={draft.address ?? ""} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className={inputClass} rows={2} value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className={checkboxClass} checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
              Active
            </label>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
