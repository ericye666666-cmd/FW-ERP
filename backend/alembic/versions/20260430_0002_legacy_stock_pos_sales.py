"""legacy stock POS sales support

Revision ID: 20260430_0002
Revises: 20260430_0001
Create Date: 2026-04-30 00:02:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260430_0002"
down_revision: Union[str, None] = "20260430_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "sale_items",
        "store_item_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.add_column("sale_items", sa.Column("quantity", sa.Integer(), server_default="1", nullable=False))
    op.add_column("sale_items", sa.Column("unit_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("sale_items", sa.Column("line_total", sa.Numeric(12, 2), nullable=True))
    op.add_column("sale_items", sa.Column("selected_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("sale_items", sa.Column("legacy_category", sa.Text(), nullable=True))
    op.add_column("sale_items", sa.Column("legacy_subcategory", sa.Text(), nullable=True))
    op.add_column("sale_items", sa.Column("legacy_item_label", sa.Text(), nullable=True))
    op.add_column("sale_payments", sa.Column("customer_phone", sa.Text(), nullable=True))
    op.add_column(
        "sale_payments",
        sa.Column("payment_status", sa.Text(), server_default="collected", nullable=False),
    )
    op.add_column(
        "sale_payments",
        sa.Column("manual_confirmed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("sale_payments", sa.Column("confirmed_by", sa.Text(), nullable=True))
    op.add_column("sale_payments", sa.Column("confirmed_at_local", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sale_payments", sa.Column("confirmation_note", sa.Text(), nullable=True))
    op.create_index("ix_sale_items_sale_no", "sale_items", ["sale_no"])
    op.create_index("ix_sale_items_source_type_sale_no", "sale_items", ["source_type", "sale_no"])
    op.create_index("ix_sale_payments_sale_no", "sale_payments", ["sale_no"])


def downgrade() -> None:
    op.drop_index("ix_sale_payments_sale_no", table_name="sale_payments")
    op.drop_index("ix_sale_items_source_type_sale_no", table_name="sale_items")
    op.drop_index("ix_sale_items_sale_no", table_name="sale_items")
    op.drop_column("sale_payments", "confirmation_note")
    op.drop_column("sale_payments", "confirmed_at_local")
    op.drop_column("sale_payments", "confirmed_by")
    op.drop_column("sale_payments", "manual_confirmed")
    op.drop_column("sale_payments", "payment_status")
    op.drop_column("sale_payments", "customer_phone")
    op.drop_column("sale_items", "legacy_item_label")
    op.drop_column("sale_items", "legacy_subcategory")
    op.drop_column("sale_items", "legacy_category")
    op.drop_column("sale_items", "selected_price")
    op.drop_column("sale_items", "line_total")
    op.drop_column("sale_items", "unit_price")
    op.drop_column("sale_items", "quantity")
    op.alter_column(
        "sale_items",
        "store_item_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
