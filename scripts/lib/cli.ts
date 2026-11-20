import { disconnectControlDb } from "@/lib/db/control";
import { disconnectAllTenantDbs } from "@/lib/db/tenant";

const DB_DOWN_HINT = [
  "",
  "  Cannot reach PostgreSQL. Start the database first:  docker compose up -d db",
  "  数据库没有启动：请先打开 Docker Desktop（等它显示 Engine running），然后执行  docker compose up -d db",
].join("\n");

/** Error message plus its code / cause chain (Prisma driver-adapter errors keep the reason in `cause`). */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message.trim()];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === "string" && !parts.join(" ").includes(code)) parts.push(`code: ${code}`);
    if (!cause) break;
    parts.push(`cause: ${cause instanceof Error ? cause.message : JSON.stringify(cause)}`);
    current = cause;
  }
  const text = parts.filter(Boolean).join("\n");
  return /ECONNREFUSED|DatabaseNotReachable|Can't reach database|P1001|ETIMEDOUT/i.test(text) ? `${text}\n${DB_DOWN_HINT}` : text;
}

/** Runs a CLI entry point, prints errors nicely and closes all DB pools so the process exits. */
export function runCli(main: () => Promise<void>): void {
  main()
    .then(async () => {
      await Promise.allSettled([disconnectControlDb(), disconnectAllTenantDbs()]);
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      console.error("\n✖", describeError(error));
      await Promise.allSettled([disconnectControlDb(), disconnectAllTenantDbs()]);
      process.exit(1);
    });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}
