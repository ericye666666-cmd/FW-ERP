# FW-ERP Status Accent References

Research date: 2026-05-03

This reference pack is UI research only. It does not copy external template source code, add dependencies, vendor component files, or change FW-ERP business behavior. The output of this research should be FW-ERP-owned status accent rules, classes, and tokens.

## Scope

FW-ERP already has a compact Shadcn-style ERP direction:

- neutral gray application background;
- white operational surfaces;
- dark sidebar for desktop ERP work;
- blue primary actions;
- compact tables, forms, and operator controls.

The gap is semantic emphasis. Important operational states need light, compact, non-intrusive accents without returning to the old yellow-green, beige, warm-card visual system.

## Sources Reviewed

| Reference | Useful area | FW-ERP interpretation |
|---|---|---|
| TailAdmin React, https://github.com/TailAdmin/free-react-tailwind-admin-dashboard and https://tailadmin.com/docs/components/react | Alerts, badges, cards, notifications, tables | Useful as a status-density reference. Do not import React components, props, routes, package files, or examples. |
| TailAdmin HTML / Tailwind, https://github.com/TailAdmin/tailadmin-free-tailwind-dashboard-template | Soft badge colors, alert density, light state backgrounds | Useful for low-emphasis status surfaces in a Tailwind-admin context. Do not copy HTML, Alpine, Webpack, Tailwind config, or template structure. |
| Tabler, https://github.com/tabler/tabler and https://tabler.io/ | Compact badges, table labels, admin density | Useful for tight status labels in dense tables. Do not copy Bootstrap markup, CSS classes, page examples, or theme assets. |
| Preline, https://github.com/htmlstreamofficial/preline and https://www.preline.co/docs/card.html | Simple cards, alerts, card hierarchy | Useful for restrained card hierarchy and inline alert/card relationships. Do not add the Preline package or plugin dependency. |
| Shadcn Status, https://www.shadcn.io/components/status | Online, offline, maintenance, degraded indicators | Useful for dot plus label status language for print agent, sync, PDA, and service health states. Do not copy component source. |

## TailAdmin React Patterns Useful For FW-ERP

TailAdmin React is useful as a compact admin reference because its component set includes Alert, Badge, Card, Notification, Table, and related dashboard elements. For FW-ERP, the useful design ideas are:

- alerts should be short feedback surfaces, not page-sized explanation blocks;
- badges should carry small state labels, counts, or operational qualifiers;
- cards should frame repeated records, metrics, or bounded tools, not every page section;
- notification-style state should stay compact and action-oriented;
- tables can show status with small color labels rather than large colored panels;
- light badge variants are more appropriate for FW-ERP than solid, saturated labels in dense tables.

FW-ERP adaptation:

- use blue for main-flow or next-action states;
- use green only when an operation is complete, connected, paid, printed, recognized, or shelved;
- use amber only for waiting, partial, shortage, pending print, pending sync, or manual confirmation;
- use red only for a blocker, failed print, scan error, wrong barcode, or cannot-sell state;
- keep badges readable with text, not color alone.

Do not copy:

- React component files;
- TailAdmin props or source structure;
- example dashboards, fake analytics, auth flows, charts, or demo routes;
- package files, lockfiles, dependencies, icons, or build configuration.

## TailAdmin HTML / Tailwind Patterns Useful For FW-ERP

The HTML / Tailwind version is useful because it shows an admin template using soft status color families, alerts, badges, tables, and dashboard surfaces without requiring heavy visual styling.

Useful ideas:

- status backgrounds can be light while text and borders provide contrast;
- alert density should be close to toolbar or table density, not marketing-card density;
- badges can appear beside table cells, toolbar filters, and row metadata;
- warnings and errors should stand out through semantic color and clear wording, not oversized blocks;
- light state surfaces work best when the rest of the UI remains neutral.

FW-ERP adaptation:

- define FW-ERP-owned status tokens instead of importing Tailwind template class names;
- use status blocks only where the operator needs a current state or next action;
- keep tables white and neutral, with state accents inside the row or status column;
- avoid full-page colored backgrounds and warm default cards.

Do not copy:

- HTML templates;
- Alpine.js behavior;
- Tailwind config;
- Webpack setup;
- demo component markup;
- sample pages or assets.

## Tabler Badge Density Useful For FW-ERP

Tabler is useful as a dense admin reference. Its badges and table-oriented UI demonstrate how a status label can be small, readable, and close to the data it explains.

Useful ideas:

- badges should size to their text and stay compact;
- status labels belong inside tables, side panels, toolbars, and identity summaries;
- compact labels can support many states without turning the page colorful;
- a dense admin table should use status labels as scan aids, not decorative elements;
- status labels should not take over the layout.

FW-ERP adaptation:

- use badges for `Draft`, `Pending`, `Picked`, `Partial`, `Shortage`, `Printed`, `Failed`, `Paid`, `Sync pending`, and similar row-level states;
- show shortage quantity next to the badge when the quantity is operationally important;
- keep badges visually subordinate to IDs, quantities, and primary actions;
- do not use many color families. FW-ERP should map every state to info, success, warning, danger, or neutral.

Do not copy:

- Bootstrap classes;
- Tabler CSS variables;
- Tabler component markup;
- JavaScript plugins;
- template layouts or page examples.

## Preline Simple Card Patterns Useful For FW-ERP

Preline is useful for card hierarchy and simple alert/card combinations. FW-ERP can use the visual discipline without adding Preline itself.

Useful ideas:

- cards should have clear hierarchy: header, compact body, optional action;
- an alert inside a card can explain a local condition without creating a separate page banner;
- simple borders and white surfaces are enough for most operational panels;
- card spacing should remain tight when the card appears in repeated lists or workbenches;
- info blocks should sit near the control or table they explain.

FW-ERP adaptation:

- use status blocks inside an operational panel only when they explain the panel's state;
- avoid nesting cards inside cards;
- avoid decorative shadows and large blank space;
- keep state blocks close to their business object: LPK line, SDO print row, POS payment area, PDA current item.

Do not copy:

- Preline package usage;
- plugin initialization;
- Tailwind plugin configuration;
- card source snippets;
- layout templates or examples.

## Shadcn Status Indicators Useful For FW-ERP

The Shadcn Status reference is useful because it treats status as a compact indicator with a label and a dot. It maps well to service-like FW-ERP states.

Useful ideas:

- dot plus label is efficient for online/offline or health states;
- online/offline/maintenance/degraded maps to FW-ERP connected, disconnected, maintenance, and degraded/pending;
- a small indicator can live in the top bar, print panel, PDA header, POS sync area, or admin service row;
- animation is optional and should be disabled or subtle in dense operator screens.

FW-ERP adaptation:

- print agent connected: success;
- print agent not connected: warning or danger depending on whether printing is blocked;
- browser fallback: warning;
- POS/PDA offline: warning;
- sync pending: warning;
- scan ready or active main task: info;
- completed sync or recognized barcode: success.

Do not copy:

- Shadcn Status component source;
- registry commands;
- dependency instructions;
- animation implementation.

## What Must Not Be Copied

FW-ERP must not copy any external template source or implementation material:

- component source files;
- JSX, HTML, CSS, or JavaScript snippets;
- Tailwind, Bootstrap, or plugin class structures as implementation;
- package dependencies, lockfiles, build configs, or plugin setup;
- assets, icons, screenshots, demo data, auth flows, or routes;
- template-specific state names that do not match FW-ERP operations;
- large layout shells that would force business-flow changes.

Using a public template as visual reference is allowed. Importing or vendoring it into FW-ERP is not allowed by this issue.

## Why Extract Rules Instead Of Importing Templates

FW-ERP needs a narrow status accent layer, not a template migration. Extracting design rules is safer because:

- it preserves the current FW-ERP business code and API contracts;
- it avoids unrelated dependencies;
- it lets FW-ERP keep its own barcode, POS, print, inventory, PickingWave, and store receiving rules;
- it keeps review scope small and auditable;
- it allows future UI PRs to apply the accents page by page;
- it avoids replacing a business system with demo dashboards.

## Risks Of Copying External Template Source

| Risk | Why it matters |
|---|---|
| Business drift | Demo dashboards can introduce fake concepts that do not belong to warehouse, store, POS, PDA, or print workflows. |
| Dependency sprawl | Template imports can add React, Tailwind, Bootstrap, plugin, router, auth, or chart dependencies unrelated to the accent layer. |
| Review noise | Large copied files make it hard to prove that no barcode, sale, inventory, print, or cost behavior changed. |
| Style regression | Template palettes can reintroduce warm cards, high-saturation blocks, gradients, or over-colored pages. |
| Maintenance burden | Copied template components become FW-ERP-owned code without FW-ERP-specific rationale. |
| Licensing and attribution risk | Copying source creates legal and review concerns that are unnecessary for a docs-only design reference. |
| Density mismatch | Generic dashboard examples are often too spacious or decorative for warehouse and POS work. |

## FW-ERP Extraction Summary

Future implementation PRs should define FW-ERP-owned status accent classes and tokens. They should not add dependencies or source files from TailAdmin, Tabler, Preline, Shadcn Status, or any other external template.

Recommended extraction:

- five semantic accents: info, success, warning, danger, neutral;
- two primary surfaces: compact block and compact badge;
- page-specific usage rules for 4.1, 5.1, 6, POS, and PDA;
- explicit rejection of beige/yellow-green/warm-card regression;
- verification that each future PR changes only the intended UI files and leaves business behavior untouched.
