import { requireRuntimeEnv } from '../src/support/env';

export default async function globalSetup(): Promise<void> {
  requireRuntimeEnv();
  const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
  try {
    const res = await fetch(`${baseURL}/api/health`);
    if (!res.ok) {
      throw new Error(`Health check failed with status ${res.status}`);
    }
  } catch (err) {
    throw new Error(`CMS server is not running or healthy at ${baseURL}/api/health: ${err}`);
  }
}
