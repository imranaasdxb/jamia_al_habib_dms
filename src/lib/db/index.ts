import "server-only";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnvironment } from "@/lib/env";
import * as schema from "@/lib/db/schema";

function createDatabase() {
  const client = postgres(getServerEnvironment().DATABASE_URL, {
    ssl: "require",
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return drizzle(client, { schema });
}

let database: ReturnType<typeof createDatabase> | undefined;
type Database = ReturnType<typeof createDatabase>;
export type RequestDatabase = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface DatabaseIdentity {
  email?: string;
  authUserId?: string;
}

export async function withRequestDatabase<T>(
  identity: DatabaseIdentity,
  operation: (transaction: RequestDatabase) => Promise<T>,
): Promise<T> {
  database ??= createDatabase();
  return database.transaction(async (transaction) => {
    // The connection's owner privileges are dropped before any application query.
    // SET LOCAL and the identity context expire together when the transaction ends.
    await transaction.execute(sql`set local role dms_runtime`);
    await transaction.execute(sql`select
      set_config('row_security', 'on', true),
      set_config('statement_timeout', '10s', true),
      set_config('app.email', ${identity.email?.toLowerCase() ?? ""}, true),
      set_config('app.auth_user_id', ${identity.authUserId ?? ""}, true),
      set_config('app.person_id', '', true),
      set_config('app.role', '', true)`);
    return operation(transaction);
  });
}
