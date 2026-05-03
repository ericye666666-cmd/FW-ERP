# FW-ERP Shadcn Admin UI Reference

Research date: 2026-05-03

This document records UI research only. It does not introduce Shadcn Admin source code, dependencies, component files, or behavior changes into FW-ERP.

## Sources Reviewed

- Shadcn Admin demo: https://shadcn-admin.netlify.app/
- Shadcn Admin source: https://github.com/satnaing/shadcn-admin
- Shadcn Admin README notes: responsive, accessible, built-in Sidebar, global search command, 10+ pages, RTL support, and a warning that it is not a starter template.
- Shadcn Admin source areas reviewed outside this repository: `src/components/layout/`, `src/components/data-table/`, `src/features/tasks/`, `src/features/settings/`, `src/components/command-menu.tsx`, `src/styles/theme.css`, and `src/components/ui/`.
- shadcn/ui docs reviewed: theming, sidebar, data table, table, command, and sheet.

## Executive Summary

Shadcn Admin by Satnaing is useful for FW-ERP as a UI reference because it is an operations-style admin shell built around a collapsible sidebar, compact top header, dense data tables, settings forms, command search, and semantic theme tokens.

FW-ERP should not copy it as a business template. Its demo business pages, fake dashboard metrics, Clerk authentication examples, chat/apps pages, RTL-specific component modifications, and sample route structure are not FW-ERP requirements. FW-ERP should adapt the layout and visual discipline, then map it onto warehouse, store, POS, PDA, printing, and replenishment workflows without changing business rules.

## Useful Parts for FW-ERP

### 1. App Shell and Sidebar

Useful patterns:

- A persistent left sidebar with grouped navigation.
- Collapsible sidebar state for narrower workspaces.
- Header/sidebar/content separation instead of page-specific custom shells.
- Sticky header behavior for global search, session identity, theme, and profile actions.
- Sidebar groups with labels, nested menu items, active states, badges, and compact icon affordances.

FW-ERP adaptation:

- Use the sidebar for stable role areas: Warehouse, Store, POS, Operations, Admin, Test Tools.
- Keep high-frequency warehouse tasks in the first visible group.
- Avoid product-demo groups such as Apps, Chats, Users unless they map to real FW-ERP modules.
- Sidebar labels must be operational, not marketing labels.

### 2. Top Bar / Header

Useful patterns:

- Fixed-height top bar.
- Search / command trigger in the header.
- Compact icon actions for theme, config, profile, and user state.
- Header that becomes lightly elevated only while scrolling.

FW-ERP adaptation:

- Header should show current role, store or warehouse code, API environment, printer/helper status when relevant, and current operational context.
- Header must stay visually quiet. Do not use large banners, hero copy, or colored cards in the app shell.
- For PDA and POS surfaces, keep the same token system but use density-specific layouts instead of the full desktop header.

### 3. Main Content Layout

Useful patterns:

- Constrained content width for dashboards and settings.
- Full-width table/panel layouts where data density matters.
- Page title plus short helper line, then immediate operational controls.
- Tabs for related views, not for unrelated flows.

FW-ERP adaptation:

- Warehouse/admin pages should use compact full-width layouts with page padding of 16 to 20 px.
- Long process explanations should move into docs, tooltips, or collapsible help.
- Main operational pages should start with summary metrics and action controls, then tables.

### 4. Data Table Pages

Useful patterns:

- TanStack-table style composition: toolbar, filters, table, pagination, column visibility, row actions, row selection.
- Compact search input around 32 px high.
- Table cells with small text and tight padding.
- Row actions through menus instead of multiple full-size buttons in each row.
- Selection and batch action affordances separated from row content.

FW-ERP adaptation:

- Replenishment, LPK, SDB, SDO, warehouse stock, user, and receipt pages should use dense tables.
- Use explicit operational columns: request, available, pickable, shortage, status, source, target store, print state.
- Row action menus should only contain safe actions for that row. Destructive or irreversible actions need confirmation dialogs.
- Critical scan or print actions can remain visible when they are the primary task.

### 5. Settings and Form Pages

Useful patterns:

- Settings pages split left navigation from right content.
- Form sections have clear title, short description, separator, then fields.
- Controls use compact spacing and validation messages.
- Advanced or rarely used fields are not in the main flow.

FW-ERP adaptation:

- Internal parameters such as cost estimation, wave/PickingWave settings, warehouse codes, and technical print options should be in collapsed advanced sections.
- Main forms should ask only for operator-needed decisions.
- Labels must use business words, with internal field names only in admin/developer contexts.

### 6. Dialog / Sheet / Command UI

Useful patterns:

- Command menu for search and quick navigation.
- Sheets for side-edit workflows that complement the current page.
- Dialogs for confirmation and constrained decisions.
- Command groups mirror sidebar navigation.

FW-ERP adaptation:

- Use command search for page navigation, order lookup, barcode lookup, and recent operational IDs.
- Use sheets for editing a replenishment line, LPK line, SDO package, or user record without losing table context.
- Use dialogs for destructive actions, print confirmation states, and exception approvals.
- Avoid using modals for long multi-step warehouse flows.

## Parts Not Suitable for FW-ERP

- Marketing/dashboard sample metrics such as revenue cards copied directly from the demo.
- App/chat examples that do not map to warehouse or store operations.
- Clerk-specific authentication UI or dependencies.
- Demo business schemas such as generic Tasks/Users as if they were FW-ERP domain models.
- Large presentation cards that duplicate the current FW-ERP problem.
- Route structure or TanStack Router setup as a required migration path.
- Full template source, customized RTL component forks, or prebuilt sample data.
- Decorative theme or layout settings that expose too many design options to staff.

## App Shell Adaptation

FW-ERP should use Shadcn Admin as the shell reference, not as source code.

Recommended shell:

| Area | FW-ERP rule |
|---|---|
| Sidebar | Dark, 248 px expanded, 56 px collapsed, grouped by role/task domain. |
| Top bar | 56 px desktop height, contains context, search, session, environment, and status indicators. |
| Main | Neutral background, white panels, compact grid and table layouts. |
| Mobile/PDA | Single-column surface with scan-first actions, not a mini desktop shell. |
| POS | Dedicated terminal layout sharing tokens, not the general ERP sidebar shell. |

## Sidebar Navigation Adaptation

Sidebar groups should be stable and operational:

- Warehouse inbound and sorting
- Warehouse stock and compression
- Store replenishment and warehouse prep
- Dispatch / SDO / shipment tracking
- Store receiving and shelving
- POS
- Admin and settings
- Test tools, clearly marked as test-only

Rules:

- Use active states and badges for counts or blocked tasks.
- Keep group names short.
- Do not use warm colored section cards as navigation.
- Do not duplicate the same flow in multiple groups unless one is a read-only monitor.

## Data Table Adaptation

FW-ERP tables should follow these rules:

- Header height: 36 to 40 px.
- Cell padding: 8 px horizontal, 6 to 8 px vertical.
- Default body text: 13 px.
- Use sticky toolbar above long tables.
- Keep row height near 36 to 44 px for web ERP density.
- Numeric columns align right when comparing quantities or money.
- Status badges use semantic colors, not custom warm card backgrounds.
- Tables should fit real work at 100% browser zoom.

## Forms and Settings Adaptation

FW-ERP forms should be split into:

- Main operator fields: required operational choices only.
- Advanced settings: internal identifiers, optional technical settings, defaults, cost estimates, and backend knobs.
- Help text: one sentence, not paragraphs.
- Validation: inline error text near the field.

For example, Warehouse prep task / PickingWave parameters should show a summary and a single primary button in the main flow. Wave name, warehouse code, planned picking date, required arrival date, selected request numbers, and notes belong in an advanced section.

## Dialog / Sheet / Command Adaptation

Use these patterns:

- Command menu: page search, barcode/order lookup, recent request numbers.
- Sheet: row-level edit or detail preview while preserving current table.
- Dialog: confirmation, exception, print retry decision.
- Drawer/PDA bottom sheet: mobile scan actions where a full side sheet is too wide.

Do not use:

- Dialogs for entire workflow pages.
- Nested modals.
- Hidden business actions without visible status.
- Toast-only confirmation for inventory, receiving, or POS decisions.

## Visual Direction Replacing Yellow-Green / Beige

FW-ERP should move to:

- Neutral gray app background.
- White surfaces.
- Slate/dark sidebar.
- Blue primary action.
- Green only for success.
- Amber only for warning.
- Red only for danger.
- Cyan/sky only for informational states.

Current yellow-green / beige / warm card styling should not remain the main theme. It can appear only as a low-priority warning accent when semantically correct.

## What Must Not Be Copied Directly

- Shadcn Admin component source files.
- Shadcn Admin sample business routes.
- Sample dashboard metrics, charts, fake task data, or user data.
- Clerk authentication setup.
- Package dependencies or lockfile contents.
- The template's customized component forks.
- The exact demo page spacing when it is too airy for warehouse operations.
- Any sample source code that changes FW-ERP business behavior.

## Risks of Direct Copying

| Risk | Why it matters to FW-ERP |
|---|---|
| Business drift | Demo tasks/users/chats can distract from warehouse/store/POS workflows. |
| Dependency sprawl | Copying the template would add router/auth/table/config dependencies before FW-ERP has chosen a React migration path. |
| Component fork burden | Shadcn Admin notes several modified/RTL-updated components; copying them creates maintenance work. |
| Density mismatch | Some dashboard and settings examples are still too spacious for warehouse execution screens. |
| Rule regression | UI rewrites can accidentally change barcode, inventory, cost, PickingWave, or print-agent behavior. |
| Review noise | Large template imports hide the real FW-ERP UX decisions reviewers need to inspect. |

## Implementation Guidance for Future PRs

Future UI implementation PRs should:

1. Start from the FW-ERP design system document, not from raw Shadcn Admin files.
2. Change one surface family at a time.
3. Preserve API payloads and business algorithms.
4. Add screenshots or visual QA evidence for web, POS, and PDA density where relevant.
5. Keep advanced/system fields collapsed unless the task is explicitly admin-only.
6. Keep barcode, POS, store receiving, inventory, cost, PickingWave, and print-agent rules out of cosmetic UI PRs.
