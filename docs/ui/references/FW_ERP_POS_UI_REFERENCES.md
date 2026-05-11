# FW-ERP POS UI References

Research date: 2026-05-11

## Research scope

This is UI and design research only for the FW-ERP cashier terminal under Store workspace / 收银功能区 / 9. 收银销售.

No external source code was copied. No dependency was added. No business behavior was changed. This research does not change barcode resolver rules, POS sale rules, warehouse flows, store receiving, PDA, Android, Print Agent, inventory, cost, runtime data, or API behavior.

Reviewed public references:

- emsifa/tailwind-pos: https://github.com/emsifa/tailwind-pos and https://www.emsifa.com/tailwind-pos/
- Olgax POS: https://www.olgax.com/ and https://github.com/OLGAX-com/olgax-pos
- RetailPOS: https://retailpos.org/ and https://github.com/n17foo/retailpos
- SaleFlex / PyPOS: https://www.saleflex.dev/ and https://github.com/SaleFlex/SaleFlex.PyPOS

## References reviewed

### emsifa/tailwind-pos

What it is:

- An open-source point-of-sale web demo built with Tailwind CSS and Alpine.js.
- A compact cashier-style page with product browsing, cart, cash entry, change, submit, and receipt-oriented output.
- A useful visual reference for a touch-first sales screen without a heavy backend ERP shell.

What is useful for FW-ERP:

- Touch-first cashier layout.
- Simple POS screen structure.
- Basket / checkout visual rhythm.
- Large payment buttons.
- Clear sales flow.
- Cart and payment areas that stay visible while the cashier works.
- A direct path from product selection or scan to total, cash received, change, and submit.

What is not suitable for FW-ERP:

- It is Tailwind + Alpine, not our current prototype architecture.
- It is generic POS / food-style product catalog, not Direct Loop STORE_ITEM barcode flow.
- It does not know FW-ERP barcode guardrails.
- Its product catalog assumptions do not match FW-ERP's item lineage from SDO / SDP into STORE_ITEM.
- Its sample product and receipt model should not drive FW-ERP inventory or sale rules.

What must not be copied:

- Tailwind or Alpine source code.
- HTML, CSS, JavaScript, data files, sound files, or image assets.
- Tailwind class structure as implementation.
- Demo product data, receipt template, payment behavior, or route structure.
- Package, CDN, or build setup assumptions.

### Olgax POS

What it is:

- An open-source, offline-capable POS product for small businesses.
- A modern web POS stack using Next.js, TypeScript, Prisma, PGLite, Tailwind, and shadcn/ui.
- A useful reference for a fuller cashier and admin product boundary, including checkout, split tender, hold / recall, refunds, receipt printing, and role separation.

What is useful for FW-ERP:

- Modern POS feature set.
- Split tender payment.
- Offline-first thinking.
- Hold / recall.
- Receipt-ready interface.
- Admin/cashier separation.
- Shadcn-style modern density.
- Touch-optimized checkout language that treats the cashier screen as an operational terminal.
- A clear distinction between cashier speed and manager/admin configuration.

What is not suitable for FW-ERP:

- It is a different Next.js / Prisma / shadcn architecture.
- Direct migration would be a large architecture change.
- FW-ERP already has specific STORE_ITEM / SDO / SDP lineage rules.
- Its payment, inventory, customer, loyalty, and receipt models are not FW-ERP's source of truth.
- Its offline database strategy should not be adopted without a dedicated FW-ERP architecture decision.

What must not be copied:

- Next.js app code, Prisma schema, shadcn component source, Tailwind setup, or Zustand cart implementation.
- Routes, auth, customer, loyalty, receipt, refund, plugin, or demo data implementation.
- Package files, lockfiles, Docker files, config files, migrations, or seed data.
- Payment handling, offline sync implementation, or database model.

### RetailPOS

What it is:

- An open-source POS reference for physical retail stores that connects to e-commerce platforms.
- A broad feature-boundary reference for store checkout, customer attachment, returns, refunds, reporting, offline orders, and cashier roles.
- A useful reminder of what a retail POS may eventually need around store operations, even when FW-ERP keeps its own ERP as the source of truth.

What is useful for FW-ERP:

- Physical retail checkout boundaries.
- Customer attachment.
- Returns/refunds.
- Reporting.
- Offline orders.
- Cashier workflow.
- Payment method breakdown.
- Role-aware flow for Admin, Manager, and Cashier.
- Clear separation between checkout, inventory, customer, and reporting concerns.

What is not suitable for FW-ERP:

- It is built around e-commerce platform sync.
- FW-ERP source of truth is our own ERP flow, not Shopify/WooCommerce/etc.
- Direct adoption would conflict with our inventory/barcode model.
- Its product, customer, order, discount, gift-card, and platform sync assumptions do not match Direct Loop's warehouse-to-store lineage.
- Its payment terminal integrations should not drive FW-ERP payment architecture.

What must not be copied:

- Application source code or platform integration model.
- E-commerce sync assumptions, adapters, auth, data models, or payment integrations.
- UI source, routing, package files, lockfiles, tests, assets, or demo data.
- Customer, order, return, refund, or reporting schemas.

### SaleFlex / PyPOS

What it is:

- An open-source retail ecosystem with a Python + PySide6 touch POS called PyPOS.
- A modular model with local checkout, store back-office, and central API integration layers.
- A useful reference for touch-screen POS concepts, offline resilience, multi-store thinking, customer management, and central API boundaries.

What is useful for FW-ERP:

- Touch-screen POS.
- Offline resilience.
- Multi-store thinking.
- Customer management.
- Central API integration.
- Local transaction persistence concepts for weak-network environments.
- Role-aware cashier, manager, and admin access.
- Separation between terminal runtime, local store management, and central ERP/API sync.

What is not suitable for FW-ERP:

- Desktop/Python/PySide technology path differs from FW-ERP web POS.
- Its local SQLite, PySide form runtime, OFFICE, and GATE layers are a different architecture.
- Its broad retail ecosystem should not replace FW-ERP's existing web prototype and ERP ownership model.
- Its payment, loyalty, campaign, and sync behavior needs separate design before any FW-ERP implementation.

What must not be copied:

- Python, PySide, SQLAlchemy, Flask, Django, or REST adapter source code.
- Desktop UI form definitions, local database schema, offline queue implementation, or sync code.
- Payment, loyalty, campaign, customer, closure, or role implementation.
- Package files, configuration files, assets, tests, or example data.

## Extraction summary

- Use POS references for visual rhythm only.
- Keep FW-ERP's own barcode and sale rules.
- Keep POS full-screen.
- Keep scan-first layout.
- Put the scan input above the cart as the cart's main entry point.
- Keep cart and checkout always visible.
- Keep payment state clear.
- Keep error states close to scan input.
- Keep the POS main screen cashier-facing, not ERP traceability-facing.
- Do not show source chains on the POS main screen.
- Do not show recent scan history on the POS main screen.
- Do not import or vendor external code.
- Treat external references as evidence for cashier-facing density, large actions, and persistent totals, not as implementation templates.
- Preserve Store workspace / 收银功能区 / 9. 收银销售 as the POS entry.
- Preserve FW-ERP's STORE_ITEM-only POS scan boundary.

## What must not be copied

FW-ERP must not copy or vendor external implementation material from the reviewed POS references:

- source files;
- CSS/JS/HTML/TS/React components;
- images/assets;
- Tailwind config;
- package files;
- lockfiles;
- routes/auth/demo data;
- payment integrations;
- database schema;
- dependencies;
- migrations or seed files;
- offline sync implementation;
- customer, loyalty, refund, or reporting models;
- receipt templates or printer integrations.

Future POS UI work should translate these references into FW-ERP-owned layout, labels, status rules, and interaction decisions.
