-- Migration: 20260117000000_system_settings_and_onboarding.sql
-- Singleton table tracking system initialization and instance-wide auth & appearance policies
CREATE TABLE IF NOT EXISTS "SystemSettings" (
    id TEXT PRIMARY KEY DEFAULT 'default',
    is_initialized BOOLEAN NOT NULL DEFAULT false,
    initialized_at TIMESTAMPTZ,
    initialized_by TEXT REFERENCES "User"(id) ON DELETE SET NULL,
    allow_public_signup BOOLEAN NOT NULL DEFAULT false,
    require_email_verification BOOLEAN NOT NULL DEFAULT false,
    auth_providers JSONB NOT NULL DEFAULT '{"google": true, "github": true}'::jsonb,
    default_theme TEXT NOT NULL DEFAULT 'system',
    default_locale TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default singleton record if not existing
INSERT INTO "SystemSettings" (id, is_initialized)
VALUES ('default', false)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_system_settings_initialized ON "SystemSettings"(is_initialized);
