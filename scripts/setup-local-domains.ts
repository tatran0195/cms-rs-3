import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@nibleaf/database';

const newToken = (bytes = 12) => randomBytes(bytes).toString('hex');

const HOSTS_BLOCK_START = '# >>> nibleaf local test domains >>>';
const HOSTS_BLOCK_END = '# <<< nibleaf local test domains <<<';

const BASELINE_DOMAINS = ['nibleaf.local', 'app.nibleaf.local', 'docs.nibleaf.local', 'custom.local'];

function getHostsFilePath(): string {
  if (process.platform === 'win32') {
    const winDir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
    return resolve(winDir, 'System32', 'drivers', 'etc', 'hosts');
  }
  return '/etc/hosts';
}

function readHostsEntries(): { content: string; managedDomains: string[] } {
  const hostsPath = getHostsFilePath();
  if (!existsSync(hostsPath)) {
    return { content: '', managedDomains: [] };
  }
  const content = readFileSync(hostsPath, 'utf8');
  const managedDomains: string[] = [];

  const startIndex = content.indexOf(HOSTS_BLOCK_START);
  const endIndex = content.indexOf(HOSTS_BLOCK_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const block = content.slice(startIndex + HOSTS_BLOCK_START.length, endIndex);
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        managedDomains.push(...parts.slice(1));
      }
    }
  }

  return { content, managedDomains };
}

function updateHostsFile(
  domainsToAdd: string[],
  domainsToRemove: string[] = [],
): { success: boolean; requiresElevation: boolean; missingLines: string[] } {
  const hostsPath = getHostsFilePath();
  const { content, managedDomains } = readHostsEntries();

  const domainSet = new Set(managedDomains);
  for (const d of domainsToAdd) {
    domainSet.add(d.toLowerCase());
  }
  for (const d of domainsToRemove) {
    domainSet.delete(d.toLowerCase());
  }

  const newBlockLines = [
    HOSTS_BLOCK_START,
    '# Local testing domains for Nibleaf (app, default subdomains, and custom domains)',
    ...Array.from(domainSet).map((d) => `127.0.0.1 ${d}`),
    HOSTS_BLOCK_END,
  ];
  const newBlock = newBlockLines.join('\n');

  let updatedContent: string;
  const startIndex = content.indexOf(HOSTS_BLOCK_START);
  const endIndex = content.indexOf(HOSTS_BLOCK_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    updatedContent = content.slice(0, startIndex) + newBlock + content.slice(endIndex + HOSTS_BLOCK_END.length);
  } else {
    updatedContent = `${content.trimEnd()}\n\n${newBlock}\n`;
  }

  try {
    writeFileSync(hostsPath, updatedContent, 'utf8');
    return { success: true, requiresElevation: false, missingLines: [] };
  } catch {
    const missingLines = Array.from(domainSet).map((d) => `127.0.0.1 ${d}`);
    return { success: false, requiresElevation: true, missingLines };
  }
}

async function cmdSetup() {
  console.log('\n=== Nibleaf .local Domain Environment Setup ===\n');

  // 1. Check or update hosts file
  const hostsResult = updateHostsFile(BASELINE_DOMAINS);
  if (hostsResult.success) {
    console.log('✔ Successfully updated OS hosts file with baseline domains:');
    for (const d of BASELINE_DOMAINS) {
      console.log(`    127.0.0.1 ${d}`);
    }
  } else {
    console.log('⚠ Could not write to OS hosts file automatically (requires Administrator / root).');
    console.log(`  Please append the following entries to: ${getHostsFilePath()}\n`);
    console.log(`  ${HOSTS_BLOCK_START}`);
    for (const line of hostsResult.missingLines) {
      console.log(`  ${line}`);
    }
    console.log(`  ${HOSTS_BLOCK_END}\n`);
  }

  // 2. Query default project in database
  const project = await prisma.project.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, slug: true },
  });

  if (!project) {
    console.log('⚠ No project found in database. Please run "pnpm db:seed" first.');
    return;
  }

  console.log(`\n✔ Linked Project: "${project.name}" (slug: "${project.slug}", id: "${project.id}")`);

  // 3. Ensure custom.local is verified for this project in prisma.domain
  const existingDomain = await prisma.domain.findUnique({
    where: { domain: 'custom.local' },
  });

  if (existingDomain) {
    if (!existingDomain.verified || existingDomain.projectId !== project.id) {
      await prisma.domain.update({
        where: { id: existingDomain.id },
        data: { projectId: project.id, verified: true, provider: 'INGRESS' },
      });
      console.log('✔ Updated test custom domain "custom.local" (verified: true, provider: INGRESS)');
    } else {
      console.log('✔ Test custom domain "custom.local" is active and verified.');
    }
  } else {
    await prisma.domain.create({
      data: {
        projectId: project.id,
        domain: 'custom.local',
        verificationToken: newToken(24),
        verified: true,
        provider: 'INGRESS',
      },
    });
    console.log('✔ Registered and verified test custom domain "custom.local" in database.');
  }

  console.log('\n--- Active Routing Summary ---');
  console.log('• App Dashboard:      http://nibleaf.local (or http://app.nibleaf.local)');
  console.log(`• Default Subdomain:  http://${project.slug}.nibleaf.local`);
  console.log('• Custom Domain:      http://custom.local');
  console.log('• Direct App Port:    http://localhost:4310');
  console.log('• Direct API Port:    http://localhost:4311');
  console.log('\nSetup complete! Ensure Nginx or reverse proxy is running on port 80.');
}

async function cmdAddCustom(domain: string, projectSlug?: string) {
  if (!domain) {
    console.error('Usage: tsx scripts/setup-local-domains.ts add-custom <domain> [projectSlug]');
    process.exit(1);
  }

  const cleanDomain = domain.toLowerCase().trim();

  const project = projectSlug
    ? await prisma.project.findFirst({ where: { slug: projectSlug } })
    : await prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!project) {
    console.error(projectSlug ? `Error: Project with slug "${projectSlug}" was not found.` : 'Error: No projects exist in database.');
    process.exit(1);
  }

  // Update or insert into prisma.domain
  const existing = await prisma.domain.findUnique({ where: { domain: cleanDomain } });
  if (existing) {
    await prisma.domain.update({
      where: { id: existing.id },
      data: { projectId: project.id, verified: true, provider: 'INGRESS' },
    });
    console.log(`✔ Updated existing domain "${cleanDomain}" to point to project "${project.name}" (verified: true).`);
  } else {
    await prisma.domain.create({
      data: {
        projectId: project.id,
        domain: cleanDomain,
        verificationToken: newToken(24),
        verified: true,
        provider: 'INGRESS',
      },
    });
    console.log(`✔ Created custom domain "${cleanDomain}" for project "${project.name}" (verified: true).`);
  }

  // Update hosts
  const hostsResult = updateHostsFile([cleanDomain]);
  if (hostsResult.success) {
    console.log(`✔ Added "127.0.0.1 ${cleanDomain}" to OS hosts file.`);
  } else {
    console.log(`⚠ Note: Please manually add "127.0.0.1 ${cleanDomain}" to ${getHostsFilePath()}`);
  }

  console.log(`\nReady: Visit http://${cleanDomain} (via Nginx) or test with:`);
  console.log(`curl -H "Host: ${cleanDomain}" http://localhost:4310/`);
}

async function cmdRemoveCustom(domain: string) {
  if (!domain) {
    console.error('Usage: tsx scripts/setup-local-domains.ts remove-custom <domain>');
    process.exit(1);
  }

  const cleanDomain = domain.toLowerCase().trim();
  const deleted = await prisma.domain.deleteMany({ where: { domain: cleanDomain } });
  console.log(`✔ Deleted ${deleted.count} database record(s) for "${cleanDomain}".`);

  updateHostsFile([], [cleanDomain]);
  console.log(`✔ Removed "${cleanDomain}" from managed hosts entries.`);
}

async function cmdList() {
  console.log('\n=== Nibleaf Active Domains & Projects ===\n');

  const { managedDomains } = readHostsEntries();
  const managedSet = new Set(managedDomains.map((d) => d.toLowerCase()));

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'asc' },
    include: { domains: true },
  });

  const baseDomain = process.env.SITE_BASE_DOMAIN || 'nibleaf.local';

  for (const p of projects) {
    console.log(`Project: "${p.name}" (slug: ${p.slug}, id: ${p.id})`);
    const defaultSub = `${p.slug}.${baseDomain}`;
    const subInHosts = managedSet.has(defaultSub) ? '✔ In hosts' : '✖ Not in hosts';
    console.log(`  └─ Default Subdomain: http://${defaultSub} [${subInHosts}]`);

    if (p.domains.length === 0) {
      console.log('  └─ Custom Domains:    (None connected)');
    } else {
      console.log('  └─ Custom Domains:');
      for (const d of p.domains) {
        const inHosts = managedSet.has(d.domain.toLowerCase()) ? '✔ In hosts' : '✖ Not in hosts';
        const verified = d.verified ? 'Verified' : 'Pending';
        console.log(`      • http://${d.domain} [${verified}] [${inHosts}]`);
      }
    }
    console.log();
  }
}

async function cmdTest(targetDomain?: string) {
  const domainsToTest = targetDomain ? [targetDomain] : ['nibleaf.local', 'docs.nibleaf.local', 'custom.local'];
  console.log('\n=== Testing Domain Resolution against Nibleaf App (port 4310) ===\n');

  for (const domain of domainsToTest) {
    process.stdout.write(`Testing Host "${domain}" ... `);
    try {
      const res = await fetch('http://localhost:4310/', {
        headers: { Host: domain },
        redirect: 'manual',
      });
      const location = res.headers.get('location');
      const text = await res.text();
      const isNotFound = text.includes('Published site not found');

      if (res.status === 200 && !isNotFound) {
        console.log('✔ HTTP 200 OK (Site Served)');
      } else if (res.status === 301 || res.status === 302 || res.status === 308) {
        console.log(`➜ HTTP ${res.status} Redirect to: ${location}`);
      } else if (isNotFound) {
        console.log('✖ HTTP 404 (Published site not found — check domain verification or slug)');
      } else {
        console.log(`➜ HTTP ${res.status}`);
      }
    } catch (err) {
      console.log(`✖ Connection Failed: ${(err as Error).message}`);
    }
  }
  console.log();
}

async function main() {
  const command = process.argv[2] || 'setup';

  try {
    switch (command) {
      case 'setup':
        await cmdSetup();
        break;
      case 'add-custom':
        await cmdAddCustom(process.argv[3] || '', process.argv[4]);
        break;
      case 'remove-custom':
        await cmdRemoveCustom(process.argv[3] || '');
        break;
      case 'list':
        await cmdList();
        break;
      case 'test':
        await cmdTest(process.argv[3]);
        break;
      default:
        console.log(`Unknown command: ${command}`);
        console.log('Available commands: setup, add-custom <domain> [slug], remove-custom <domain>, list, test [domain]');
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
