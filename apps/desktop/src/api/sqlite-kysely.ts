/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import type { Database, Statement } from "better-sqlite3-multiple-ciphers";
import type { QueryResult } from "@streetwriters/kysely";

type SQLiteCompatibleType =
  | number
  | string
  | Uint8Array
  | Array<number>
  | bigint
  | null;

export class SQLite {
  sqlite?: Database;
  initialized = false;
  preparedStatements: Map<string, Statement<unknown[]>> = new Map();
  retryCounter: Record<string, number> = {};
  extensionsLoaded = false;

  constructor() {
    console.log("new sqlite worker");
  }

  async open(filePath: string) {
    if (this.sqlite) {
      console.error("Database is already initialized");
      return;
    }

    this.sqlite = require("better-sqlite3-multiple-ciphers")(
      filePath
    ).unsafeMode(true);
  }

  /**
   * Wrapper function for preparing SQL statements with caching
   * to avoid unnecessary computations.
   */
  async prepare(sql: string): Promise<Statement | undefined> {
    if (!this.sqlite) throw new Error("Database is not initialized.");
    try {
      const cached = this.preparedStatements.get(sql);
      if (cached !== undefined) return cached;

      const prepared = this.sqlite.prepare(sql);
      if (!prepared) return;

      this.preparedStatements.set(sql, prepared);

      // reset retry count on success
      this.retryCounter[sql] = 0;
      return prepared;
    } catch (ex) {
      console.error(ex);

      // statement prepare process can be flaky so retry at least 5 times
      // before giving up.
      if (this.retryCounter[sql] < 5) {
        this.retryCounter[sql] = (this.retryCounter[sql] || 0) + 1;
        console.warn("Failed to prepare statement. Retrying:", sql);
        return this.prepare(sql);
      } else this.retryCounter[sql] = 0;

      if (ex instanceof Error) ex.message += ` (query: ${sql})`;
      throw ex;
    }
  }

  async exec<R>(
    sql: string,
    parameters: SQLiteCompatibleType[] = []
  ): Promise<QueryResult<R>> {
    const prepared = await this.prepare(sql);
    if (!prepared) return { rows: [] };
    try {
      if (prepared.reader) {
        return {
          rows: prepared.all(parameters) as R[]
        };
      } else {
        const { changes, lastInsertRowid } = prepared.run(parameters);
        const numAffectedRows =
          changes !== undefined && changes !== null && !isNaN(changes)
            ? BigInt(changes)
            : undefined;
        return {
          numAffectedRows,
          insertId:
            lastInsertRowid !== undefined && lastInsertRowid !== null
              ? typeof lastInsertRowid === "bigint"
                ? lastInsertRowid
                : BigInt(lastInsertRowid)
              : undefined,
          rows: [] as R[]
        };
      }
    } catch (e) {
      if (e instanceof Error) e.message += ` (query: ${sql})`;
      throw e;
    } finally {
      // Since SQLite 3.48.0 (SQLite3MC v2.0.2) it's not possible to load fts5
      // extensions before database has been decrypting. This is because
      // executing a `SELECT` now accesses the underlying databases resulting in
      // an error. Since FTS5 extensions depend on `SELECT fts5` to load the
      // fts5 API, we must wait decrypt the database before we can load
      // the extensions.
      if (!this.extensionsLoaded && (await this.isDatabaseReady())) {
        const betterTrigram = require("sqlite-better-trigram");
        const fts5Html = require("sqlite3-fts5-html");
        betterTrigram.load(this.sqlite);
        fts5Html.load(this.sqlite);
        this.extensionsLoaded = true;
      }
    }
  }

  async run<R>(
    sql: string,
    parameters?: SQLiteCompatibleType[]
  ): Promise<QueryResult<R>> {
    if (!this.sqlite) throw new Error("No database is not opened.");
    return await this.exec(sql, parameters);
  }

  async close() {
    if (!this.sqlite) return;

    this.preparedStatements.clear();
    this.sqlite.close();
    this.sqlite = undefined;
  }

  async delete(filePath: string) {
    await this.close();
    await require("fs/promises").rm(filePath, {
      force: true,
      maxRetries: 5,
      retryDelay: 500
    });
  }

  /**
   * This just executes `SELECT 1` on the database to make sure its ready.
   * On an encrypted database, this will fail until `PRAGMA key` has been
   * called.
   */
  private async isDatabaseReady() {
    // return this.exec(`SELECT 1;`)
    //   .then(() => true)
    //   .catch(() => false);
    if (!this.sqlite) return false;
    try {
      this.sqlite.prepare(`SELECT 1;`).run();
      return true;
    } catch {
      return false;
    }
  }
}
