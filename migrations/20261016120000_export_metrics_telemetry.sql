-- Add metrics JSONB column to ExportJob for fine-grained performance telemetry
ALTER TABLE "ExportJob"
    ADD COLUMN IF NOT EXISTS metrics JSONB;
