import { spawn } from 'node:child_process';

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
    const pass = passwordOf(this.url);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGCLIENTENCODING: 'UTF8',
      PGCONNECT_TIMEOUT: '10',
      ...(pass ? { PGPASSWORD: pass } : {}),
    };

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        'psql',
        [
          '-h',
          '127.0.0.1',
          '-p',
          String(new URL(this.url).port || 5432),
          '-U',
          userOf(this.url),
          '-d',
          dbOf(this.url),
          '-X',
          '-A',
          '-F',
          '\t',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        { env, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => {
        out += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk) => {
        err += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(out);
        } else {
          reject(new Error(`psql failed (code ${code}): ${err}`));
        }
      });
      child.stdin.write(`${rendered}\n`, 'utf8');
      child.stdin.end();
    });

    const lines = stdout
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => line.trim().length > 0 && !/^\(\d+ rows?\)$/.test(line.trim()));
    if (lines.length === 0) {
      return [];
    }
    const headers = lines[0]?.split('\t').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split('\t');
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        const cell = cells[index] ?? '';
        row[header] = cell === 't' ? 'true' : cell === 'f' ? 'false' : cell;
      });
      return row as T;
    });
  }

  async one<T = Record<string, string>>(sql: string, params: unknown[] = []): Promise<T> {
    const rows = await this.query<T>(sql, params);
    const first = rows[0];
    if (!first) {
      throw new Error(`Expected exactly one row from: ${sql}\nparams: ${JSON.stringify(params)}`);
    }
    return first;
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

function passwordOf(url: string): string | undefined {
  try {
    const password = new URL(url).password;
    return password ? decodeURIComponent(password) : undefined;
  } catch {
    return undefined;
  }
}

function dbOf(url: string): string {
  const segment = url.slice(url.lastIndexOf('/') + 1).split('?')[0];
  return segment ?? 'cms';
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
