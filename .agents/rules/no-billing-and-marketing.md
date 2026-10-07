# Rule: Internal Company Scope - No Plan/Billing & No Marketing

## Context

This repository is configured and maintained exclusively for **internal company use**. It does not serve public consumers or third-party tenants.

## Architectural Mandates

1. **No Plan, Billing, or Invoicing**:
   - The application does not have a subscription or pricing model.
   - Do not add `PlanSection`, `plan` tabs, or billing links to project or workspace settings.
   - Do not integrate external payment providers (Stripe, Polar, LemonSqueezy, etc.).
   - Do not create soft/hard caps that gate user actions behind paid plan tiers.

2. **Homepage & Route Structure**:
   - The root path `/` redirects directly to `/app`.
   - `/app` is the primary entry point and dashboard.
   - Public marketing landing pages (`/pricing`, `/cloud`, `/compare/*`, `/alternatives/*`, `/blog/*`, `/about`, `/contact`, `/developers`, `/guides`) are permanently removed and must not be restored.
