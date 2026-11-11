"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";

const SHOP_KEY = "pos.shopCode";

export function LoginForm() {
  const [shopCode, setShopCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SHOP_KEY);
      if (saved) setShopCode(saved);
    } catch {
      // storage unavailable — ignore
    }
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/auth/login", { body: { shopCode, email, password }, noAuthRedirect: true });
      try {
        window.localStorage.setItem(SHOP_KEY, shopCode.trim().toLowerCase());
      } catch {
        // ignore
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-xl">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Shop code" hint="Given by your administrator, e.g. mobilerelation">
        <input
          className={inputClass}
          value={shopCode}
          onChange={(e) => setShopCode(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
      </Field>
      <Field label="Email">
        <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </Field>
      <Field label="Password">
        <input
          className={inputClass}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" className="w-full" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}
