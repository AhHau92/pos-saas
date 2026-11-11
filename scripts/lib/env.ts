import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

/**
 * Makes sure .env exists (copied from .env.example) and has a real SESSION_SECRET,
 * then loads it into process.env. Used by `npm run setup` so first-time users
 * don't have to edit files by hand.
 */
export function ensureEnvFile(): void {
  if (!existsSync(".env")) {
    if (!existsSync(".env.example")) throw new Error(".env.example is missing — run this from the project folder");
    copyFileSync(".env.example", ".env");
    console.log("     created .env from .env.example");
  }
  const text = readFileSync(".env", "utf8");
  const line = /^SESSION_SECRET=(.*)$/m.exec(text);
  const current = line?.[1]?.trim().replace(/^"|"$/g, "") ?? "";
  if (!line || current.length < 32 || current.includes("replace-me")) {
    const secret = randomBytes(32).toString("hex");
    const next = line ? text.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET="${secret}"`) : `${text.trimEnd()}\nSESSION_SECRET="${secret}"\n`;
    writeFileSync(".env", next);
    console.log("     generated a random SESSION_SECRET in .env");
  }
  loadEnv({ quiet: true });
}

/** Fails early with a friendly message when PostgreSQL is not running / not reachable. */
export async function assertDatabaseReachable(connectionString: string): Promise<void> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    // 3D000 = database does not exist yet → fine, `prisma db push` creates it
    if (code === "3D000") return;
    const target = safeHost(connectionString);
    if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "ECONNRESET"].includes(code) || /timeout/i.test(String(error))) {
      throw new Error(
        [
          `Cannot connect to PostgreSQL at ${target}.`,
          "  Start the database first:  docker compose up -d db",
          "  Docker not installed? Install Docker Desktop: https://www.docker.com/products/docker-desktop/",
          "  数据库没有启动：请先安装并打开 Docker Desktop，然后执行  docker compose up -d db",
        ].join("\n"),
      );
    }
    if (code === "28P01" || code === "28000") {
      throw new Error(`PostgreSQL rejected the username/password in .env (${target}). Check CONTROL_DATABASE_URL.`);
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function safeHost(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}`;
  } catch {
    return "the configured host";
  }
}
