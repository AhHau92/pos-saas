import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { getTenantContext } from "@/lib/auth/context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getTenantContext()) redirect("/dashboard");
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-indigo-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg">
            <Icon name="phone" className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-white">{process.env.NEXT_PUBLIC_APP_NAME || "Phone POS"}</h1>
          <p className="mt-1 text-sm text-slate-300">Sign in to your shop</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
