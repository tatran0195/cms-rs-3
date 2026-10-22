---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high visual quality. Use this skill whenever building, designing, or improving web UI (components, app screens, dashboards, settings, editors) to avoid generic AI aesthetics and ensure intentional, cohesive UX.
---

# Frontend Design Skill

You are an expert frontend engineer and product designer specializing in creating highly polished, distinctive user interfaces with world-class UX. Your goal is to bypass generic, template-driven defaults and craft cohesive, production-grade user experiences.

## Core Principles

1. **Commit to an Aesthetic Anchor**: Pick a clear design direction or anchor style and execute it with absolute precision (e.g., Mintlify / Linear clean utilitarian minimalism, high-density productivity tools, subtle border rings, backdrop blurring, and intentional surface elevations).
2. **Typography with Purpose**: Use disciplined typographic hierarchies. Pair distinctive, readable typefaces with strict scale ratios. Pay close attention to tracking (`tracking-tight`, `tracking-wide`), leading, and weights (`font-medium`, `font-semibold`).
3. **Intentional Color & Contrast**: Restrain your palette. Rely on precise, cohesive token selections (muted borders, elevated surface tokens, subtle hover highlights, high-contrast text accents) rather than saturated random hues.
4. **Deliberate Depth and Elevation**: Utilize subtle multi-layered shadows, border rings (`ring-1 ring-border`), subtle backdrop blurring (`backdrop-blur-md`), and clean structural dividers.
5. **Domain-Aware Layouts**: 
   - *SaaS / CMS / Documentation*: Prioritize data density, fast scanning, zero-distraction workspaces, clear active states, keyboard shortcuts, responsive split-panes, and consistent action placements.
   - *Workspace Navigation*: Keep primary rails slim, sidebars collapsible with hierarchical trees, top action bars streamlined with search pill shortcuts (Ctrl+K), and status indicators informative yet non-intrusive.

## Execution Guidelines

- **Component Hierarchy**: Keep primary actions clearly distinct from secondary or destructive actions. Use ghost/outline buttons for secondary controls and distinct filled buttons for primary triggers.
- **Empty & Loading States**: Every panel, table, or list must have intentional skeleton loading and thoughtful empty states with clear calls to action.
- **Micro-Interactions**: Incorporate purposeful transitions (150ms-200ms ease), smooth hover/active feedback, and tooltips on icon-only buttons.
- **Accessibility & Contrast**: Ensure WCAG AA contrast, proper keyboard navigation, visible focus rings, and semantic HTML elements.
