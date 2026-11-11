"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, Table, Td, Th } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/time";

type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  defaultOutletId: string | null;
  defaultOutletName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

type Draft = {
  id: string | null;
  name: string;
  email: string;
  role: Role;
  defaultOutletId: string;
  isActive: boolean;
  password: string;
};

const ROLES: Role[] = ["OWNER", "MANAGER", "CASHIER"];

export function UserManager({
  users,
  outlets,
  currentUserId,
}: {
  users: User[];
  outlets: { id: string; code: string; name: string }[];
  currentUserId: string;
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
    try {
      if (draft.id) {
        await apiRequest(`/api/users/${draft.id}`, {
          method: "PUT",
          body: {
            name: draft.name,
            role: draft.role,
            defaultOutletId: draft.defaultOutletId || null,
            isActive: draft.isActive,
            password: draft.password || undefined,
          },
        });
      } else {
        await apiRequest("/api/users", {
          body: {
            name: draft.name,
            email: draft.email,
            password: draft.password,
            role: draft.role,
            defaultOutletId: draft.defaultOutletId || null,
          },
        });
      }
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
            setDraft({ id: null, name: "", email: "", role: "CASHIER", defaultOutletId: outlets[0]?.id ?? "", isActive: true, password: "" });
          }}
        >
          <Icon name="plus" className="h-4 w-4" /> New user
        </Button>
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Outlet</Th>
              <Th>Status</Th>
              <Th>Last login</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium text-slate-900">
                  {u.name}
                  {u.id === currentUserId ? <span className="ml-1 text-xs text-slate-400">(you)</span> : null}
                </Td>
                <Td>{u.email}</Td>
                <Td>
                  <Badge tone={u.role === "OWNER" ? "purple" : u.role === "MANAGER" ? "indigo" : "gray"}>{ROLE_LABELS[u.role]}</Badge>
                </Td>
                <Td>{u.defaultOutletName ?? "—"}</Td>
                <Td>{u.isActive ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>}</Td>
                <Td className="text-xs text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setError(null);
                      setDraft({
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        role: u.role,
                        defaultOutletId: u.defaultOutletId ?? "",
                        isActive: u.isActive,
                        password: "",
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
        title={draft?.id ? "Edit user" : "New user"}
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
              <input className={inputClass} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Email (login)">
              <input className={inputClass} type="email" value={draft.email} disabled={draft.id !== null} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <select className={selectClass} value={draft.role} onChange={(e) => set({ role: e.target.value as Role })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Outlet" hint={draft.role === "CASHIER" ? "Cashiers work only at this outlet" : "Default outlet"}>
                <select className={selectClass} value={draft.defaultOutletId} onChange={(e) => set({ defaultOutletId: e.target.value })}>
                  <option value="">—</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} · {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={draft.id ? "New password (leave blank to keep)" : "Password"} hint="At least 8 characters">
              <input className={inputClass} type="password" value={draft.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
            </Field>
            {draft.id ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className={checkboxClass} checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                Active (can sign in)
              </label>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
