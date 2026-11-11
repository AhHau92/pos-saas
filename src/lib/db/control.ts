import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/control/client";

/** Prisma client for the Control DB (tenants, plans, subscriptions). */
export type ControlDb = PrismaClient;

const globalForControl = globalThis as unknown as { __posControlDb?: ControlDb };

function createControlClient(): ControlDb {
  const connectionString = process.env.CONTROL_DATABASE_URL;
  if (!connectionString) throw new Error("CONTROL_DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter });
}

/** Lazily created singleton (lazy so that `next build` never needs a database). */
export function getControlDb(): ControlDb {
  if (!globalForControl.__posControlDb) {
    globalForControl.__posControlDb = createControlClient();
  }
  return globalForControl.__posControlDb;
}

export async function disconnectControlDb(): Promise<void> {
  const client = globalForControl.__posControlDb;
  globalForControl.__posControlDb = undefined;
  if (client) await client.$disconnect();
}
