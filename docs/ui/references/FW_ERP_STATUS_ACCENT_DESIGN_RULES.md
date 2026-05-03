# FW-ERP Status Accent Design Rules

Research date: 2026-05-03

This document defines FW-ERP status accent rules for future implementation PRs. It is documentation only. It does not add CSS, JavaScript, backend code, dependencies, runtime data, or copied external template source.

## Design Goal

FW-ERP should keep its compact Shadcn-style ERP foundation:

- neutral gray page background;
- white operational surfaces;
- dark desktop sidebar;
- blue primary actions;
- compact tables and forms;
- clear status text.

Status accents should add semantic visibility for operational state without turning the UI into large colored cards. They should help operators answer:

- What is the current state?
- What is the next action?
- Is anything short, pending, failed, blocked, paid, printed, connected, synced, or complete?

## Status Accent Token Rules

Use low-saturation backgrounds, one-pixel borders, and clear text contrast. These are design tokens for future implementation, not CSS added by this PR.

| Token | Background | Border | Text | Use for |
|---|---:|---:|---:|---|
| Info / 主流程 / 下一步 | `#eff6ff` or `#dbeafe` | `#bfdbfe` | `#1d4ed8` | Current main flow state, next action, warehouse prep task, POS checkout focus, PDA current scan task. |
| Success / 已完成 | `#f0fdf4` | `#bbf7d0` | `#15803d` | Completed, connected, STORE_ITEM recognized, paid or covered, printed, shelved or putaway complete. |
| Warning / 待处理 / 风险 | `#fffbeb` | `#fde68a` | `#92400e` | Shortage, pending confirmation, pending print, pending sync, M-Pesa pending, manual confirmation needed. |
| Danger / 错误 / 阻塞 | `#fef2f2` | `#fecaca` | `#991b1b` | Print failed, scan error, POS cannot sell this barcode, wrong store receiving barcode, PDA wrong barcode, blocker shortage. |
| Neutral / 普通状态 | `#f8fafc` | `#e2e8f0` | `#475569` | Draft, empty state, normal helper text, waiting, default state. |

Rules:

- Do not create new color meanings outside these five accents without a separate design decision.
- Do not use color alone. Every accent needs text, a label, an icon, or a quantity.
- Do not use the success color for ordinary positive copy if the operation is not complete.
- Do not use warning for normal default state.
- Do not use danger unless there is a real error, blocker, wrong barcode, failed print, or sale/receive prevention.

## Required Future Classes

These classes are intended for future implementation PRs. This document defines their usage contract only.

| Class | Visual intent | Use when | Do not use when | Density requirements |
|---|---|---|---|---|
| `.status-block` | Base compact state block with light background, border, text, optional icon, and optional action hint. | A panel needs a visible current state or next action. | A table cell only needs a small row label. Use a badge instead. | 6-8 px radius, 1 px border, 12-14 px text, compact padding, no shadow. |
| `.status-block-info` | Blue-tinted main-flow or next-action block. | The operator should continue with the highlighted current task. | The state is complete, failed, or merely default. | Keep copy to one short line plus optional small detail. |
| `.status-block-success` | Green-tinted completed or connected block. | The operation is done, recognized, paid, printed, connected, or shelved. | The state is only "available" but not completed in the current workflow. | Use restrained green. Do not make it a celebration panel. |
| `.status-block-warning` | Amber-tinted pending or risk block. | The operator must review a pending state, shortage, pending print, pending sync, or payment collection. | The action is blocked by an error. Use danger. | Put the required next action in text when possible. |
| `.status-block-danger` | Red-tinted blocker or error block. | A scan, print, sale, receive, or shortage state blocks progress. | The issue is informational or only waiting. | Keep it visible until the blocking state is resolved. |
| `.status-block-neutral` | Slate-tinted default or empty block. | The object is draft, waiting, empty, or in normal helper state. | A real operator action is required. | Should feel quieter than info and warning. |
| `.status-badge` | Base compact label for table rows, toolbar chips, side-panel metadata, or identity summaries. | A state needs to be scanned next to data. | The page needs a full next-action instruction. Use a block. | 12 px text target, 4-6 px radius, tight horizontal padding. |
| `.status-badge-info` | Blue badge for processing, active, selected, ready, or next action. | A row or record is active, ready, queued, or the current task. | The state is complete or failed. | Must not be pill-sized if table density suffers. |
| `.status-badge-success` | Green badge for completed, connected, recognized, paid, printed, shelved. | The row state is complete or confirmed. | The object is only eligible or proposed. | Pair with short text such as `Printed`, `Paid`, or `Shelved`. |
| `.status-badge-warning` | Amber badge for pending, partial, shortage, sync pending, print pending. | The state needs attention but is not fully blocked. | The row cannot proceed. Use danger. | If shortage matters, show quantity near the badge. |
| `.status-badge-danger` | Red badge for failed, blocked, wrong barcode, cannot sell, print failed. | The state prevents the next operation. | The condition is only a low-priority warning. | Use clear text, not only an exclamation icon. |
| `.status-badge-neutral` | Slate badge for draft, default, empty, waiting, archived, no action. | The state should be visible but low emphasis. | The operator must act now. | Lowest visual emphasis among badges. |
| `.next-action-block` | A compact info block focused on what the operator should do next. | A page has a clear next step such as generate prep task, print SDO, scan current item, or confirm payment. | The next step is obvious from the primary button alone. | One concise instruction, optional button nearby. |
| `.risk-block` | A compact warning or danger block for shortage, wrong barcode, failed print, or other risk. | The risk can change operator behavior. | The information is just background helper text. | Keep the risk close to the affected table, card, or control. |
| `.sync-status` | Dot or badge indicator for online, offline, pending sync, completed sync, or degraded connection. | POS, PDA, top bar, or service rows need sync visibility. | The page is not sync-aware. | Small enough for a header, with text label available. |
| `.print-status` | Badge or block for print agent and print job state. | SDO print, local print agent, fallback, printed, pending, or failed print needs visibility. | Non-print pages do not need print status. | Show connected/failed/pending text, not just color. |
| `.payment-status` | Badge or block for cash, M-Pesa, mixed payment, pending, paid, or covered. | POS payment panel and receipt state need clear payment state. | A non-POS page only shows monetary totals. | Larger than table badges only inside POS payment panel. |
| `.scan-warning` | Warning or danger state for scan errors and wrong barcode types. | PDA, POS, or store receiving scans a wrong or blocked barcode. | A scan succeeded. Use success or neutral. | Must be visible immediately near the scan input or current item. |

## Density Rules

Status blocks and badges must stay compact:

- border radius: 6 px to 8 px for blocks, 4 px to 6 px for badges;
- border: 1 px;
- font size: 12 px to 14 px;
- padding: compact, not large-card spacing;
- no heavy shadow;
- no gradients;
- no large illustration area;
- no color-only status without text;
- no animated attention effect unless an active system state truly needs it;
- no status block inside another card-like status block.

Recommended placement:

- table row state: badge;
- toolbar filter state: badge;
- operational next action: info block;
- shortage or pending condition: warning badge or warning block;
- blocked operation: danger block near the failed control;
- service health: compact dot plus label or badge.

## Usage By FW-ERP Page

### 4.1 Manual Replenishment Request

Use accents to make replenishment readiness and shortage visible without changing workflow logic.

| State | Accent rule |
|---|---|
| Draft | Neutral badge. |
| Ready to generate replenishment request | Info or next-action block near the generate action. |
| Shortage | Warning badge with shortage quantity visible. |
| Generated request | Success badge. |
| Warehouse Prep Task actionable | Info block. |
| Warehouse Prep Task waiting for request | Neutral block or neutral badge. |

Rules:

- The request table remains compact and mostly neutral.
- Shortage quantity must be visible beside the status.
- Cost/internal estimates stay out of operator emphasis unless the page explicitly scopes them.
- Do not use beige or yellow-green cards for replenishment status.

### 5.1 LPK Shortage Pick

Use accents to answer "what did this LPK pick?" and "what is still short?"

| State | Accent rule |
|---|---|
| Picked | Success badge. |
| Partial pick | Warning badge. |
| Stock shortage, not fully blocking | Warning badge or warning block. |
| Stock shortage that blocks dispatch | Danger badge or danger block. |
| Pending | Neutral badge. |

Rules:

- The shortage quantity must be visually visible.
- Put state badges in the picking detail table, not as large unrelated page banners.
- Keep LPK identity and barcode details neutral unless the state requires action.
- Danger is reserved for a blocker, not every shortage.

### 6 Warehouse Execution / SDO Print

Use accents to clarify print readiness, print agent health, fallback mode, and store scan warnings.

| State | Accent rule |
|---|---|
| SDO ready | Info badge or info block. |
| Print Agent connected | Success badge or sync-style status indicator. |
| Print Agent not connected, printing still possible by fallback | Warning badge or warning block. |
| Print Agent not connected, printing blocked | Danger block. |
| Browser fallback | Warning badge or warning block. |
| Printed | Success badge. |
| Print failed | Danger badge or danger block. |
| Store only scans SDO warning | Warning block that stays visible but compact. |

Rules:

- Print status must be audit-friendly and close to the affected SDO/package row.
- Do not hide print failure in toast-only feedback.
- Do not change print agent behavior in a visual accent PR unless explicitly scoped.
- SDO scan boundaries remain business rules, not styling choices.

### POS Cashier Terminal

Use accents to make payment, scan, total, and offline states obvious during fast cashier work.

| State | Accent rule |
|---|---|
| Grand total | Subtle info block when emphasis is needed. |
| Active Cash / M-Pesa / Mixed mode | Blue active state. |
| Paid / covered | Success badge or success block in the payment panel. |
| Collecting / pending | Warning badge or warning block. |
| Scan error | Danger block near scan input. |
| Offline / sync pending | Warning sync-status. |
| Empty basket | Neutral block or neutral helper state. |

Rules:

- The blue payment mode remains the active control color.
- Danger must be immediate for POS cannot-sell barcode states.
- POS sellable barcode rules must not change.
- Do not restore a broad ERP sidebar shell during active cashier work.

### PDA Clerk Putaway

Use accents to keep the current scan task, barcode recognition, wrong scan, and sync state visible on a mobile surface.

| State | Accent rule |
|---|---|
| Current scan task | Info block. |
| STORE_ITEM recognized | Success badge or success block. |
| Wrong barcode | Danger scan-warning near the scan control. |
| Pending sync | Warning sync-status. |
| Shelved | Success badge or success block. |
| Pending putaway | Neutral badge or subtle info badge. |
| Current item card | Subtle blue border or left accent only when it clarifies current focus. |

Rules:

- PDA uses larger touch density, but status content must remain concise.
- Do not rely on color only because scan work happens quickly and under variable lighting.
- Wrong barcode states must show text that explains what the operator scanned and what is expected.
- Do not change store receiving or POS barcode boundaries in a PDA visual PR.

## Forbidden Visual Regression

Future PRs must not reintroduce the old main visual style:

- no large beige cards;
- no brown or yellow ordinary borders;
- no yellow-green primary action;
- no warm gradients as default page surfaces;
- no high-saturation blocks;
- no full-page colored backgrounds;
- no color on every card;
- no color-only status without text;
- no large decorative illustration area in operator pages;
- no card-inside-card status composition.

Allowed exception:

- amber can be used for a real warning state, but it must stay low-saturation and must not become the default page theme.

## Future Implementation Guardrails

Future PRs implementing these rules must confirm:

- which pages are in scope;
- which status classes are added;
- which existing files changed;
- no external source code was copied;
- no new dependency was added;
- no business code was changed unless explicitly authorized by a separate issue;
- no barcode resolver, POS sale, store receiving, print agent, inventory, cost, PickingWave, sales, runtime data, or API contract behavior changed;
- `git diff --check` passed.

## Acceptance Criteria For Future Status Accent PRs

A future implementation PR can claim this design rule is followed only when:

1. The implementation uses info, success, warning, danger, and neutral consistently.
2. Status blocks and badges stay compact.
3. Every colored state has text.
4. The affected page still follows FW-ERP's compact ERP design system.
5. The change does not copy TailAdmin, Tabler, Preline, Shadcn Status, or other external template source.
6. The page does not return to yellow-green, beige, warm-card, or gradient main visuals.
7. Business behavior remains unchanged unless that PR is explicitly scoped beyond visual design.
