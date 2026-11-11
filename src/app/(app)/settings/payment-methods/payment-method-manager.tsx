"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, Table, Td, Th } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";

type Method = { id: string; name: string; isCash: boolean; isActive: boolean; sortOrder: number };
type Draft = { id: string | null; name: string; isCash: boolean; isActive: boolean; sortOrder: number };

export function PaymentMethodManager({ methods }: { methods: Method[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const body = { name: draft.name, isCash: draft.isCash, isActive: draft.isActive, sortOrder: draft.sortOrder };
    try {
      if (draft.id) await apiRequest(`/api/payment-methods/${draft.id}`, { method: "PUT", body });
      else await apiRequest("/api/payment-methods", { body });
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
            setDraft({ id: null, name: "", isCash: false, isActive: true, sortOrder: (methods.length + 1) * 10 });
          }}
        >
          <Icon name="plus" className="h-4 w-4" /> New method
        </Button>
      </div>
      <Card className="max-w-2xl">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th className="text-right">Order</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {methods.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium text-slate-900">{m.name}</Td>
                <Td>{m.isCash ? <Badge tone="green">Cash</Badge> : <Badge>Non-cash</Badge>}</Td>
                <Td className="text-right tabular-nums">{m.sortOrder}</Td>
                <Td>{m.isActive ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setError(null);
                      setDraft({ ...m });
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
        title={draft?.id ? "Edit payment method" : "New payment method"}
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
            <Field label="Name">
              <input className={inputClass} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. GrabPay" />
            </Field>
            <Field label="Display order">
              <input
                type="number"
                className={`${inputClass} w-28`}
                value={draft.sortOrder}
                onChange={(e) => set({ sortOrder: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className={checkboxClass} checked={draft.isCash} onChange={(e) => set({ isCash: e.target.checked })} />
              Cash (can give change)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className={checkboxClass} checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
              Active (shown on POS)
            </label>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
