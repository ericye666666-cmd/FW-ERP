# FW-ERP UI Design System

This document is the executable design reference for future FW-ERP UI PRs. It translates the Shadcn Admin research into FW-ERP-specific rules without changing business behavior.

## 1. Design Direction

FW-ERP should become a compact ERP / WMS operation system:

- Neutral gray + white surface + blue primary action.
- Dark sidebar for desktop ERP pages.
- Compact tables and forms.
- Fewer large explanation boxes.
- Higher information density.
- Clear enough for warehouse, store, POS, and PDA staff.
- Operational first screen, not presentation or marketing composition.

The current yellow-green / beige / warm card style must not remain the main visual system. It makes pages feel like documents and reduces scan efficiency.

## 2. Global Color Tokens

Use semantic tokens. Future implementation can map these to CSS variables or Tailwind theme tokens.

| Token | Value | Usage |
|---|---:|---|
| `--fw-bg` | `#f8fafc` | App background. |
| `--fw-surface` | `#ffffff` | Main panel, table, form, card surface. |
| `--fw-surface-muted` | `#f1f5f9` | Toolbar, table header, subtle grouped area. |
| `--fw-border` | `#e2e8f0` | Default border and separators. |
| `--fw-border-strong` | `#cbd5e1` | Focused panels, active separators, stronger table boundaries. |
| `--fw-text` | `#0f172a` | Primary text. |
| `--fw-text-muted` | `#475569` | Secondary text and table metadata. |
| `--fw-text-subtle` | `#64748b` | Helper text, placeholder, empty state. |
| `--fw-primary` | `#2563eb` | Primary action, active item, selected tab. |
| `--fw-primary-hover` | `#1d4ed8` | Primary hover. |
| `--fw-primary-soft` | `#dbeafe` | Soft active background. |
| `--fw-success` | `#16a34a` | Success, completed, available, received. |
| `--fw-warning` | `#d97706` | Partial, waiting, attention. |
| `--fw-danger` | `#dc2626` | Error, rejected, destructive action, shortage blocker. |
| `--fw-info` | `#0284c7` | Informational state, in-transit, processing. |
| `--fw-sidebar-bg` | `#0f172a` | Dark sidebar background. |
| `--fw-sidebar-active` | `#1e293b` | Active or hovered sidebar item. |
| `--fw-sidebar-text` | `#e2e8f0` | Sidebar text and icons. |

Color rules:

- Blue is the only high-emphasis action color.
- Green is success only.
- Amber is warning/partial only.
- Red is danger/error only.
- Beige, yellow-green, brown, and warm gradients are not allowed as main surfaces.
- Do not communicate status by color alone; pair with badge text.

## 3. Typography Tokens

Use a system sans-serif or Inter-like face. Letter spacing should stay at `0` except small uppercase eyebrows, which should be rare in operations pages.

| Token | Size / line height | Weight | Usage |
|---|---|---:|---|
| Page title | `22px / 30px` | 650-700 | Main page heading. |
| Section title | `16px / 24px` | 600 | Panel or section title. |
| Card title | `14px / 20px` | 600 | Summary card or metric card title. |
| Body text | `14px / 20px` | 400 | General UI copy. |
| Form label | `13px / 18px` | 600 | Input label. |
| Helper text | `12px / 16px` | 400 | Field help, secondary hints. |
| Table text | `13px / 18px` | 400 | Table body. |
| Table header | `12px / 16px` | 600 | Table header labels. |
| Badge text | `12px / 16px` | 600 | Status badge. |
| POS number | `28px / 36px` | 700 | POS totals and large cashier numbers. |
| PDA action | `16px / 24px` | 650 | Mobile primary scan/action labels. |

Do not use hero-scale typography inside dashboards, cards, sidebars, tables, POS panels, or PDA screens.

## 4. Spacing Tokens

| Token | Value | Usage |
|---|---:|---|
| Page padding desktop | `16px 20px` | Web ERP content area. |
| Page padding mobile | `12px` | PDA/mobile pages. |
| Panel padding | `16px` | Primary content panels. |
| Card padding | `12px` | Metric or repeated item cards. |
| Compact card padding | `8px 10px` | Dense list cards where a table is not possible. |
| Form gap | `10px 12px` | Web ERP compact forms. |
| Form row gap | `8px` | Between label/helper/control. |
| Table cell padding | `6px 8px` | Dense tables. |
| Table toolbar gap | `8px` | Filters, search, actions. |
| Sidebar item padding | `8px 10px` | Desktop sidebar menu item. |
| Dialog padding | `16px` | Modal content. |
| Sheet padding | `16px` | Side sheet content. |

Rules:

- Web ERP pages should fit core work at 100% browser zoom.
- Use 8 px spacing increments for most web UI.
- Large 24-32 px gaps are allowed only between major page regions.
- Avoid stacked cards with large internal whitespace.

## 5. Radius and Shadow

| Token | Value | Usage |
|---|---:|---|
| Small radius | `4px` | Badges, inputs, compact controls. |
| Medium radius | `6px` | Buttons, panels, tables, small cards. |
| Large radius | `8px` | Dialogs, sheets, main repeated cards. |
| Light shadow | `0 1px 2px rgba(15, 23, 42, 0.06)` | Sticky header or floating overlay only. |

Rules:

- Default card/panel radius should be 6-8 px, not pill-like.
- Tables usually need borders, not shadows.
- Shadows should not be used for page sections, nested cards, or decorative depth.
- Avoid card-inside-card composition.

## 6. Layout System

### Web ERP Compact Layout

- Sidebar expanded width: `248px`.
- Sidebar collapsed width: `56px`.
- Top bar height: `56px`.
- Content area: fills remaining width; default background `--fw-bg`.
- Main panels: white `--fw-surface`, 1 px border, 6-8 px radius.
- Scroll: page-level scroll for ordinary pages; table body scroll only for intentionally fixed workbenches.

### Panel Grid

- Metric row: 4 columns on desktop, 2 on tablet, 1 on mobile.
- Main/detail split: 36/64 or 40/60 depending on left identity-card density.
- Wide data page: toolbar + table full width.
- Summary + detail page: summary metrics first, detail table second.

### Split Layout

Use split layout for pages where identity and details must remain visible together:

- LPK identity + picking detail.
- SDO package identity + print/send status.
- Store receiving package + item rows.
- POS basket + payment panel.

### Table Layout

- Header row height: 36-40 px.
- Body row height target: 36-44 px.
- Sticky toolbar above table.
- Pagination below table.
- Horizontal overflow allowed only for very wide operational tables; essential columns must remain visible.

### Advanced Section Behavior

- Advanced sections default closed.
- Summary label must explain why the section exists.
- Advanced fields should never be required for the normal operator path when system defaults are possible.
- Technical field names can appear in advanced/admin sections, not in the main operator flow.

## 7. Component Rules

### Sidebar

- Dark background.
- Group by task domain, not by implementation module.
- Use icons plus short labels.
- Use badges for counts or blocking states.
- Active item uses `--fw-sidebar-active` and clear text contrast.
- Test tools must be grouped and labeled as test-only.

### Top Bar

- One row, 56 px high.
- Contains sidebar trigger, page/search command, session identity, environment, and status indicators.
- Do not show long explanations in the top bar.
- Printer/helper status may appear only on print-heavy pages.

### Panel

- White surface, border, 6-8 px radius.
- Use for main bounded tools or tables.
- Do not use panels as page decoration.

### Card

- Use for repeated records or metrics.
- Avoid large explanatory cards.
- Metric cards show label, value, small context.
- Repeated item cards must have fixed density and predictable actions.

### Form

- Compact labels and controls.
- Use grid rows where multiple related fields fit.
- Required business fields first.
- Internal estimates and technical settings in advanced sections.
- One primary submit action per form.

### Input

- Desktop height: 32-36 px.
- POS/PDA touch height: 44-52 px.
- Border `--fw-border`; focus ring blue.
- Placeholder uses `--fw-text-subtle`.

### Select

- Same height as input.
- Use for small option sets.
- For 2-5 mode choices, prefer segmented/toggle control in future component systems.

### Textarea

- Use only where free text is required.
- Default height 72-96 px in web ERP.
- Notes fields belong in advanced sections unless operator-critical.

### Primary Button

- Blue background.
- Height 32-36 px for web ERP.
- Height 44-52 px for POS/PDA primary actions.
- One visually dominant primary action per task area.

### Secondary Button

- White or muted surface with border.
- Use for cancel, back, refresh, view, export.

### Danger Button

- Red only.
- Requires confirmation if it changes inventory, receipt, sale, return, user status, or print completion state.

### Table

- Dense by default.
- Header background `--fw-surface-muted`.
- Row hover `--fw-surface-muted`.
- Status columns use badges.
- Row actions should use compact menu or icon button when there are more than two actions.

### Badge

- Small radius and 12 px text.
- Badge meanings:
  - Success: completed, received, available, fully picked.
  - Warning: partial, waiting, needs review.
  - Danger: rejected, shortage blocker, failed print.
  - Info: in transit, processing, queued.
  - Neutral: draft, pending, archived.

### Dialog

- Use for confirmation or constrained decision.
- Must have title, short description, body, and clear primary/secondary actions.
- Do not put long forms or entire workflows inside dialogs.

### Sheet

- Use for row detail, edit, package detail, or line-level picking details.
- Right side on desktop; bottom sheet on mobile/PDA.
- Preserve table context behind it.

### Empty State

- One short sentence and one action when actionable.
- No large illustrations in core ERP pages.

### Alert / Notice

- Use semantic color.
- Keep to one or two sentences.
- For business blockers, include required next action.

## 8. Density Modes

FW-ERP uses one design language with three density modes.

### 8.1 Web ERP Compact Density

Use for warehouse, admin, operations, replenishment, dispatch, and tracking pages.

- Sidebar + top bar desktop shell.
- Compact tables.
- Compact forms.
- High information density.
- Summary metrics plus detail table.
- Advanced settings collapsed.
- Row height target 36-44 px.
- Button height 32-36 px.

### 8.2 POS Cashier Touch Density

Same tokens, different layout.

- No general ERP sidebar during active cashier work.
- Left basket / right payment layout on desktop POS.
- Larger buttons and numbers.
- Primary scan/search input always visible.
- Totals and payment state visible at all times.
- Touch target height 48-56 px.
- Fast error recovery; no hidden cashier-critical actions.

### 8.3 PDA Mobile Touch Density

Same tokens, mobile-first.

- Single-column layout.
- Large scan action.
- Large status badges.
- Minimal input.
- Offline/sync status visible.
- Sticky bottom action bar where appropriate.
- Touch target height 48-56 px.
- Avoid sidebars, dense desktop tables, and multi-column forms.

## 9. FW-ERP Priority Pages

### 4.1 Manual Replenishment Request

Future redesign:

- Top summary: store, total requested qty, category count, shortage count, status.
- Detail table: main category, subcategory, requested, available, pickable, shortage, action.
- Default cost/internal estimate stays in collapsed advanced section.
- One primary action for creating or submitting the request.
- Remove long explanatory text from the main flow.

### Warehouse Prep Task / PickingWave Advanced Parameters

Future redesign:

- Main card title: Warehouse prep task / 仓库备货任务.
- Explanation: combine multiple replenishment categories into one warehouse picking task.
- Summary metrics: selected requests, total requested qty, category count, shortage qty.
- Primary action: Generate warehouse prep task.
- Advanced section default closed: wave name, warehouse code, planned picking date, required arrival date, request numbers, notes.
- System defaults must support the normal path without opening advanced settings.

### 5.1 LPK Shortage Pick Workbench

Future redesign:

- Split layout.
- Left: LPK identity card with display code, machine code, target store, status, linked request/SDO, barcode preview, print button.
- Right: Picking detail table.
- Table columns: main category, subcategory, requested qty, picked qty, shortage qty, source package/location, status.
- Highlight "What did this LPK pick?" as the page question.
- Status badges: picked, partial pick, shortage, pending.

### 6 Warehouse Execution / SDO Print

Future redesign:

- Summary first: transfer/request, target store, package count, print status, shipment readiness.
- Table of SDB/LPK/SDO packages with barcode identity and print status.
- One primary print action per selected SDO context.
- Advanced/test print controls collapsed.
- Print success/failure states visible and audit-friendly.

### 6.1 Shipment / Store Receiving Tracking

Future redesign:

- Tracking board grouped by store and shipment.
- Status pipeline: created, packed, shipped, arrived, received, exception.
- Table rows show SDO, package count, shipped at, received at, discrepancy, next action.
- Exceptions use warning/danger badges with clear next action.

### POS Cashier Terminal

Future redesign:

- Dedicated terminal layout.
- Left: scan/search and basket.
- Right: totals, payment method, tender/confirm controls.
- Large numeric hierarchy.
- No broad workspace shell during active sale.
- POS barcode rule remains unchanged: sellable `STORE_ITEM` only.

### Android PDA Putaway Flow

Future redesign:

- Single-column scan-first layout.
- Top: current user/store/offline status.
- Main: scan package/item, status badge, current assignment.
- Bottom: primary next action.
- Minimize typing; use scan, large buttons, and clear error recovery.
- Store receiving and POS barcode boundaries remain unchanged.

## 10. Strict Business Guardrails

Future UI PRs must not change:

- POS barcode rules.
- Store receiving barcode rules.
- `barcode_value = machine_code`.
- Inventory algorithm.
- Cost algorithm.
- PickingWave algorithm.
- Print agent behavior unless explicitly scoped.
- Runtime data, secrets, `DATABASE_URL`, or `backend/data`.

Concrete rules:

- POS must continue to accept only `STORE_ITEM` / type-5 machine codes.
- POS must reject `RAW_BALE`, `SDB`, `LPK`, and `SDO`.
- Store receiving must continue to accept only `SDO` / type-4 machine codes.
- Store receiving must reject `RAW_BALE`, `SDB`, `LPK`, and `STORE_ITEM`.
- SDB and LPK are source package / shortage pick identities, not formal store receiving codes.
- UI-only PRs must preserve existing API payload contracts unless the issue explicitly authorizes a contract change.

## Future PR Checklist

Every future UI implementation PR should confirm:

- Which density mode is being changed.
- Which pages are in scope.
- Which files changed.
- No business algorithm changed.
- No barcode resolver behavior changed.
- No print-agent behavior changed unless explicitly scoped.
- Screenshots or visual QA evidence for the target density.
- `git diff --check` passed.
