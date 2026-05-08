import type { AppDb } from "./client.js";

export type Dbi = {
  kind: "sqlite" | "postgres";
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string, params?: unknown[]): Promise<void>;
  withTransaction<T>(fn: (tx: Dbi) => Promise<T>): Promise<T>;
};

function toSqlitePlaceholders(sql: string): string {
  return sql.replace(/\$(\d+)/g, "?");
}

function normalizeSqliteParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

function makeSqliteDbi(client: import("better-sqlite3").Database): Dbi {
  const dbi: Dbi = {
    kind: "sqlite",
    async query<T>(sql: string, params: unknown[] = []) {
      const stmt = client.prepare(toSqlitePlaceholders(sql));
      const rows = stmt.all(...normalizeSqliteParams(params)) as T[];
      return rows;
    },
    async exec(sql: string, params: unknown[] = []) {
      const stmt = client.prepare(toSqlitePlaceholders(sql));
      stmt.run(...normalizeSqliteParams(params));
    },
    async withTransaction<T>(fn: (tx: Dbi) => Promise<T>): Promise<T> {
      // better-sqlite3 transactions are synchronous; we serialize manually
      // around the async callback to avoid races on the single connection.
      client.exec("BEGIN");
      try {
        const result = await fn(dbi);
        client.exec("COMMIT");
        return result;
      } catch (err) {
        client.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return dbi;
}

function makePgDbi(pool: import("pg").Pool): Dbi {
  const dbi: Dbi = {
    kind: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async exec(sql: string, params: unknown[] = []) {
      await pool.query(sql, params);
    },
    async withTransaction<T>(fn: (tx: Dbi) => Promise<T>): Promise<T> {
      const conn = await pool.connect();
      const txDbi: Dbi = {
        kind: "postgres",
        async query<U>(sql: string, params: unknown[] = []) {
          const res = await conn.query(sql, params);
          return res.rows as U[];
        },
        async exec(sql: string, params: unknown[] = []) {
          await conn.query(sql, params);
        },
        withTransaction: async () => {
          throw new Error("nested transactions not supported");
        },
      };
      try {
        await conn.query("BEGIN");
        const result = await fn(txDbi);
        await conn.query("COMMIT");
        return result;
      } catch (err) {
        await conn.query("ROLLBACK");
        throw err;
      } finally {
        conn.release();
      }
    },
  };
  return dbi;
}

export function makeDbi(db: AppDb): Dbi {
  return db.kind === "sqlite" ? makeSqliteDbi(db.client) : makePgDbi(db.client);
}
