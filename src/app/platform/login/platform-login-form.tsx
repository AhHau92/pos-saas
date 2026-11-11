"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";

export function PlatformLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/platform/login", { body: { email, password }, noAuthRedirect: true });
      window.location.href = "/platform";
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-xl">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Email">
        <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password">
        <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Button type="submit" className="w-full" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}
