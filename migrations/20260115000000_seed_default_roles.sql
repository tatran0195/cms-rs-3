-- Migration: Seed default roles for Workspace and Project
-- Ensures every workspace has default 'Member' and 'Viewer' roles,
-- and every project has default 'Member' and 'Viewer' roles.

-- 1. Seed Workspace default 'Member' role
INSERT INTO "OrganizationRole" (id, organization_id, name, description, is_default, permissions, created_at, updated_at)
SELECT
    uuid_generate_v4(),
    o.id,
    'Member',
    'Standard workspace member with access to projects and general settings.',
    true,
    '{
        "projects": {"create": true, "read": true, "edit": true, "delete": false},
        "members": {"create": false, "read": true, "edit": false, "delete": false},
        "roles": {"create": false, "read": true, "edit": false, "delete": false},
        "api_keys": {"create": false, "read": false, "edit": false, "delete": false},
        "audit_logs": {"read": false},
        "settings": {"read": true, "edit": false},
        "danger_zone": {"read": false, "delete": false}
    }'::jsonb,
    NOW(),
    NOW()
FROM "Organization" o
WHERE NOT EXISTS (
    SELECT 1 FROM "OrganizationRole" r WHERE r.organization_id = o.id AND r.is_default = true
);

-- 2. Seed Workspace 'Viewer' role
INSERT INTO "OrganizationRole" (id, organization_id, name, description, is_default, permissions, created_at, updated_at)
SELECT
    uuid_generate_v4(),
    o.id,
    'Viewer',
    'Read-only access to workspace projects and resources.',
    false,
    '{
        "projects": {"create": false, "read": true, "edit": false, "delete": false},
        "members": {"create": false, "read": true, "edit": false, "delete": false},
        "roles": {"create": false, "read": true, "edit": false, "delete": false},
        "api_keys": {"create": false, "read": false, "edit": false, "delete": false},
        "audit_logs": {"read": false},
        "settings": {"read": true, "edit": false},
        "danger_zone": {"read": false, "delete": false}
    }'::jsonb,
    NOW(),
    NOW()
FROM "Organization" o
WHERE NOT EXISTS (
    SELECT 1 FROM "OrganizationRole" r WHERE r.organization_id = o.id AND r.name = 'Viewer'
);

-- 3. Seed Project default 'Member' role
INSERT INTO "ProjectRole" (id, project_id, name, description, is_default, permissions, created_at, updated_at)
SELECT
    uuid_generate_v4(),
    p.id,
    'Member',
    'Standard project contributor who can create, edit, and publish documentation pages.',
    true,
    '{
        "pages": {"create": true, "read": true, "edit": true, "delete": true, "publish": true},
        "branches": {"create": true, "read": true, "edit": true, "delete": false},
        "deployments": {"create": true, "read": true, "delete": false, "publish": true},
        "domains": {"create": false, "read": true, "edit": false, "delete": false},
        "openapi": {"create": false, "read": true, "edit": true, "delete": false},
        "assets": {"create": true, "read": true, "edit": true, "delete": true},
        "addons": {"create": false, "read": true, "edit": false, "delete": false},
        "members": {"create": false, "read": true, "edit": false, "delete": false},
        "roles": {"create": false, "read": true, "edit": false, "delete": false},
        "analytics": {"read": true},
        "comments": {"create": true, "read": true, "edit": true, "delete": true},
        "danger_zone": {"read": false, "delete": false}
    }'::jsonb,
    NOW(),
    NOW()
FROM "Project" p
WHERE NOT EXISTS (
    SELECT 1 FROM "ProjectRole" r WHERE r.project_id = p.id AND r.is_default = true
);

-- 4. Seed Project 'Viewer' role
INSERT INTO "ProjectRole" (id, project_id, name, description, is_default, permissions, created_at, updated_at)
SELECT
    uuid_generate_v4(),
    p.id,
    'Viewer',
    'Read-only viewer of project documentation and previews.',
    false,
    '{
        "pages": {"create": false, "read": true, "edit": false, "delete": false, "publish": false},
        "branches": {"create": false, "read": true, "edit": false, "delete": false},
        "deployments": {"create": false, "read": true, "delete": false, "publish": false},
        "domains": {"create": false, "read": true, "edit": false, "delete": false},
        "openapi": {"create": false, "read": true, "edit": false, "delete": false},
        "assets": {"create": false, "read": true, "edit": false, "delete": false},
        "addons": {"create": false, "read": true, "edit": false, "delete": false},
        "members": {"create": false, "read": true, "edit": false, "delete": false},
        "roles": {"create": false, "read": true, "edit": false, "delete": false},
        "analytics": {"read": true},
        "comments": {"create": false, "read": true, "edit": false, "delete": false},
        "danger_zone": {"read": false, "delete": false}
    }'::jsonb,
    NOW(),
    NOW()
FROM "Project" p
WHERE NOT EXISTS (
    SELECT 1 FROM "ProjectRole" r WHERE r.project_id = p.id AND r.name = 'Viewer'
);

-- 5. Backfill existing workspace members without role_id
UPDATE "Member" m
SET role_id = r.id
FROM "OrganizationRole" r
WHERE m.organization_id = r.organization_id
  AND r.is_default = true
  AND m.role_id IS NULL
  AND m.role = 'MEMBER';

-- 6. Backfill existing project members without role_id
UPDATE "ProjectMember" pm
SET role_id = r.id
FROM "ProjectRole" r
WHERE pm.project_id = r.project_id
  AND r.is_default = true
  AND pm.role_id IS NULL
  AND pm.role = 'member';
