-- Migration: 20261012000000_medbrains_auth_rebac_tuples.sql
-- Integrates MedBrains Zanzibar ReBAC relation tuples, account security, and audit logging.

-- 1. Zanzibar ReBAC Relation Tuples
CREATE TABLE IF NOT EXISTS relation_tuples (
    tuple_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    object_type VARCHAR(64) NOT NULL,
    object_id UUID NOT NULL,
    relation VARCHAR(64) NOT NULL,
    subject_type VARCHAR(32) NOT NULL,
    subject_id VARCHAR(128) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    granted_by UUID,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relation_tuples_active_uniq 
    ON relation_tuples (tenant_id, object_type, object_id, relation, subject_type, subject_id) 
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_relation_tuples_lookup 
    ON relation_tuples (tenant_id, object_type, object_id, status);

CREATE INDEX IF NOT EXISTS idx_relation_tuples_reverse 
    ON relation_tuples (tenant_id, subject_id, status);

-- 2. User Account Security Enhancements
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
    ADD COLUMN IF NOT EXISTS mfa_recovery_codes TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- 3. API Key Enhancements
ALTER TABLE "ApiKey"
    ADD COLUMN IF NOT EXISTS prefix VARCHAR(16),
    ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';

-- 4. Security Audit Logs Table
CREATE TABLE IF NOT EXISTS security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    user_id TEXT,
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id TEXT,
    ip_address VARCHAR(45),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_action ON security_audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user ON security_audit_logs(user_id, created_at);

-- 5. Backfill: Initial Workspace Owner
INSERT INTO relation_tuples (tenant_id, object_type, object_id, relation, subject_type, subject_id)
SELECT 
    '00000000-0000-0000-0000-000000000000'::uuid,
    'workspace',
    '00000000-0000-0000-0000-000000000000'::uuid,
    'owner',
    'user',
    id
FROM "User"
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT DO NOTHING;

-- 6. Backfill: Project Members into Relation Tuples
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ProjectMember') THEN
        INSERT INTO relation_tuples (tenant_id, object_type, object_id, relation, subject_type, subject_id)
        SELECT 
            '00000000-0000-0000-0000-000000000000'::uuid,
            'project',
            project_id::uuid,
            LOWER(role),
            'user',
            user_id
        FROM "ProjectMember"
        WHERE project_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
