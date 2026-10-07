# Remove Legacy Nibleaf Brand Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all obsolete `nibleaf-*` brand and logo files from `apps/studio/public/brand` and update manifest and brand documentation to reflect active TechnoStar assets.

**Architecture:** Purge obsolete legacy assets without touching existing TechnoStar files or responsive web icons, then align manifest and markdown documentation.

**Tech Stack:** File operations, JSON, Markdown, Git.

## Global Constraints
- Target workspace: `d:\Workspace\Software\_working\cms-rs-3`
- Preserve all TechnoStar assets: `technostar-logo.png`, `technostar-logo-dark.png`, `technostar-logo-email.png`, `technostar-star.png`.
- Preserve responsive web icons: `raster/favicon/*` and `raster/app-icon/*`.
- Per AGENTS.md: Agents do not commit. Propose Conventional Commit messages for the user.

---

### Task 1: Remove Root `nibleaf-*.svg` Brand Files

**Files:**
- Delete:
  - `apps/studio/public/brand/nibleaf-app-icon.svg`
  - `apps/studio/public/brand/nibleaf-favicon.svg`
  - `apps/studio/public/brand/nibleaf-icon-currentcolor.svg`
  - `apps/studio/public/brand/nibleaf-icon-monochrome.svg`
  - `apps/studio/public/brand/nibleaf-icon-reverse.svg`
  - `apps/studio/public/brand/nibleaf-icon.svg`
  - `apps/studio/public/brand/nibleaf-logo-dark.svg`
  - `apps/studio/public/brand/nibleaf-logo-horizontal-icon-right.svg`
  - `apps/studio/public/brand/nibleaf-logo-horizontal-ltr-reverse.svg`
  - `apps/studio/public/brand/nibleaf-logo-horizontal-ltr.svg`
  - `apps/studio/public/brand/nibleaf-logo-horizontal-reverse.svg`
  - `apps/studio/public/brand/nibleaf-logo-horizontal-rtl.svg`
  - `apps/studio/public/brand/nibleaf-logo-monochrome.svg`
  - `apps/studio/public/brand/nibleaf-logo-stacked-transparent.svg`
  - `apps/studio/public/brand/nibleaf-logo-stacked.svg`
  - `apps/studio/public/brand/nibleaf-og-card.svg`
  - `apps/studio/public/brand/nibleaf-sidebar-lockup.svg`
  - `apps/studio/public/brand/nibleaf-social-avatar.svg`
  - `apps/studio/public/brand/nibleaf-wordmark-reverse.svg`
  - `apps/studio/public/brand/nibleaf-wordmark.svg`

- [ ] **Step 1: Delete all 19 `nibleaf-*.svg` files in `apps/studio/public/brand`**
Run PowerShell command:
```powershell
Remove-Item -Path "apps/studio/public/brand/nibleaf-*.svg" -Force
```

- [ ] **Step 2: Verify deletion of root SVGs**
Run PowerShell command:
```powershell
Get-ChildItem -Path "apps/studio/public/brand" -Filter "nibleaf-*.svg"
```
Expected output: No files found.

---

### Task 2: Remove Legacy Raster Logo, Icon, and Social Files

**Files:**
- Delete:
  - `apps/studio/public/brand/raster/logo/nibleaf-*` (15 files)
  - `apps/studio/public/brand/raster/icon/nibleaf-*` (7 files)
  - `apps/studio/public/brand/raster/social/nibleaf-*` (4 files)

- [ ] **Step 1: Delete legacy raster files**
Run PowerShell command:
```powershell
Remove-Item -Path "apps/studio/public/brand/raster/logo/nibleaf-*" -Force
Remove-Item -Path "apps/studio/public/brand/raster/icon/nibleaf-*" -Force
Remove-Item -Path "apps/studio/public/brand/raster/social/nibleaf-*" -Force
```

- [ ] **Step 2: Verify deletion of raster assets**
Run PowerShell command:
```powershell
Get-ChildItem -Path "apps/studio/public/brand/raster" -Recurse -Filter "nibleaf-*"
```
Expected output: No files found.

---

### Task 3: Update `raster/manifest.json` and Brand `README.md`

**Files:**
- Modify: `apps/studio/public/brand/raster/manifest.json`
- Modify: `apps/studio/public/brand/README.md`

- [ ] **Step 1: Update `apps/studio/public/brand/raster/manifest.json`**
Replace content with entries corresponding only to preserved `favicon` and `app-icon` items:
```json
[
  {
    "file": "apps/studio/public/brand/raster/favicon/favicon-16.png",
    "width": 16,
    "height": 16,
    "group": "favicon"
  },
  {
    "file": "apps/studio/public/brand/raster/favicon/favicon-32.png",
    "width": 32,
    "height": 32,
    "group": "favicon"
  },
  {
    "file": "apps/studio/public/brand/raster/favicon/favicon-48.png",
    "width": 48,
    "height": 48,
    "group": "favicon"
  },
  {
    "file": "apps/studio/public/brand/raster/favicon/favicon-64.png",
    "width": 64,
    "height": 64,
    "group": "favicon"
  },
  {
    "file": "apps/studio/public/brand/raster/app-icon/apple-touch-icon-180.png",
    "width": 180,
    "height": 180,
    "group": "app-icon"
  },
  {
    "file": "apps/studio/public/brand/raster/app-icon/mstile-150.png",
    "width": 150,
    "height": 150,
    "group": "app-icon"
  },
  {
    "file": "apps/studio/public/brand/raster/app-icon/android-chrome-192.png",
    "width": 192,
    "height": 192,
    "group": "app-icon"
  },
  {
    "file": "apps/studio/public/brand/raster/app-icon/android-chrome-512.png",
    "width": 512,
    "height": 512,
    "group": "app-icon"
  },
  {
    "file": "apps/studio/public/brand/raster/app-icon/app-icon-1024.png",
    "width": 1024,
    "height": 1024,
    "group": "app-icon"
  }
]
```

- [ ] **Step 2: Update `apps/studio/public/brand/README.md`**
Replace obsolete Nibleaf documentation with TechnoStar brand assets documentation:
```markdown
# TechnoStar Brand Assets

This directory contains the brand assets and logos for **TechnoStar**.

## Core Brand Assets

| Asset | File | Description |
| --- | --- | --- |
| Primary Logo | `/brand/technostar-logo.png` | Light mode logo with wordmark |
| Dark Logo | `/brand/technostar-logo-dark.png` | Dark mode logo with wordmark |
| Email Logo | `/brand/technostar-logo-email.png` | Email-optimized header logo |
| Star Mark | `/brand/technostar-star.png` | Standalone TechnoStar star mark |

## Web and App Icons

Responsive icons and application tiles are located in `raster/`:
- `raster/favicon/`: Standard favicons (`16x16`, `32x32`, `48x48`, `64x64`).
- `raster/app-icon/`: PWA and mobile icons (`apple-touch-icon-180.png`, `android-chrome-192.png`, etc.).
```

---

### Task 4: Verification

- [ ] **Step 1: Check entire `apps/studio/public/brand` tree for any lingering `nibleaf` files**
Run PowerShell command:
```powershell
Get-ChildItem -Path "apps/studio/public/brand" -Recurse | Where-Object { $_.Name -like "*nibleaf*" }
```
Expected output: No results.

- [ ] **Step 2: Verify git status and workspace build/checks**
Run:
```powershell
git status --short apps/studio/public/brand
```
Expected output: Shows deleted files for all `nibleaf-*` assets, modified `README.md` and `manifest.json`.
