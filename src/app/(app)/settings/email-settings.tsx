"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { Alert, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { isValidEmail } from "@/lib/contact";

/** E-receipt email status (from the server's SMTP settings) and a test button. */
export function EmailSettings({
  status,
  replyTo,
}: {
  status: { configured: boolean; server: string | null; fromAddress: string | null };
  replyTo: string | null;
}) {
  const [to, setTo] = useState(replyTo ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiRequest<{ sentTo: string }>("/api/settings/test-email", { body: { to: to.trim() } });
      setMessage({ tone: "green", text: `Test email sent to ${result.sentTo}. Check the inbox (and the spam folder).` });
    } catch (err) {
      setMessage({ tone: "red", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="E-receipt email"
        description="Receipts are emailed to customers who give an email address at the POS."
        actions={status.configured ? <Badge tone="green">Set up</Badge> : <Badge tone="amber">Not set up</Badge>}
      />
      <div className="space-y-3 px-5 py-4 text-sm">
        {status.configured ? (
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[10rem_1fr]">
            <dt className="text-slate-500">Sent from</dt>
            <dd>{status.fromAddress}</dd>
            <dt className="text-slate-500">Mail server</dt>
            <dd>{status.server}</dd>
            <dt className="text-slate-500">Customer replies go to</dt>
            <dd>{replyTo ?? "— (add the business email above)"}</dd>
          </dl>
        ) : (
          <p className="text-slate-600">
            The mail server settings (SMTP_HOST, SMTP_USER, SMTP_PASSWORD …) are not in the server&apos;s .env file yet. Until
            then, email addresses are still saved with each sale and the receipt can be sent later from the sale page.
          </p>
        )}
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        {status.configured ? (
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              className={`${inputClass} max-w-sm`}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@example.com"
              aria-label="Send a test email to"
            />
            <Button variant="secondary" onClick={test} loading={busy} disabled={!isValidEmail(to.trim())}>
              Send test email
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
