# @cms/app (Frontend Web Application)

This is the web client for the internal CMS platform, built with Vite, React, TanStack Router, and TanStack Query.

## Scope & Routing

This deployment is dedicated to **internal company use**:

- **Homepage (`/`)**: Redirects directly to `/app`.
- **Application (`/app`)**: Main workspace dashboard for authenticated company team members.
  - `/app` or `/app/(dashboard)/`: Projects overview, statistics, and quick creation.
  - `/app/sites`: Published and draft documentation sites.
  - `/app/analytics`: Global cross-project analytics.
  - `/app/settings`: Account profile and appearance preferences.
- **Project Workspace (`/app/projects/$projectId`)**:
  - `/app/projects/$projectId/`: Site dashboard and recent activity.
  - `/app/projects/$projectId/editor`: Full-featured Notion-style Markdown editor.
  - `/app/projects/$projectId/settings`: Administration (General, Languages, Custom Domains, Auth, Search, Git, OpenAPI, Members, etc.).
- **Documentation Viewer (`/sites/$projectId`)**: Reader interface for published company documentation.
- **Authentication (`/(auth)`)**: `/sign-in` and `/sign-up` for internal team members.

## Architectural Constraints

- **No Plan / Billing**: There are no plan tiers, subscription gates, or billing tabs. Do NOT re-implement plan sections or payment integrations.
- **No Marketing / Landing Pages**: There are no public marketing pages, blogs, or competitor comparisons. The root `/` must remain a direct redirect to `/app`.
