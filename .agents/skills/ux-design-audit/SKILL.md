---
name: ux-design-audit
description: Expert-level heuristic evaluation and UX design audit framework for modern web and SaaS applications. Use to systematically evaluate visual polish, ergonomics, responsiveness, and information architecture.
---

# Expert UX Design Audit Framework

Evaluate web applications across 7 foundational UX dimensions:

## 1. Visual Hierarchy & Scanning
- Is the primary focal point immediately clear on every screen?
- Are headings, body text, badges, and metadata scaled harmoniously?
- Does typography use consistent weights (`medium`, `semibold`) and tracking?

## 2. Spatial Rhythm & Spacing Consistency
- Do margins, paddings, and component gutters adhere strictly to an 8pt/4pt grid system?
- Are dense interfaces (code editors, file trees, table rows) compact (32-36px row height) while macro cards and modals have breathing room (16-24px padding)?
- Are borders and dividers consistently colored (`border-border` / `border-border/60`) and not doubled?

## 3. Interaction Design & Affordance
- Do clickable elements clearly look clickable with subtle hover states, cursor styles, and active depressions?
- Are destructive actions (Delete, Remove) isolated and styled with danger variants (`destructive`), requiring confirmation?
- Do icon-only buttons include descriptive tooltips and accessible `aria-label`s?

## 4. State Completeness
- Every view and interactive widget must handle:
  - **Initial / Empty state**: Helpful explanation + primary action button + subtle illustration or icon.
  - **Loading state**: Non-jarring skeleton loader that matches the eventual content layout.
  - **Error state**: Clear human-friendly message + retry action.
  - **Active / Selected state**: Clear highlight, border, or badge indicating selection.

## 5. Navigation & Ergonomics
- Persistent Activity Rail or navigation bar for instant switching between primary contexts.
- Global command palette / search shortcut (`Ctrl+K` / `Cmd+K`) visible and accessible everywhere.
- Breadcrumbs or header contextual info showing exactly where the user is in the hierarchy.

## 6. Feedback & Continuity
- Immediate feedback for user actions (optimistic updates, status chips, toast notifications, progress indicators).
- No sudden jumps or unstyled layout shifts (CLS).

## 7. Contrast & Accessibility
- Strict adherence to WCAG AA color contrast in both Light and Dark themes.
- Clear `:focus-visible` outlines for keyboard navigability.
