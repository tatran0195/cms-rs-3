import { SQL } from 'bun';

async function check() {
  const sql = new SQL('postgres://postgres:postgres!Tsvs7345@localhost:5432/cms');
  try {
    const jobs = await sql`
      SELECT id, format, status, metrics, started_at, completed_at, error_message
      FROM "ExportJob"
      ORDER BY created_at DESC
      LIMIT 5
    `;
    console.log('Recent ExportJobs:', JSON.stringify(jobs, null, 2));
  } finally {
    await sql.close();
  }
}

check();
