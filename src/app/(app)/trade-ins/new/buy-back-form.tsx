"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  draftTotal,
  emptyTradeInDraft,
  TradeInEditor,
  tradeInPayload,
  tradeInProblem,
  type TradeInDraft,
  type TradeInRules,
} from "@/components/tradein/tradein-editor";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";

export function BuyBackForm({
  currency,
  rules,
  paymentMethods,
}: {
  currency: string;
  rules: TradeInRules;
  paymentMethods: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<TradeInDraft>(() => emptyTradeInDraft());
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [payoutReference, setPayoutReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = draftTotal(draft);

  async function submit() {
    const problem = tradeInProblem(draft, rules) ?? (paymentMethodId ? null : "Choose how the customer is paid");
    if (problem) {
      setError(problem);
      return;
    }
    const method = paymentMethods.find((m) => m.id === paymentMethodId)?.name ?? "";
    if (!window.confirm(`Pay ${formatMoney(total, currency)} to ${draft.seller.name} by ${method}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ id: string }>("/api/trade-ins", {
        body: { ...tradeInPayload(draft), paymentMethodId, payoutReference: payoutReference.trim() || null },
      });
      router.push(`/trade-ins/${result.id}?created=1`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Card className="px-5 py-4">
        <TradeInEditor value={draft} onChange={setDraft} currency={currency} rules={rules} />
      </Card>
      <Card className="px-5 py-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Pay the customer by">
            <select className={selectClass} value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reference (optional)" hint="e.g. PayNow / bank transfer ref.">
            <input className={inputClass} value={payoutReference} onChange={(e) => setPayoutReference(e.target.value)} />
          </Field>
          <div className="flex items-end justify-end">
            <div className="text-right">
              <div className="text-xs text-slate-500">Pay to customer</div>
              <div className="text-2xl font-semibold tabular-nums">{formatMoney(total, currency)}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={submit} loading={busy}>
            Buy device{draft.devices.length > 1 ? "s" : ""} and pay
          </Button>
        </div>
      </Card>
    </div>
  );
}
