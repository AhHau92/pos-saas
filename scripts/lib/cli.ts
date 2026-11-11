import { disconnectControlDb } from "@/lib/db/control";
import { disconnectAllTenantDbs } from "@/lib/db/tenant";

/** Runs a CLI entry point, prints errors nicely and closes all DB pools so the process exits. */
export function runCli(main: () => Promise<void>): void {
  main()
    .then(async () => {
      await Promise.allSettled([disconnectControlDb(), disconnectAllTenantDbs()]);
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      console.error("\n✖", error instanceof Error ? error.message : error);
      await Promise.allSettled([disconnectControlDb(), disconnectAllTenantDbs()]);
      process.exit(1);
    });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}
