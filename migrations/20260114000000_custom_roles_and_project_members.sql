-- Migration: Project Custom Roles and Membership
-- Enables independent role permission matrices for Projects


-- 2. Project Custom Roles
CREATE TABLE IF NOT EXISTS "ProjectRole" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_role_default_uq" 
    ON "ProjectRole"(project_id) 
    WHERE is_default = true;

-- 3. Project Membership
CREATE TABLE IF NOT EXISTS "ProjectMember" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    role_id TEXT REFERENCES "ProjectRole"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS "project_member_user_idx" ON "ProjectMember"(user_id);
CREATE INDEX IF NOT EXISTS "project_member_project_idx" ON "ProjectMember"(project_id);
