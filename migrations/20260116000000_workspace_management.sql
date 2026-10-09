-- Workspace settings and invitations
CREATE TABLE IF NOT EXISTS "WorkspaceSettings" (
    id TEXT PRIMARY KEY DEFAULT 'default',
    name TEXT NOT NULL DEFAULT 'Company Workspace',
    slug TEXT NOT NULL DEFAULT 'workspace',
    logo_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "WorkspaceSettings" (id, name, slug)
VALUES ('default', 'Company Workspace', 'workspace')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS "WorkspaceInvitation" (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'member',
    token TEXT NOT NULL UNIQUE,
    invited_by TEXT REFERENCES "User"(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitation_email ON "WorkspaceInvitation"(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitation_token ON "WorkspaceInvitation"(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invitation_expires ON "WorkspaceInvitation"(expires_at);
