// Prisma CLI config for the Control DB (SaaS management database).
// Usage: npx prisma <command> --config prisma.control.config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/control/schema.prisma",
  datasource: {
    // process.env (not env()) so that `prisma generate` works without a database URL (e.g. Docker build)
    url: process.env.CONTROL_DATABASE_URL ?? "",
  },
});
