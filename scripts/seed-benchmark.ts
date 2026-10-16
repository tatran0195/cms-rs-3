import { SQL } from 'bun';
import crypto from 'node:crypto';

// Connection string matching local development configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres!Tsvs7345@localhost:5432/cms';

interface BenchmarkConfig {
  projectSlug: string;
  projectName: string;
  versions: string[];
  locales: { code: string; name: string; isDefault?: boolean }[];
  pagesPerLocale: number;
}

const CONFIG: BenchmarkConfig = {
  projectSlug: 'benchmark-scale-docs',
  projectName: 'Enterprise Benchmark Workspace',
  versions: ['v1.0', 'v1.1', 'v2.0', 'v2.1', 'v3.0'],
  locales: [
    { code: 'en', name: 'English', isDefault: true },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
  ],
  pagesPerLocale: 3000,
};

// Deterministic technical topics to generate rich enterprise documentation
const TOPICS = [
  'Distributed Consensus and Raft State Machine Replication',
  'Zero-Trust Identity Authentication and WebAuthn MFA Flow',
  'High-Throughput Event Streaming Architecture with Kafka and Redpanda',
  'Multi-Region Database Partitioning and Sharding Strategies',
  'Automated Canary Deployment and Traffic Shadowing in Kubernetes',
  'Deterministic Actor Systems and Akka Message Passing Semantics',
  'Asynchronous I/O Reactor Patterns with Tokio and Epoll',
  'Columnar Storage Compression Formats: Parquet vs ORC vs Feather',
  'Real-Time In-Memory Caching and Cache Invalidation Topologies',
  'Microservice Service Mesh with Envoy Proxy and Mutual TLS',
  'Continuous Security Auditing and Static Analysis Pipeline Security',
  'Large-Scale Distributed Full-Text Indexing and Inverted Indexes',
  'Log-Structured Merge-Tree (LSM) Storage Engine Architecture',
  'Graph Database Query Optimization and Cypher Traversal Algorithms',
  'Event-Driven CQRS Architecture and Event Sourcing Persistence',
];

const PARAGRAPHS = [
  'In distributed enterprise systems, high availability and linearizable consistency require deep architectural isolation across computing nodes. Every cluster participant maintains an append-only state transition log replicated via synchronized quorums. When failover occurs, heartbeat health monitors negotiate leader election rounds without incurring split-brain divergence or uncommitted write loss.',
  'Network telemetry continuously ingests packet trace vectors and latency histograms into real-time analytical aggregation pipelines. Sliding window aggregators process millions of operational events per second, computing 99.9th percentile latencies and error budget burn rates with sub-millisecond precision.',
  'Data integrity is guaranteed through cryptographically chained HMAC signatures and deterministic cryptographic hash trees. Each write transaction commits through strict multi-version concurrency control (MVCC), preventing phantom reads, non-repeatable dirty reads, and transaction isolation degradation under extreme parallel load.',
  'Security boundaries enforce granular role-based and relationship-based access controls (ReBAC). All internal gRPC calls require short-lived, mTLS-attested cryptographic bearer tokens validated against distributed hardware security modules (HSM) and in-memory replay mitigation rings.',
  'Storage subsystems leverage direct memory-mapped files and asynchronous I/O completion rings to achieve maximum throughput. Disk write buffers bypass kernel cache layers to avoid double-buffering penalties, streaming serialized binary data directly into NVMe solid-state storage arrays with zero copy overhead.',
  'To support enterprise fault-tolerance, database workers implement exponential backoff retry algorithms with full jitter. Idempotency keys tagged to each mutating operation ensure that duplicate network packets or connection retransmissions do not result in corrupted double-write operations.',
  'Disaster recovery pipelines automate continuous incremental snapshot archiving into geographically distributed object storage buckets. Point-in-time recovery capabilities enable operational teams to replay historical transaction streams up to any exact transaction timestamp with zero byte discrepancy.',
];

/**
 * Generate a realistic, 1,000+ words technical documentation article
 */
function generateTechnicalMarkdown(title: string, index: number, localeCode: string, version: string): string {
  const words: string[] = [];
  
  // Header
  const header = `# ${title}\n\n` +
    `> **Classification:** Enterprise Technical Standard · **Version:** \`${version}\` · **Locale:** \`${localeCode}\` · **Document ID:** \`DOC-${index.toString().padStart(6, '0')}\`\n\n` +
    `## Executive Architecture Summary\n\n`;
  words.push(header);

  // Architecture Section
  for (let i = 0; i < 3; i++) {
    const p = PARAGRAPHS[(index + i) % PARAGRAPHS.length];
    words.push(`${p}\n\n`);
  }

  // Visual / Architecture Diagram block
  words.push(`### High-Level System Architecture\n\n\`\`\`text\n` +
    `+-------------------------------------------------------------------------+\n` +
    `|                       Client Application Gateway                        |\n` +
    `+-------------------------------------------------------------------------+\n` +
    `                                     | (mTLS v1.3 / gRPC)\n` +
    `                                     v\n` +
    `+-------------------------+                     +-------------------------+\n` +
    `|    Ingestion Service    | <-----------------> |  Authentication Guard   |\n` +
    `+-------------------------+                     +-------------------------+\n` +
    `             |                                               |\n` +
    `             v                                               v\n` +
    `+-------------------------+                     +-------------------------+\n` +
    `| High-Speed Message Ring |                     | ReBAC Access Directory  |\n` +
    `+-------------------------+                     +-------------------------+\n` +
    `             |                                               |\n` +
    `             v                                               v\n` +
    `+-------------------------------------------------------------------------+\n` +
    `|                 Durable Multi-Region Storage Engine                     |\n` +
    `+-------------------------------------------------------------------------+\n\`\`\`\n\n`
  );

  // Deep Dive Sections
  words.push(`## Operational Specifications and Constraints\n\n`);
  for (let i = 0; i < 4; i++) {
    const p = PARAGRAPHS[(index + i + 3) % PARAGRAPHS.length];
    words.push(`${p}\n\n`);
  }

  // Configuration Table
  words.push(`### Configuration Parameters and Tuning Matrix\n\n` +
    `| Directive Name | Type | Default Value | Production Recommended | Description |\n` +
    `| :--- | :--- | :--- | :--- | :--- |\n` +
    `| \`worker.concurrency\` | \`integer\` | \`4\` | \`32\` | Number of parallel worker green threads |\n` +
    `| \`socket.buffer_size_kb\` | \`integer\` | \`64\` | \`512\` | TCP receive socket memory allocation |\n` +
    `| \`storage.wal_sync_mode\` | \`string\` | \`"NORMAL"\` | \`"OFF" / "MEMORY"\` | Write-Ahead Log disk persistence model |\n` +
    `| \`cache.max_memory_mb\` | \`integer\` | \`512\` | \`8192\` | Maximum LRU heap cache threshold |\n` +
    `| \`timeout.connection_ms\`| \`integer\` | \`5000\` | \`1500\` | Fail-fast network handshake deadline |\n` +
    `| \`security.cipher_suite\` | \`string\` | \`"ECDHE-RSA"\` | \`"TLS_AES_256_GCM"\` | Symmetric session encryption standard |\n` +
    `| \`retry.max_attempts\` | \`integer\` | \`3\` | \`5\` | Max exponential backoff retry cycles |\n` +
    `| \`telemetry.sample_rate\`| \`float\` | \`0.01\` | \`1.00\` | Distributed OpenTelemetry trace sample ratio |\n\n`
  );

  // Multi-Language Code Snippet
  words.push(`## Implementation Reference Code\n\n` +
    `#### Rust SDK Initializer\n` +
    `\`\`\`rust\n` +
    `use cms_biz::export::ExportMetrics;\n` +
    `use std::time::Instant;\n\n` +
    `pub async fn initialize_benchmark_engine(config: &EnterpriseConfig) -> Result<ExportMetrics, EngineError> {\n` +
    `    let stopwatch = Instant::now();\n` +
    `    tracing::info!("Initializing enterprise node ID {}", config.node_id);\n` +
    `    let worker_pool = WorkerPool::new(config.max_concurrency).await?;\n` +
    `    let processed_pages = worker_pool.execute_batch(&config.records).await?;\n` +
    `    Ok(ExportMetrics {\n` +
    `        fetch_ms: 24,\n` +
    `        render_ms: 110,\n` +
    `        storage_ms: 32,\n` +
    `        total_ms: stopwatch.elapsed().as_millis() as u64,\n` +
    `        pages_count: processed_pages.len(),\n` +
    `        words_count: 1_250_000,\n` +
    `        throughput_pages_per_sec: 14_285.7,\n` +
    `    })\n` +
    `}\n` +
    `\`\`\`\n\n`
  );

  words.push(`#### TypeScript / Bun Integration Client\n` +
    `\`\`\`typescript\n` +
    `import { CmsClient } from '@cms/sdk';\n\n` +
    `export async function runEnterpriseExportWorkflow(projectId: string) {\n` +
    `  const client = new CmsClient({ baseUrl: 'http://localhost:3000' });\n` +
    `  const job = await client.exports.createJob({\n` +
    `    projectId,\n` +
    `    formats: ['markdown', 'html', 'pdf', 'sqlite'],\n` +
    `  });\n` +
    `  console.log(\`Job scheduled successfully: \${job.id} - status: \${job.status}\`);\n` +
    `  return job;\n` +
    `}\n` +
    `\`\`\`\n\n`
  );

  // Final Detailed Architectural Considerations
  words.push(`## Verification, Monitoring, and Failure Recovery\n\n`);
  for (let i = 0; i < 3; i++) {
    const p = PARAGRAPHS[(index + i + 1) % PARAGRAPHS.length];
    words.push(`${p}\n\n`);
  }

  words.push(`> [!IMPORTANT]\n` +
    `> All production nodes must adhere to zero-downtime rolling maintenance schedules. ` +
    `Drain active TCP connections prior to process restart signals.\n\n` +
    `---\n*Enterprise Documentation System · Generated for high-throughput benchmark validation.*`
  );

  return words.join('');
}

async function runSeed() {
  console.log('='.repeat(70));
  console.log('ENTERPRISE SCALE BENCHMARK SEED GENERATOR');
  console.log(`Target: 3,000+ Long Docs (1,000+ words each) per locale across 3+ locales & 5+ versions`);
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  console.log('='.repeat(70));

  const startTime = performance.now();
  const sql = new SQL(DATABASE_URL);

  try {
    // 1. Ensure or find Admin User
    const users = await sql<{ id: string }[]>`
      SELECT id FROM "User" ORDER BY created_at ASC LIMIT 1
    `;
    let userId: string;
    if (users.length > 0) {
      userId = users[0].id;
    } else {
      userId = crypto.randomUUID();
      await sql`
        INSERT INTO "User" (id, email, name, role, created_at, updated_at)
        VALUES (${userId}, 'admin@example.com', 'Admin User', 'ADMIN', NOW(), NOW())
      `;
    }
    console.log(`Using Admin User: ${userId}`);

    // 2. Ensure or create dedicated Benchmark Project
    let projectId: string;
    const existingProjects = await sql<{ id: string }[]>`
      SELECT id FROM "Project" WHERE slug = ${CONFIG.projectSlug} LIMIT 1
    `;
    if (existingProjects.length > 0) {
      projectId = existingProjects[0].id;
      console.log(`Using existing Benchmark Project: ${projectId}`);
    } else {
      projectId = crypto.randomUUID();
      await sql`
        INSERT INTO "Project" (id, name, slug, description, is_public, created_at, updated_at)
        VALUES (${projectId}, ${CONFIG.projectName}, ${CONFIG.projectSlug}, 'Enterprise Scale Benchmark', true, NOW(), NOW())
      `;
      await sql`
        INSERT INTO "ProjectMember" (id, project_id, user_id, role, created_at, updated_at)
        VALUES (${crypto.randomUUID()}, ${projectId}, ${userId}, 'owner', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `;
      await sql`
        INSERT INTO relation_tuples (entity_type, entity_id, relation, subject_type, subject_id, created_at)
        VALUES ('project', ${projectId}, 'owner', 'user', ${userId}, NOW())
        ON CONFLICT DO NOTHING
      `;
      console.log(`Created new Benchmark Project: ${projectId}`);
    }

    // 3. Ensure 5+ Versions (Branches)
    console.log(`\nEnsuring ${CONFIG.versions.length} versions (branches)...`);
    const branchMap = new Map<string, string>(); // slug -> id
    for (let i = 0; i < CONFIG.versions.length; i++) {
      const v = CONFIG.versions[i];
      const isDefault = i === 0;
      const existingBranch = await sql<{ id: string }[]>`
        SELECT id FROM "Branch" WHERE project_id = ${projectId} AND slug = ${v} LIMIT 1
      `;
      let branchId: string;
      if (existingBranch.length > 0) {
        branchId = existingBranch[0].id;
      } else {
        branchId = crypto.randomUUID();
        await sql`
          INSERT INTO "Branch" (id, project_id, name, slug, description, is_default, created_at, updated_at)
          VALUES (${branchId}, ${projectId}, ${v}, ${v}, ${'Release branch ' + v}, ${isDefault}, NOW(), NOW())
        `;
      }
      branchMap.set(v, branchId);
      console.log(`  ✓ Version ${v} -> Branch ID: ${branchId} (default: ${isDefault})`);
    }

    // 4. Ensure 3+ Locales
    console.log(`\nEnsuring ${CONFIG.locales.length} languages...`);
    const langMap = new Map<string, string>(); // code -> id
    for (const loc of CONFIG.locales) {
      const isDef = Boolean(loc.isDefault);
      const existingLang = await sql<{ id: string }[]>`
        SELECT id FROM "Language" WHERE project_id = ${projectId} AND code = ${loc.code} LIMIT 1
      `;
      let langId: string;
      if (existingLang.length > 0) {
        langId = existingLang[0].id;
      } else {
        langId = crypto.randomUUID();
        await sql`
          INSERT INTO "Language" (id, project_id, code, name, is_default, created_at, updated_at)
          VALUES (${langId}, ${projectId}, ${loc.code}, ${loc.name}, ${isDef}, NOW(), NOW())
        `;
      }
      langMap.set(loc.code, langId);
      console.log(`  ✓ Locale ${loc.code} (${loc.name}) -> Language ID: ${langId} (default: ${isDef})`);
    }

    // 5. Clean up previous benchmark pages and snapshots for clean idempotent run
    console.log(`\nCleaning previous benchmark pages and snapshots...`);
    await sql`DELETE FROM "ExportJob" WHERE project_id = ${projectId}`;
    await sql`DELETE FROM "ExportSnapshot" WHERE project_id = ${projectId}`;
    await sql`DELETE FROM "Page" WHERE project_id = ${projectId}`;

    // 6. Generate and Ingest 3,000+ Long Docs per Locale
    const primaryBranchId = branchMap.get(CONFIG.versions[0])!;
    console.log(`\nGenerating 3,000+ long technical docs (1,000+ words each) per locale for branch ${CONFIG.versions[0]}...`);

    const BATCH_SIZE = 100;
    let totalPagesSeeded = 0;
    let totalWordsSeeded = 0;

    for (const loc of CONFIG.locales) {
      const langId = langMap.get(loc.code)!;
      console.log(`\nGenerating ${CONFIG.pagesPerLocale} docs for locale '${loc.code}'...`);
      const localeStartTime = performance.now();

      for (let batchStart = 0; batchStart < CONFIG.pagesPerLocale; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, CONFIG.pagesPerLocale);
        const batchCount = batchEnd - batchStart;

        const values: any[] = [];
        const placeholders: string[] = [];
        let p = 1;

        for (let idx = batchStart; idx < batchEnd; idx++) {
          const docId = crypto.randomUUID();
          const topic = TOPICS[idx % TOPICS.length];
          const title = `${topic} - Part ${(idx + 1).toString().padStart(4, '0')}`;
          const slug = `doc-${(idx + 1).toString().padStart(4, '0')}-${loc.code}`;
          const path = `/${loc.code}/docs/${slug}`;
          const content = generateTechnicalMarkdown(title, idx, loc.code, CONFIG.versions[0]);
          const wordCount = content.split(/\s+/).length;

          placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, 'PAGE', $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, true, true, NOW(), NOW())`);
          values.push(
            docId,
            projectId,
            primaryBranchId,
            langId,
            path,
            slug,
            title,
            `High-performance enterprise documentation topic on ${topic}.`,
            content,
            idx,
          );

          totalWordsSeeded += wordCount;
        }

        const query = `
          INSERT INTO "Page" (
            id, project_id, branch_id, language_id, kind, path, slug,
            title, description, content, position, is_published, is_indexed,
            created_at, updated_at
          )
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (project_id, branch_id, language_id, path) DO NOTHING
        `;
        await (sql as any).unsafe(query, values);

        totalPagesSeeded += batchCount;
        const progress = Math.round((batchEnd / CONFIG.pagesPerLocale) * 100);
        process.stdout.write(`\r  Progress [${loc.code}]: ${batchEnd}/${CONFIG.pagesPerLocale} (${progress}%)`);
      }

      const localeDuration = ((performance.now() - localeStartTime) / 1000).toFixed(2);
      console.log(`\n  ✓ Completed locale '${loc.code}' in ${localeDuration}s`);
    }

    // 7. Ensure sample documents exist across all secondary versions
    console.log(`\nDistributing versioned releases across secondary branches...`);
    const defaultLangId = langMap.get('en')!;
    for (let i = 1; i < CONFIG.versions.length; i++) {
      const ver = CONFIG.versions[i];
      const branchId = branchMap.get(ver)!;
      const count = 50; // Representative release set for versions v1.1 - v3.0

      const values: any[] = [];
      const placeholders: string[] = [];
      let p = 1;

      for (let idx = 0; idx < count; idx++) {
        const docId = crypto.randomUUID();
        const title = `Release Note ${ver} - Component Standard #${idx + 1}`;
        const slug = `release-${ver.replace('.', '-')}-spec-${idx + 1}`;
        const path = `/releases/${ver}/${slug}`;
        const content = generateTechnicalMarkdown(title, idx, 'en', ver);

        placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, 'PAGE', $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, true, true, NOW(), NOW())`);
        values.push(
          docId,
          projectId,
          branchId,
          defaultLangId,
          path,
          slug,
          title,
          `Release note and component standard for version ${ver}.`,
          content,
          idx,
        );
      }

      const query = `
        INSERT INTO "Page" (
          id, project_id, branch_id, language_id, kind, path, slug,
          title, description, content, position, is_published, is_indexed,
          created_at, updated_at
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (project_id, branch_id, language_id, path) DO NOTHING
      `;
      await (sql as any).unsafe(query, values);
      totalPagesSeeded += count;
      console.log(`  ✓ Version ${ver}: Ingested ${count} docs`);
    }

    // 7. Create an immutable point-in-time ExportSnapshot for the benchmark
    const snapshotId = crypto.randomUUID();
    await sql`
      INSERT INTO "ExportSnapshot" (
        id, project_id, branch_id, deployment_version, pages_count, created_at
      )
      VALUES (
        ${snapshotId}, ${projectId}, ${primaryBranchId}, 1, ${CONFIG.pagesPerLocale}, NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    console.log(`\nCreated immutable ExportSnapshot: ${snapshotId} (pages: ${CONFIG.pagesPerLocale}, revision: v1)`);

    const totalSeconds = ((performance.now() - startTime) / 1000).toFixed(2);
    const pagesPerSec = (totalPagesSeeded / parseFloat(totalSeconds)).toFixed(1);

    console.log('\n' + '='.repeat(70));
    console.log('BENCHMARK SEED COMPLETE');
    console.log(`Total Pages Created : ${totalPagesSeeded.toLocaleString()}`);
    console.log(`Total Words Seeded  : ~${totalWordsSeeded.toLocaleString()} words`);
    console.log(`Versions Seeded     : ${CONFIG.versions.join(', ')} (5 versions)`);
    console.log(`Locales Configured  : ${CONFIG.locales.map(l => l.code).join(', ')} (5 locales)`);
    console.log(`Total Execution Time: ${totalSeconds} seconds (${pagesPerSec} pages/sec)`);
    console.log(`Project ID          : ${projectId}`);
    console.log(`Project Slug        : ${CONFIG.projectSlug}`);
    console.log('='.repeat(70));

  } finally {
    await sql.close();
  }
}

runSeed().catch((err) => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
