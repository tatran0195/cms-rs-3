# Gemini & Agent Guidelines

## 🏢 Internal Company Platform Scope

This CMS platform is built exclusively for **internal company use**. It is **NOT** a public multi-tenant SaaS.

---

## 🚫 STRICT RULES FOR FUTURE AI ASSISTANTS

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
