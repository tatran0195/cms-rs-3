# Agent Guidelines & Repository Rules

## 🏢 Platform Purpose: Internal Company Deployment

This CMS platform is deployed exclusively for **internal company use**. It is **NOT** a public multi-tenant SaaS product.

---

## 🚫 Critical Constraints for Future AI Assistants

### 1. No Plan, Billing, or Pricing Features
**DO NOT attempt to re-introduce, recover, scaffold, or re-implement any Plan, Billing, or Subscription features:**
- **No Plan / Billing Sections**: Do **NOT** add `PlanSection`, `plan` tabs, or billing management to project settings (`/app/projects/$projectId/settings`), workspace settings (`/app/settings`), or dashboard overviews.
- **No Plan Tiers**: Do **NOT** add pricing tiers or subscription models (such as Free, Pro, Team, Enterprise, Self-Hosted vs Cloud pricing).
- **No Payment Gateways**: Do **NOT** integrate Stripe, Polar, LemonSqueezy, Paddle, or any payment gateway.
- **No Billing Quota Enforcement**: Do **NOT** block user features, restrict workspaces, or show upgrade/downgrade prompts based on billing plans or payment statuses.
- **Diagnostics vs Billing**: Diagnostic usage tracking (such as page counts or storage metrics) is strictly internal operational telemetry. It must never be tied to billing cycles, invoices, payment statuses, or plan tiers.

### 2. No Marketing, Landing, or Blog Pages
**DO NOT re-create marketing pages, promotional blogs, comparison roundups, or public landing sites:**
- **Homepage**: The root route `/` intentionally redirects directly to `/app`. The `/app` route serves as the primary application homepage for authenticated company team members.
- **No Marketing Landing Pages**: Do **NOT** replace `/` with a promotional or marketing landing page.
- **No Marketing Routes**: Do **NOT** add `/pricing`, `/cloud`, `/compare/*`, `/alternatives/*`, `/blog/*`, `/about`, `/contact`, `/developers`, `/guides` marketing hubs, or marketing SEO schemas.
- **Authentication**: Auth routes (`/sign-in`, `/sign-up`) are for internal team members and must not require public SaaS terms of service or privacy policy checkboxes.

---

## 🧭 Frontend Application Scope (`apps/studio`)

The frontend application (`@cms/studio`) consists strictly of:
1. **Application Shell (`/app`)**:
   - Workspace overview & project management (`/app`, `/app/(dashboard)/`)
   - Cross-project analytics (`/app/analytics`)
   - Sites listing (`/app/sites`)
   - Account & workspace settings (`/app/settings`) — profile and appearance only
2. **Project Workspace (`/app/projects/$projectId`)**:
   - Project dashboard overview (`/`)
   - Notion-style visual Markdown editor (`/editor`)
   - Preview (`/preview`)
   - Analytics (`/analytics`)
   - Project Settings (`/settings`) — General, Languages, Custom Domains, Authentication, Search, Addons, Git, OpenAPI, Content Import, Members, API Keys, Usage, Integrations, Notifications, Exports, Danger Zone. **(No Plan/Billing)**
3. **Published Documentation Viewer (`/sites/$projectId`)**:
   - Reader interface for published documentation sites.
4. **Authentication (`/(auth)`)**:
   - Internal login, signup, invitation acceptance, and password recovery.
