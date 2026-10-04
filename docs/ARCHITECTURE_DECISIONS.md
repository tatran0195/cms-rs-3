# Architecture Decision Records (ADRs)

## ADR 001: Internal Company Platform Scope & Removal of Marketing / Plan Billing

### Status
Accepted & Enforced

### Date
2026-10-04

### Context
The original codebase included marketing landing pages, SEO comparisons, external SaaS blog articles, Arabic marketing guides, and placeholder "Plan & Billing" sections designed for a public commercial SaaS product.

The organization uses this CMS platform strictly for **internal company use**. Within an enterprise/internal deployment:
- End-users are employees and internal teams, not external buyers.
- There are no subscription tiers, paid upgrades, or billing cycles.
- There is no need for marketing funnels, comparison roundups, or public landing pages.
- The root route `/` should immediately route users to their actual workspace (`/app`).

### Decision
1. **Root Route Behavior**:
   - `/` immediately redirects to `/app` (which guards and redirects unauthenticated users to `/sign-in`).
   - `/app` is the primary application homepage.
2. **Permanent Removal of Plan & Billing**:
   - Removed all `PlanSection` components and `plan` settings tabs.
   - Removed `BETA_LIMITS` and billing manage rows.
   - Usage meters (`/usage`) represent operational diagnostics, not billing meters.
   - **Constraint**: Future contributors and AI assistants MUST NOT re-introduce, scaffold, or recover Plan/Billing/Pricing features or payment gateways.
3. **Permanent Removal of Marketing, Landing, and Blog**:
   - Removed all marketing routes (`/pricing`, `/cloud`, `/about`, `/contact`, `/developers`, `/guides`, `/self-hosting`, `/terms`, `/privacy`, `/compare/*`, `/alternatives/*`, `/ar/*`, `/tools/*`, `/blog/*`).
   - Removed marketing SEO schemas, analytics consent banners, and blog MDX collections.
   - **Constraint**: Future contributors and AI assistants MUST NOT create promotional landing pages at `/` or marketing hubs.

### Consequences
- Clean, focused codebase with zero dead marketing or billing code.
- Fast application boot and streamlined bundle size.
- Direct navigation into the internal documentation workspace.
