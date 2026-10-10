import { requireRuntimeEnv } from '../src/support/env';

export default async function globalSetup(): Promise<void> {
  requireRuntimeEnv();
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4310';
  const urlsToCheck = [`${baseURL}/api/health`, 'http://localhost:3000/api/health'];

  let healthy = false;
  for (const url of urlsToCheck) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!healthy) {
    console.warn('Warning: Neither Vite studio nor cms-server responded to /api/health during global setup.');
  }
}
