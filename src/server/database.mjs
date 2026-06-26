import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";

export function readTursoConfig() {
  const url = process.env.TURSO_DATABASE_URL || process.env.care_TURSO_DATABASE_URL || "";
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.care_TURSO_AUTH_TOKEN || "";
  return { url, authToken };
}

export async function createDatabase({ dbPath }) {
  const turso = readTursoConfig();
  if (turso.url) {
    const client = createClient({
      url: turso.url,
      authToken: turso.authToken,
    });
    await client.execute("PRAGMA foreign_keys = ON");
    return new LibsqlDatabase(client, "turso");
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const local = new DatabaseSync(dbPath);
  local.exec("PRAGMA journal_mode = WAL");
  local.exec("PRAGMA foreign_keys = ON");
  return new LocalSqliteDatabase(local, existsSync(dbPath) ? dbPath : "local-sqlite");
}

class LocalSqliteDatabase {
  constructor(db, label) {
    this.db = db;
    this.label = label;
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    const statement = this.db.prepare(sql);
    return {
      get: async (...args) => statement.get(...args),
      all: async (...args) => statement.all(...args),
      run: async (...args) => statement.run(...args),
    };
  }
}

class LibsqlDatabase {
  constructor(client, label) {
    this.client = client;
    this.label = label;
  }

  async exec(sql) {
    const statements = sql
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await this.client.execute(statement);
    }
  }

  prepare(sql) {
    return {
      get: async (...args) => {
        const result = await this.client.execute({ sql, args });
        return normalizeRow(result.rows[0]);
      },
      all: async (...args) => {
        const result = await this.client.execute({ sql, args });
        return result.rows.map(normalizeRow);
      },
      run: async (...args) => this.client.execute({ sql, args }),
    };
  }
}

function normalizeRow(row) {
  return row ? { ...row } : undefined;
}
