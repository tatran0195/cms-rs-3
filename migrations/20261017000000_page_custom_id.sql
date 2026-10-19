-- Add custom_id column to Page table for stable identifier lookup
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS custom_id TEXT;

-- Create index for fast project_id + custom_id lookup
CREATE INDEX IF NOT EXISTS idx_page_project_custom_id ON "Page" (project_id, custom_id) WHERE custom_id IS NOT NULL;
