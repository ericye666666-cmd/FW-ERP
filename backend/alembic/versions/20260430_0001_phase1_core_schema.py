"""phase 1 core schema

Revision ID: 20260430_0001
Revises:
Create Date: 2026-04-30 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260430_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("role_code", sa.Text(), primary_key=True),
        sa.Column("role_label", sa.Text(), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        *timestamp_columns(),
    )
    op.create_table(
        "stores",
        sa.Column("store_code", sa.Text(), primary_key=True),
        sa.Column("store_name", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        *timestamp_columns(),
    )
    op.create_table(
        "warehouses",
        sa.Column("warehouse_code", sa.Text(), primary_key=True),
        sa.Column("warehouse_name", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        *timestamp_columns(),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("role_code", sa.Text(), sa.ForeignKey("roles.role_code"), nullable=False),
        sa.Column("store_code", sa.Text(), sa.ForeignKey("stores.store_code"), nullable=True),
        sa.Column("warehouse_code", sa.Text(), sa.ForeignKey("warehouses.warehouse_code"), nullable=True),
        sa.Column("area_code", sa.Text(), nullable=True),
        sa.Column("managed_store_codes", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_table(
        "transfer_orders",
        sa.Column("transfer_no", sa.Text(), primary_key=True),
        sa.Column("target_store_code", sa.Text(), sa.ForeignKey("stores.store_code"), nullable=False),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        sa.Column("sdo_code", sa.Text(), nullable=True),
        sa.Column("total_package_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_item_count", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("sdo_code", name="uq_transfer_orders_sdo_code"),
    )
    op.create_table(
        "sdo_packages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transfer_no", sa.Text(), sa.ForeignKey("transfer_orders.transfer_no"), nullable=False),
        sa.Column("sdo_code", sa.Text(), nullable=False),
        sa.Column("package_index", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("source_code", sa.Text(), nullable=False),
        sa.Column("category_summary", sa.Text(), server_default="", nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=True),
        sa.Column("print_status", sa.Text(), server_default="pending_print", nullable=False),
        sa.Column("dispatch_status", sa.Text(), server_default="pending_dispatch", nullable=False),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("transfer_no", "package_index", name="uq_sdo_packages_transfer_package_index"),
    )
    op.create_index("ix_sdo_packages_sdo_code", "sdo_packages", ["sdo_code"])
    op.create_index("ix_sdo_packages_source", "sdo_packages", ["source_type", "source_code"])
    op.create_table(
        "delivery_batches",
        sa.Column("batch_no", sa.Text(), primary_key=True),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        sa.Column("route_code", sa.Text(), server_default="", nullable=False),
        sa.Column("driver_name", sa.Text(), server_default="", nullable=False),
        sa.Column("vehicle_no", sa.Text(), server_default="", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
    )
    op.create_table(
        "delivery_batch_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_no", sa.Text(), sa.ForeignKey("delivery_batches.batch_no"), nullable=False),
        sa.Column("transfer_no", sa.Text(), sa.ForeignKey("transfer_orders.transfer_no"), nullable=False),
        sa.Column("stop_order", sa.Integer(), server_default="1", nullable=False),
        sa.Column("target_store_code", sa.Text(), sa.ForeignKey("stores.store_code"), nullable=False),
        sa.Column("package_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.Text(), server_default="pending_dispatch", nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("batch_no", "transfer_no", name="uq_delivery_batch_orders_batch_transfer"),
    )
    op.create_table(
        "store_receipts",
        sa.Column("receipt_no", sa.Text(), primary_key=True),
        sa.Column("transfer_no", sa.Text(), sa.ForeignKey("transfer_orders.transfer_no"), nullable=False),
        sa.Column("store_code", sa.Text(), sa.ForeignKey("stores.store_code"), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("received_by", sa.Text(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
    )
    op.create_table(
        "store_receipt_packages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("receipt_no", sa.Text(), sa.ForeignKey("store_receipts.receipt_no"), nullable=False),
        sa.Column("sdo_package_id", sa.Integer(), sa.ForeignKey("sdo_packages.id"), nullable=False),
        sa.Column("package_status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("accepted_qty", sa.Integer(), server_default="0", nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("receipt_no", "sdo_package_id", name="uq_store_receipt_packages_receipt_package"),
    )
    op.create_table(
        "clerk_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transfer_no", sa.Text(), sa.ForeignKey("transfer_orders.transfer_no"), nullable=False),
        sa.Column("sdo_package_id", sa.Integer(), sa.ForeignKey("sdo_packages.id"), nullable=False),
        sa.Column("store_code", sa.Text(), sa.ForeignKey("stores.store_code"), nullable=False),
        sa.Column("assigned_employee", sa.Text(), nullable=False),
        sa.Column("assigned_by", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="assigned", nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("sdo_package_id", "assigned_employee", name="uq_clerk_assignments_package_employee"),
    )
    op.create_table(
        "store_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("display_code", sa.Text(), nullable=False),
        sa.Column("machine_code", sa.Text(), nullable=False),
        sa.Column("source_sdo", sa.Text(), nullable=False),
        sa.Column("source_package", sa.Text(), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("sdo_package_id", sa.Integer(), sa.ForeignKey("sdo_packages.id"), nullable=True),
        sa.Column("store_code", sa.Text(), sa.ForeignKey("stores.store_code"), nullable=False),
        sa.Column("assigned_employee", sa.Text(), nullable=False),
        sa.Column("category_summary", sa.Text(), server_default="", nullable=False),
        sa.Column("cost_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("selected_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("store_rack_code", sa.Text(), nullable=False),
        sa.Column("print_status", sa.Text(), server_default="pending_print", nullable=False),
        sa.Column("sale_status", sa.Text(), server_default="ready_for_sale", nullable=False),
        sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sold_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_token", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("display_code", name="uq_store_items_display_code"),
        sa.UniqueConstraint("machine_code", name="uq_store_items_machine_code"),
    )
    op.create_index("ix_store_items_source_chain", "store_items", ["source_sdo", "source_package"])
    op.create_index("ix_store_items_store_sale_status", "store_items", ["store_code", "sale_status"])
    op.create_index("ix_store_items_print_status", "store_items", ["print_status"])
    op.create_table(
        "store_item_print_batches",
        sa.Column("batch_no", sa.Text(), primary_key=True),
        sa.Column("store_code", sa.Text(), sa.ForeignKey("stores.store_code"), nullable=False),
        sa.Column("assigned_employee", sa.Text(), nullable=False),
        sa.Column("sdo_package_id", sa.Integer(), sa.ForeignKey("sdo_packages.id"), nullable=True),
        sa.Column("requested_qty", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.Text(), server_default="preview", nullable=False),
        sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
    )
    op.create_table(
        "store_item_print_batch_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_no", sa.Text(), sa.ForeignKey("store_item_print_batches.batch_no"), nullable=False),
        sa.Column("store_item_id", sa.Integer(), sa.ForeignKey("store_items.id"), nullable=False),
        sa.Column("print_status", sa.Text(), server_default="pending_print", nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("batch_no", "store_item_id", name="uq_store_item_print_batch_items_batch_item"),
    )
    op.create_table(
        "sales",
        sa.Column("sale_no", sa.Text(), primary_key=True),
        sa.Column("store_code", sa.Text(), sa.ForeignKey("stores.store_code"), nullable=False),
        sa.Column("cashier", sa.Text(), nullable=False),
        sa.Column("payment_method", sa.Text(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("item_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sold_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("status", sa.Text(), server_default="completed", nullable=False),
        *timestamp_columns(),
    )
    op.create_index("ix_sales_store_sold_at", "sales", ["store_code", "sold_at"])
    op.create_table(
        "sale_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sale_no", sa.Text(), sa.ForeignKey("sales.sale_no"), nullable=False),
        sa.Column("store_item_id", sa.Integer(), sa.ForeignKey("store_items.id"), nullable=False),
        sa.Column("store_item_display_code", sa.Text(), nullable=False),
        sa.Column("store_item_machine_code", sa.Text(), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("source_sdo", sa.Text(), nullable=False),
        sa.Column("source_package", sa.Text(), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("assigned_employee", sa.Text(), nullable=False),
        sa.Column("store_rack_code", sa.Text(), nullable=False),
        sa.Column("category_summary", sa.Text(), server_default="", nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("sale_no", "store_item_id", name="uq_sale_items_sale_store_item"),
    )
    op.create_index("ix_sale_items_source_chain", "sale_items", ["source_sdo", "source_package"])
    op.create_table(
        "sale_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sale_no", sa.Text(), sa.ForeignKey("sales.sale_no"), nullable=False),
        sa.Column("method", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reference", sa.Text(), nullable=True),
        *timestamp_columns(),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("before_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("environment", sa.Text(), server_default="staging", nullable=False),
    )
    op.create_index("ix_audit_events_entity", "audit_events", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_entity", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_table("sale_payments")
    op.drop_index("ix_sale_items_source_chain", table_name="sale_items")
    op.drop_table("sale_items")
    op.drop_index("ix_sales_store_sold_at", table_name="sales")
    op.drop_table("sales")
    op.drop_table("store_item_print_batch_items")
    op.drop_table("store_item_print_batches")
    op.drop_index("ix_store_items_print_status", table_name="store_items")
    op.drop_index("ix_store_items_store_sale_status", table_name="store_items")
    op.drop_index("ix_store_items_source_chain", table_name="store_items")
    op.drop_table("store_items")
    op.drop_table("clerk_assignments")
    op.drop_table("store_receipt_packages")
    op.drop_table("store_receipts")
    op.drop_table("delivery_batch_orders")
    op.drop_table("delivery_batches")
    op.drop_index("ix_sdo_packages_source", table_name="sdo_packages")
    op.drop_index("ix_sdo_packages_sdo_code", table_name="sdo_packages")
    op.drop_table("sdo_packages")
    op.drop_table("transfer_orders")
    op.drop_table("users")
    op.drop_table("warehouses")
    op.drop_table("stores")
    op.drop_table("roles")
