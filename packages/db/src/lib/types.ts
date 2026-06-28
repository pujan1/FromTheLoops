import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../schema/index.js";

export type Db = PostgresJsDatabase<typeof schema>;

// The open-transaction handle a db.transaction(tx => …) callback receives.
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Either the pooled db or an open tx — lets a helper run alone or join a tx.
export type Executor = Db | Tx;
