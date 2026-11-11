import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/auth/context";
import { PlatformLoginForm } from "./platform-login-form";

export const metadata: Metadata = { title: "Platform admin" };

export default async function PlatformLoginPage() {
  if (await getPlatformAdmin()) redirect("/platform");
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-white">Platform admin</h1>
          <p className="mt-1 text-sm text-slate-400">Manage tenants, plans and subscriptions</p>
        </div>
        <PlatformLoginForm />
      </div>
    </div>
  );
}
