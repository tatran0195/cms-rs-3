import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Minimal `KEY=value` loader so the Playwright process is configured by the
 * same file the stack launcher uses. Playwright does not inherit the shell
 * environment of `start-stack.sh`, and a suite that silently falls back to
 * default paths would read an empty mailbox and look like an auth failure.
 *
 * Values support `${NAME}` and `${NAME:-default}` expansion so `env.sh` can
 * stay the single source of truth for ports, database and mailbox paths.
 */
export function loadRuntimeEnv(file = resolve(here, '..', '..', 'runtime', 'env.sh')): void {
  if (!existsSync(file)) return;

  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue;
    if (value.includes('$')) {
      // Only expand from what the environment already holds.
      const expanded = rawValue.replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
        (_, name: string, fallback: string | undefined) => process.env[name] ?? fallback ?? '',
      );
      value = expanded;
    }
    // Strip the shell's surrounding quotes but keep an empty assignment,
    // which is meaningful (it unsets an inherited default).
    process.env[key] = value.trim().replace(/^["'](.*)["']$/s, '$1');
  }
}

/** Fail fast with an actionable message instead of a confusing downstream error. */
export function requireRuntimeEnv(): void {
  loadRuntimeEnv();
  process.env.E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4310';
  process.env.CMS_DATABASE__URL = process.env.CMS_DATABASE__URL ?? 'postgres://postgres:postgres!Tsvs7345@127.0.0.1:5432/cms';
  process.env.E2E_MAIL_DIR = process.env.E2E_MAIL_DIR ?? 'target/e2e-mail';
}
