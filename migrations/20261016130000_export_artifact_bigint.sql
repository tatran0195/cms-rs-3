-- Align ExportArtifact.file_size to BIGINT matching Rust i64 and avoiding integer overflow
ALTER TABLE "ExportArtifact" ALTER COLUMN file_size TYPE BIGINT;

-- Ensure SQLITE is a valid ExportFormat enum value
ALTER TYPE "ExportFormat" ADD VALUE IF NOT EXISTS 'SQLITE';
