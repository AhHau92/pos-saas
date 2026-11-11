"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-10">
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <Alert>{error.message || "Unexpected error"}</Alert>
      <Button variant="secondary" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
