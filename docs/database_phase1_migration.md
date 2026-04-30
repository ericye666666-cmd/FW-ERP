# Phase 1 Database Schema And Migration

This document describes the first PostgreSQL schema layer for staging Cloud SQL.
It does not switch business reads or writes away from the current runtime JSON
and frontend localStorage flow.

## Storage Modes

Local remains runtime-only by default:

```bash
RETAIL_OPS_STORAGE_MODE=runtime_json
RETAIL_OPS_ENVIRONMENT=local
```

Staging can use the database connection without changing local runtime tests:

```bash
RETAIL_OPS_STORAGE_MODE=dual_write
RETAIL_OPS_ENVIRONMENT=staging
DATABASE_URL="$DATABASE_URL_STAGING"
```

Future production should use a separate production database and secret:

```bash
RETAIL_OPS_STORAGE_MODE=db
RETAIL_OPS_ENVIRONMENT=production
DATABASE_URL="$DATABASE_URL_PRODUCTION"
```

## Tables In The First Migration

- `roles`
- `stores`
- `warehouses`
- `users`
- `transfer_orders`
- `sdo_packages`
- `delivery_batches`
- `delivery_batch_orders`
- `store_receipts`
- `store_receipt_packages`
- `clerk_assignments`
- `store_items`
- `store_item_print_batches`
- `store_item_print_batch_items`
- `sales`
- `sale_items`
- `sale_payments`
- `audit_events`

These tables cover the priority chain from SDO through store receipt, clerk
assignment, STORE_ITEM creation/printing, POS sale, and sales analytics source
traceability. Main sorting, cost, PickingWave, and complex inventory are out of
scope for this phase.

## Commands

Install dependencies:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

Check the migration head without connecting to a database:

```bash
.venv/bin/alembic heads
```

Generate SQL without applying it:

```bash
DATABASE_URL="$DATABASE_URL_STAGING" .venv/bin/alembic upgrade head --sql
```

Apply to staging Cloud SQL:

```bash
DATABASE_URL="$DATABASE_URL_STAGING" .venv/bin/alembic upgrade head
```

Rollback one migration on staging:

```bash
DATABASE_URL="$DATABASE_URL_STAGING" .venv/bin/alembic downgrade -1
```

Generate rollback SQL without applying it:

```bash
DATABASE_URL="$DATABASE_URL_STAGING" .venv/bin/alembic downgrade 20260430_0001:base --sql
```

Create a future migration after changing `backend/app/db/models.py`:

```bash
DATABASE_URL="$DATABASE_URL_STAGING" .venv/bin/alembic revision --autogenerate -m "describe change"
```

Do not commit real `.env` files, Cloud SQL passwords, connection strings,
runtime data, exports, dumps, or backups.

## DB Check

Use `app.db.session.check_database_connection()` from backend code or a Python
shell. With no `DATABASE_URL`, it returns `not_configured` and local
`runtime_json` mode can continue. With `DATABASE_URL`, it executes `SELECT 1`.
