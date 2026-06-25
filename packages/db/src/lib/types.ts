// Shared db-handle types. Every data-access module took a `db` parameter typed
// as `PostgresJsDatabase<typeof schema>` and re-declared it locally; this is the
// one definition they all import. `Tx` is the open-transaction handle the
// transactional writes pass to their in-txn helpers.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../schema/index.js";

export type Db = PostgresJsDatabase<typeof schema>;

// The open-transaction handle — the canonical drizzle idiom for "the tx a
// `db.transaction(async (tx) => …)` callback receives".
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// A query runner that is either the pooled db or an open transaction. Lets a
// helper run on its own or join a caller's transaction (e.g. logModAction).
export type Executor = Db | Tx;
