-- Enterprise Production-Grade Export Snapshots and Jobs Migration
-- Adds deployment revision audit, page counts, direct project indexing, and rich artifact metadata.

-- 1. Enhance ExportSnapshot with point-in-time deployment version and pages count
ALTER TABLE "ExportSnapshot"
    ADD COLUMN IF NOT EXISTS deployment_version BIGINT,
    ADD COLUMN IF NOT EXISTS pages_count INTEGER NOT NULL DEFAULT 0;

-- 2. Enhance ExportJob with direct project reference, trigger mode, and multiple formats
ALTER TABLE "ExportJob"
    ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES "Project"(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS trigger TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS formats TEXT[] DEFAULT ARRAY['MARKDOWN']::TEXT[];

-- 3. Enhance ExportArtifact with format and 64-bit size
ALTER TABLE "ExportArtifact"
    ADD COLUMN IF NOT EXISTS format TEXT,
    ADD COLUMN IF NOT EXISTS size BIGINT NOT NULL DEFAULT 0;

-- 4. Backfill project_id on existing ExportJob records from their linked ExportSnapshot
UPDATE "ExportJob" j
SET project_id = s.project_id
FROM "ExportSnapshot" s
WHERE j.snapshot_id = s.id
  AND j.project_id IS NULL;

-- 5. Backfill ExportArtifact size from file_size if present
UPDATE "ExportArtifact"
SET size = file_size
WHERE size = 0 AND file_size > 0;

-- 6. Performance indexes for enterprise scale
CREATE INDEX IF NOT EXISTS "ExportJob_project_id_created_at_idx"
    ON "ExportJob" (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS "ExportJob_snapshot_id_idx"
    ON "ExportJob" (snapshot_id);

CREATE INDEX IF NOT EXISTS "ExportSnapshot_project_id_idx"
    ON "ExportSnapshot" (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS "ExportArtifact_job_id_idx"
    ON "ExportArtifact" (job_id);
