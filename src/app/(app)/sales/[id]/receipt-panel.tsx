"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Alert, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { isValidEmail } from "@/lib/contact";
import { formatDateTime } from "@/lib/time";

type EmailLog = { id: string; toEmail: string; status: "SENT" | "FAILED"; error: string | null; sentBy: string | null; createdAt: string };

/** Sale page: print / reprint, email the e-receipt, WhatsApp it, copy the customer link. */
export function ReceiptPanel({
  saleId,
  printCount,
  defaultEmail,
  emailConfigured,
  whatsappUrl,
  whatsappTo,
  link,
  history,
}: {
  saleId: string;
  printCount: number;
  defaultEmail: string;
  emailConfigured: boolean;
  whatsappUrl: string;
  whatsappTo: string | null;
  link: string | null;
  history: EmailLog[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function send() {
    const address = email.trim();
    if (!isValidEmail(address)) {
      setMessage({ tone: "red", text: "Enter a valid email address" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiRequest<{ sentTo: string }>(`/api/sales/${saleId}/receipt/email`, { body: { email: address } });
      setMessage({ tone: "green", text: `E-receipt sent to ${result.sentTo}` });
    } catch (err) {
      setMessage({ tone: "red", text: errorMessage(err) });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the e-receipt link:", link);
    }
  }

  return (
    <Card>
      <CardHeader title="Receipt" description="Print, email or WhatsApp the receipt. The content never changes after the sale." />
      <div className="space-y-4 px-5 py-4">
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

        <div className="flex flex-wrap items-center gap-2">
          <a href={`/receipt/${saleId}?print=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Icon name="printer" className="h-4 w-4" /> {printCount > 0 ? "Reprint" : "Print"}
          </a>
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Icon name="chat" className="h-4 w-4" /> WhatsApp
          </a>
          {link ? (
            <Button variant="ghost" onClick={copyLink}>
              {copied ? "Link copied" : "Copy e-receipt link"}
            </Button>
          ) : null}
          <span className="text-xs text-slate-500">
            {printCount > 0 ? `Printed ${printCount}× — further prints say REPRINT` : "Not printed yet"}
            {whatsappTo ? "" : " · no phone number on this sale: WhatsApp will ask who to send to"}
          </span>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              className={`${inputClass} max-w-sm`}
              placeholder="customer@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
              aria-label="Customer email"
            />
            <Button onClick={send} loading={busy} disabled={!emailConfigured}>
              <Icon name="mail" className="h-4 w-4" /> {history.some((h) => h.status === "SENT") ? "Resend e-receipt" : "Email e-receipt"}
            </Button>
          </div>
          {!emailConfigured ? (
            <p className="mt-1 text-xs text-amber-700">Email sending is not set up yet — the owner can check it under Settings.</p>
          ) : null}
        </div>

        {history.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2">
                  {h.status === "SENT" ? <Badge tone="green">Sent</Badge> : <Badge tone="red">Failed</Badge>}
                  <span>{h.toEmail}</span>
                  {h.error ? <span className="text-xs text-rose-600">{h.error}</span> : null}
                </span>
                <span className="text-xs text-slate-500">
                  {formatDateTime(h.createdAt)}
                  {h.sentBy ? ` · ${h.sentBy}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
