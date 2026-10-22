---
name: modern-web-guidance
description: Best practices and modern web platform APIs for building fast, accessible, responsive, and resilient user interfaces with modern CSS and HTML.
---

# Modern Web Platform Guidance

Inject modern web platform expertise, best practices, and modern CSS/HTML patterns into your UI implementations:

## Modern CSS & Layouts
1. **Container Queries & Flex/Grid**: Prefer container queries (`@container`) and flexible grid systems over fixed rigid pixel dimensions for responsive panels and widgets.
2. **Modern Color Spaces**: Use `color-mix()` and semantic CSS custom properties for dark mode adaptation, subtle transparencies, and surface tints.
3. **Scrollbar & Scroll Behavior**: Use standard `scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)` or modern utility classes rather than heavy custom JavaScript scrollers.
4. **Text Wrapping & Truncation**: Use `text-wrap: balance` for headings, `text-wrap: pretty` for body paragraphs, and graceful text truncation (`truncate`, `line-clamp-2`) with title tooltips.

## Performance & UX
1. **Transitions & Animations**: Use CSS transitions on `transform` and `opacity` only (avoid animating layout-triggering properties like `width`, `height`, `margin` where possible). Keep durations between 120ms and 240ms with `cubic-bezier(0.16, 1, 0.3, 1)`.
2. **Interactive States**: Always include `:hover`, `:active`, and visible `:focus-visible` states (`ring-2 ring-ring ring-offset-2`).
3. **Dialogs & Overlays**: Use accessible modal dialog patterns with background backdrop blur and click-outside dismissal.
