# Design Specification: Calendar & DatePicker Month/Year Quick Selection (Mantine-style Grid)

**Status:** Approved  
**Author:** Antigravity AI Systems Architect  
**Date:** 2026-10-07  
**Target:** `packages/ui` (`@cms/ui`)

---

## 1. Executive Summary

This specification defines the enhancement for the `Calendar` and `DatePicker` components in `@cms/ui`. Currently, navigating months and years requires clicking previous/next buttons one month at a time. This feature introduces a Mantine-style hierarchical view mode switcher (`'day'`, `'month'`, `'year'`) allowing users to click directly on the Month or Year in the header to jump quickly to any month or year via a 3×4 interactive grid.

---

## 2. Component Architecture & Flow

### 2.1 View Mode Hierarchy
The calendar component maintains a view mode state:
- **`'day'` (default)**: Standard day grid showing the days of the currently focused month.
- **`'month'`**: A 3×4 grid displaying the 12 months (Jan – Dec) for the focused year.
- **`'year'`**: A 3×4 grid displaying a 12-year decade window (e.g., 2020 – 2031).

```
[ Day View: October 2026 ]
      │               │
 (click Month)   (click Year)
      │               │
      ▼               ▼
[ Month Grid (2026) ] ── (click Year header) ──► [ Year Grid (2020-2031) ]
      │                                                     │
 (select month)                                        (select year)
      ▼                                                     ▼
[ Day View: Focused Month ]                    [ Month Grid: Focused Year ]
```

### 2.2 Header Controls & Navigation

The header adapts based on `viewMode`:

1. **`viewMode === 'day'`**:
   - Left / Right arrows: Navigate previous / next month (`state.focusPreviousPage()` / `state.focusNextPage()`).
   - Title: Rendered as two interactive buttons side-by-side:
     - `[ Month ]`: e.g. "October", clicking switches `viewMode` to `'month'`.
     - `[ Year ]`: e.g. "2026", clicking switches `viewMode` to `'year'`.
   - Hover styling: `hover:bg-ui-bg-base text-ui-fg-base rounded px-1.5 py-0.5 cursor-pointer transition-colors`.

2. **`viewMode === 'month'`**:
   - Left / Right arrows: Navigate previous / next year (`currentDate.set({ year: year - 1 })`).
   - Title: Rendered as a single interactive button:
     - `[ Year ]`: e.g. "2026", clicking switches `viewMode` to `'year'`.
   - Clicking a month in the grid:
     - Updates focused date: `state.setFocusedDate(currentDate.set({ month: selectedMonth }))`.
     - Transitions `viewMode` back to `'day'`.

3. **`viewMode === 'year'`**:
   - Left / Right arrows: Navigate previous / next decade (`currentDate.set({ year: year - 12 })`).
   - Title: Static or informative range text:
     - e.g. `2020 – 2031`.
   - Clicking a year in the grid:
     - Updates focused date: `state.setFocusedDate(currentDate.set({ year: selectedYear }))`.
     - Transitions `viewMode` to `'month'`.

---

## 3. UI Token Mapping & Grid Layout

### 3.1 Dimensions
The Month and Year grids are designed to match the height and width of the existing `CalendarGrid` (approx 230px height, 220px-260px width) so that switching views within the `DatePicker` popover causes zero layout shift.

### 3.2 Tokens
- **Container**: `grid grid-cols-3 gap-1.5 p-1 min-h-[228px] items-center`.
- **Default Cell**:
  - `bg-ui-bg-component text-ui-fg-base txt-compact-small rounded-md py-2.5 text-center transition-colors cursor-pointer`.
  - Hover: `hover:bg-ui-bg-component-hover active:bg-ui-bg-component-hover`.
- **Selected Cell** (currently focused month/year):
  - `bg-ui-bg-interactive text-ui-fg-on-color font-medium hover:bg-ui-bg-interactive`.
- **Current (Today) Month / Year**:
  - `border border-ui-border-interactive font-medium` (when not selected).
- **Disabled Cell** (if outside `minValue` or `maxValue`):
  - `text-ui-fg-disabled pointer-events-none opacity-50`.

---

## 4. Reusable Structure

To avoid duplication between standalone `Calendar` and `DatePicker`'s `InternalCalendar`:
- **`calendar-header.tsx`**: Encapsulates the header bar, prev/next arrows, and the interactive Month/Year triggers.
- **`calendar-month-grid.tsx`**: Renders the 3×4 month picker.
- **`calendar-year-grid.tsx`**: Renders the 3×4 decade/year picker.
- Both `Calendar` (`calendar.tsx`) and `InternalCalendar` (`_internal-calendar.tsx`) utilize these shared subcomponents.

---

## 5. Verification Plan

1. **Unit Testing**:
   - Test clicking month button switches to month grid.
   - Test selecting a month updates the focused date and returns to day view.
   - Test clicking year button switches to decade grid.
   - Test selecting a year updates the focused date and navigates properly.
   - Test boundary restrictions (`minValue`, `maxValue`).
2. **Storybook Verification**:
   - Verify visually in Storybook dev server (`http://localhost:6006`).
   - Interact with DatePicker popover and Calendar standalone story.
