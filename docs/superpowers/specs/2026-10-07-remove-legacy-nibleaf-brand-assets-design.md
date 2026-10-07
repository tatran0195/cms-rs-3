# Design Specification: Remove Legacy Nibleaf Brand Assets

## Overview
Clean up obsolete `nibleaf-*` logo and brand assets from `apps/studio/public/brand` following the rebrand to TechnoStar. The codebase has transitioned to TechnoStar (`/brand/technostar-logo.png`, `/brand/technostar-star.png`, etc.), and no active code components reference the legacy Nibleaf files.

## Scope of Changes

### 1. File Deletions

#### SVGs in `apps/studio/public/brand/`
Remove all 19 legacy Nibleaf SVG files:
- `nibleaf-app-icon.svg`
- `nibleaf-favicon.svg`
- `nibleaf-icon-currentcolor.svg`
- `nibleaf-icon-monochrome.svg`
- `nibleaf-icon-reverse.svg`
- `nibleaf-icon.svg`
- `nibleaf-logo-dark.svg`
- `nibleaf-logo-horizontal-icon-right.svg`
- `nibleaf-logo-horizontal-ltr-reverse.svg`
- `nibleaf-logo-horizontal-ltr.svg`
- `nibleaf-logo-horizontal-reverse.svg`
- `nibleaf-logo-horizontal-rtl.svg`
- `nibleaf-logo-monochrome.svg`
- `nibleaf-logo-stacked-transparent.svg`
- `nibleaf-logo-stacked.svg`
- `nibleaf-og-card.svg`
- `nibleaf-sidebar-lockup.svg`
- `nibleaf-social-avatar.svg`
- `nibleaf-wordmark-reverse.svg`
- `nibleaf-wordmark.svg`

#### Raster files in `apps/studio/public/brand/raster/`
- **`raster/logo/`** (all 15 files):
  - `nibleaf-logo-dark.jpg`
  - `nibleaf-logo-dark.png`
  - `nibleaf-logo-horizontal-icon-right.png`
  - `nibleaf-logo-horizontal-ltr-reverse.png`
  - `nibleaf-logo-horizontal-ltr.png`
  - `nibleaf-logo-horizontal-reverse.png`
  - `nibleaf-logo-horizontal-rtl.png`
  - `nibleaf-logo-monochrome.png`
  - `nibleaf-logo-stacked-transparent.png`
  - `nibleaf-logo-stacked.jpg`
  - `nibleaf-logo-stacked.png`
  - `nibleaf-sidebar-lockup.png`
  - `nibleaf-wordmark-ar-reverse.png`
  - `nibleaf-wordmark-reverse.png`
  - `nibleaf-wordmark.png`
- **`raster/icon/`** (all 7 files):
  - `nibleaf-icon-1024.png`
  - `nibleaf-icon-128.png`
  - `nibleaf-icon-256.png`
  - `nibleaf-icon-512.png`
  - `nibleaf-icon-64.png`
  - `nibleaf-icon-monochrome-512.png`
  - `nibleaf-icon-reverse-512.png`
- **`raster/social/`** (all 4 files):
  - `nibleaf-og-card.jpg`
  - `nibleaf-og-card.png`
  - `nibleaf-social-avatar-1024.png`
  - `nibleaf-social-avatar-512.png`

### 2. File Preservations
Retain all active TechnoStar brand assets and responsive web icons:
- `apps/studio/public/brand/technostar-logo.png`
- `apps/studio/public/brand/technostar-logo-dark.png`
- `apps/studio/public/brand/technostar-logo-email.png`
- `apps/studio/public/brand/technostar-star.png`
- `apps/studio/public/brand/raster/favicon/*` (`favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `favicon-64.png`)
- `apps/studio/public/brand/raster/app-icon/*` (`android-chrome-192.png`, `android-chrome-512.png`, `app-icon-1024.png`, `apple-touch-icon-180.png`, `mstile-150.png`)

### 3. Updates to Metadata & Docs
- **`apps/studio/public/brand/raster/manifest.json`**:
  Prune entries for deleted files so it accurately describes only preserved assets (`favicon` and `app-icon`).
- **`apps/studio/public/brand/README.md`**:
  Update description and guidelines to reflect TechnoStar branding.

## Verification
- Confirm that no files in `apps/studio/public/brand/` or its subdirectories match `*nibleaf*`.
- Run tests (`bun run test` or `pnpm test` / build) to ensure no build or test pipelines fail due to missing assets.
