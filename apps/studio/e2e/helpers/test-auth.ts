import type { APIRequestContext } from '@playwright/test';

export interface TestSession {
  userId: string;
  email: string;
  name: string;
  sessionToken: string;
  cookieHeader: string;
}

export async function createAuthenticatedSession(request: APIRequestContext): Promise<TestSession> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const email = `playwright_${timestamp}_${randomSuffix}@test.local`;
  const password = `SecretPass123!_${randomSuffix}`;
  const name = `E2E Tester ${randomSuffix}`;

  // 1. Register user
  const registerRes = await request.post('/api/auth/register', {
    data: { email, password, name },
  });
  if (!registerRes.ok()) {
    const text = await registerRes.text();
    throw new Error(`Failed to register test user (${registerRes.status()}): ${text}`);
  }
  const registerData = await registerRes.json();
  const userId = registerData.id;

  // 2. Login to get session cookie
  const loginRes = await request.post('/api/auth/login', {
    data: { email, password },
  });
  if (!loginRes.ok()) {
    const text = await loginRes.text();
    throw new Error(`Failed to login test user (${loginRes.status()}): ${text}`);
  }

  // Extract session token from cookies
  const cookies = loginRes.headers()['set-cookie'] || '';
  const match = cookies.match(/better-auth\.session_token=([^;]+)/);
  const sessionToken = match ? match[1] : '';

  return {
    userId,
    email,
    name,
    sessionToken,
    cookieHeader: `better-auth.session_token=${sessionToken}`,
  };
}
