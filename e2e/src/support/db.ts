import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Direct PostgreSQL access, used for *independent verification* only.
 *
 * The suite never writes application state through SQL: every entity under
 * test is created through the browser UI. This module exists so a test can
 * confirm that what the UI claimed (a release snapshot, a cascaded delete, a
 * language that must still be enabled) is actually persisted — a different
 * read path than the frontend's own API response.
 */
export interface QueryOptions {
  /** Fail instead of returning [] when the query returns no rows. */
  expectRows?: number;
}

export class Database {
  constructor(private readonly url: string) {}

  static fromEnv(): Database {
    const url = process.env.CMS_DATABASE__URL ?? 'postgres://postgres@127.0.0.1:5433/cms_e2e';
    return new Database(url);
  }

  /** Run a read-only query and return rows as plain objects. */
  async query<T = Record<string, string>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const rendered = interpolate(sql, params);
    const { stdout } = await execFileAsync(
      'psql',
      ['-h', '127.0.0.1', '-p', String(new URL(this.url).port || 5432), '-U', userOf(this.url), '-d', dbOf(this.url), '-X', '-A', '-F', '', '-v', 'ON_ERROR_STOP=1', '-c', rendered],
      { maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: '10' } },
    );
    // `-t` is deliberately absent: psql's header row is what names the columns.
    // psql appends a "(N rows)" footer to stdout; it is not data.
    const lines = stdout
      .split('\n')
      .filter((line) => line.trim().length > 0 && !/^\(\d+ rows?\)$/.test(line.trim()));
    if (lines.length === 0) {
      return [];
    }
    const headers = lines[0]!.split('');
    return lines.slice(1).map((line) => {
      const cells = line.split('');
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        // psql renders booleans as t/f; present them as true/false so tests can
        // compare against what the application actually stores.
        const cell = cells[index] ?? '';
        row[header] = cell === 't' ? 'true' : cell === 'f' ? 'false' : cell;
      });
      return row as T;
    });
  }

  async one<T = Record<string, string>>(sql: string, params: unknown[] = []): Promise<T> {
    const rows = await this.query<T>(sql, params);
    if (rows.length === 0) {
      throw new Error(`Expected exactly one row from: ${sql}\nparams: ${JSON.stringify(params)}`);
    }
    return rows[0]!;
  }

  /** Sum of a `count(*)`-style aggregate; 0 when the query yields no rows. */
  async count(sql: string, params: unknown[] = []): Promise<number> {
    const rows = await this.query<{ count: string }>(sql, params);
    if (rows.length === 0) return 0;
    return rows.reduce((total, row) => total + (Number(row.count) || 0), 0);
  }
}

function userOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).username || 'postgres');
  } catch {
    return 'postgres';
  }
}

function dbOf(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1).split('?')[0]!;
}

/**
 * Inline `$n` parameters as properly quoted SQL literals.
 *
 * Only ever used with values this suite itself generated; no user input from a
 * web form reaches a query.
 */
function interpolate(sql: string, params: unknown[]): string {
  let index = 0;
  return sql.replace(/\$(\d+)/g, (_match, rawIndex: string) => {
    index = Number(rawIndex);
    const value = params[index - 1];
    if (value === undefined || value === null) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  });
}