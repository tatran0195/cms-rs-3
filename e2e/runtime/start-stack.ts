import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const runtimeDir = resolve(root, 'target', 'e2e-runtime');
const uploadsDir = resolve(runtimeDir, 'uploads');
const indexDir = resolve(runtimeDir, 'indexes');
const mailDir = resolve(root, 'target', 'e2e-mail');
const distDir = resolve(root, 'dist', 'frontend');
const serverExe = resolve(root, 'target', 'debug', 'cms-server.exe');

mkdirSync(uploadsDir, { recursive: true });
mkdirSync(indexDir, { recursive: true });
mkdirSync(mailDir, { recursive: true });

async function isPortOpen(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (await isPortOpen(3000)) {
    console.log('[stack] cms-server is already running and healthy at http://127.0.0.1:3000');
    return;
  }

  console.log('[stack] Starting SMTP sink on :1025...');
  const smtpProcess = spawn('python', ['e2e/runtime/smtp_sink.py', '1025', mailDir], {
    cwd: root,
    stdio: 'inherit',
    detached: false,
  });

  smtpProcess.on('error', (err) => {
    console.error('[smtp] error:', err);
  });

  console.log('[stack] Starting cms-server on :3000...');
  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CMS_ENV: 'e2e',
    CMS_SERVER__HOST: '127.0.0.1',
    CMS_SERVER__PORT: '3000',
    CMS_SERVER__HTTPS: 'false',
    CMS_DATABASE__URL: 'postgres://postgres:postgres!Tsvs7345@127.0.0.1:5432/cms_e2e',
    CMS_DATABASE__MAX_POOL_SIZE: '10',
    CMS_AUTH__SESSION_SECRET: 'cms-e2e-session-secret',
    CMS_AUTH__JWT_SECRET: 'cms-e2e-jwt-secret',
    CMS_MAILER__SMTP_HOST: '127.0.0.1',
    CMS_MAILER__SMTP_PORT: '1025',
    CMS_MAILER__SMTP_USE_TLS: 'false',
    CMS_MAILER__SMTP_PLAIN_NO_TLS: 'true',
    CMS_MAILER__SMTP_USERNAME: '',
    CMS_MAILER__SMTP_PASSWORD: '',
    CMS_MAILER__FROM_EMAIL: 'no-reply@cms-e2e.local',
    CMS_MAILER__FROM_NAME: 'CMS E2E',
    CMS_STORAGE__BACKEND: 'local',
    CMS_STORAGE__LOCAL_ROOT: uploadsDir,
    CMS_SEARCH__BACKEND: 'tantivy',
    CMS_SEARCH__INDEX_DIR: indexDir,
    CMS_SEARCH__VECTOR_SEARCH_ENABLED: 'false',
    CMS_QUEUE__BACKEND: 'postgres',
    CMS_ANALYTICS__BACKEND: 'postgres',
    CMS_ADMIN_ORIGIN__ENFORCE: 'false',
    CMS_ADMIN_ORIGIN__ALLOW_LOCALHOST: 'true',
    CMS_SECURITY_HEADERS__ENABLE_HSTS: 'false',
    FRONTEND_DIR: distDir,
    RUST_LOG: 'cms_server=info,cms_worker=info,warn',
  };

  const serverProcess = spawn(serverExe, [], {
    cwd: root,
    env: serverEnv,
    stdio: 'inherit',
    detached: false,
  });

  serverProcess.on('error', (err) => {
    console.error('[server] error:', err);
    process.exit(1);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[server] exited with code ${code}`);
    smtpProcess.kill();
    process.exit(code ?? 0);
  });

  // Wait for server to become healthy
  console.log('[stack] Waiting for cms-server to respond to /api/health...');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch('http://127.0.0.1:3000/api/health');
      if (res.ok) {
        console.log('[stack] cms-server is ready and healthy!');
        break;
      }
    } catch {
      // Keep waiting
    }
  }

  process.on('SIGINT', () => {
    serverProcess.kill();
    smtpProcess.kill();
    process.exit(0);
  });
}

main().catch(console.error);
