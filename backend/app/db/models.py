from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


PHASE_ONE_TABLE_NAMES = (
    "roles",
    "stores",
    "warehouses",
    "users",
    "transfer_orders",
    "sdo_packages",
    "delivery_batches",
    "delivery_batch_orders",
    "store_receipts",
    "store_receipt_packages",
    "clerk_assignments",
    "store_items",
    "store_item_print_batches",
    "store_item_print_batch_items",
    "sales",
    "sale_items",
    "sale_payments",
    "audit_events",
)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    role_code: Mapped[str] = mapped_column(Text, primary_key=True)
    role_label: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    permissions: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")


class Store(Base, TimestampMixin):
    __tablename__ = "stores"

    store_code: Mapped[str] = mapped_column(Text, primary_key=True)
    store_name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")


class Warehouse(Base, TimestampMixin):
    __tablename__ = "warehouses"

    warehouse_code: Mapped[str] = mapped_column(Text, primary_key=True)
    warehouse_name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    role_code: Mapped[str] = mapped_column(ForeignKey("roles.role_code"), nullable=False)
    store_code: Mapped[Optional[str]] = mapped_column(ForeignKey("stores.store_code"), nullable=True)
    warehouse_code: Mapped[Optional[str]] = mapped_column(ForeignKey("warehouses.warehouse_code"), nullable=True)
    area_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    managed_store_codes: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")


class TransferOrder(Base, TimestampMixin):
    __tablename__ = "transfer_orders"

    transfer_no: Mapped[str] = mapped_column(Text, primary_key=True)
    target_store_code: Mapped[str] = mapped_column(ForeignKey("stores.store_code"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="draft")
    sdo_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True, unique=True)
    total_package_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    total_item_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str] = mapped_column(Text, nullable=False)


class SdoPackage(Base, TimestampMixin):
    __tablename__ = "sdo_packages"
    __table_args__ = (
        UniqueConstraint("transfer_no", "package_index", name="uq_sdo_packages_transfer_package_index"),
        Index("ix_sdo_packages_sdo_code", "sdo_code"),
        Index("ix_sdo_packages_source", "source_type", "source_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transfer_no: Mapped[str] = mapped_column(ForeignKey("transfer_orders.transfer_no"), nullable=False)
    sdo_code: Mapped[str] = mapped_column(Text, nullable=False)
    package_index: Mapped[int] = mapped_column(Integer, nullable=False)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    source_code: Mapped[str] = mapped_column(Text, nullable=False)
    category_summary: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    item_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    print_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending_print")
    dispatch_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending_dispatch")
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")


class DeliveryBatch(Base, TimestampMixin):
    __tablename__ = "delivery_batches"

    batch_no: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="draft")
    route_code: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    driver_name: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    vehicle_no: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class DeliveryBatchOrder(Base, TimestampMixin):
    __tablename__ = "delivery_batch_orders"
    __table_args__ = (
        UniqueConstraint("batch_no", "transfer_no", name="uq_delivery_batch_orders_batch_transfer"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_no: Mapped[str] = mapped_column(ForeignKey("delivery_batches.batch_no"), nullable=False)
    transfer_no: Mapped[str] = mapped_column(ForeignKey("transfer_orders.transfer_no"), nullable=False)
    stop_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    target_store_code: Mapped[str] = mapped_column(ForeignKey("stores.store_code"), nullable=False)
    package_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    item_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending_dispatch")


class StoreReceipt(Base, TimestampMixin):
    __tablename__ = "store_receipts"

    receipt_no: Mapped[str] = mapped_column(Text, primary_key=True)
    transfer_no: Mapped[str] = mapped_column(ForeignKey("transfer_orders.transfer_no"), nullable=False)
    store_code: Mapped[str] = mapped_column(ForeignKey("stores.store_code"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    received_by: Mapped[str] = mapped_column(Text, nullable=False)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class StoreReceiptPackage(Base, TimestampMixin):
    __tablename__ = "store_receipt_packages"
    __table_args__ = (
        UniqueConstraint("receipt_no", "sdo_package_id", name="uq_store_receipt_packages_receipt_package"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    receipt_no: Mapped[str] = mapped_column(ForeignKey("store_receipts.receipt_no"), nullable=False)
    sdo_package_id: Mapped[int] = mapped_column(ForeignKey("sdo_packages.id"), nullable=False)
    package_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    accepted_qty: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    note: Mapped[str] = mapped_column(Text, nullable=False, server_default="")


class ClerkAssignment(Base, TimestampMixin):
    __tablename__ = "clerk_assignments"
    __table_args__ = (
        UniqueConstraint("sdo_package_id", "assigned_employee", name="uq_clerk_assignments_package_employee"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transfer_no: Mapped[str] = mapped_column(ForeignKey("transfer_orders.transfer_no"), nullable=False)
    sdo_package_id: Mapped[int] = mapped_column(ForeignKey("sdo_packages.id"), nullable=False)
    store_code: Mapped[str] = mapped_column(ForeignKey("stores.store_code"), nullable=False)
    assigned_employee: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_by: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="assigned")
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StoreItem(Base, TimestampMixin):
    __tablename__ = "store_items"
    __table_args__ = (
        Index("ix_store_items_source_chain", "source_sdo", "source_package"),
        Index("ix_store_items_store_sale_status", "store_code", "sale_status"),
        Index("ix_store_items_print_status", "print_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    machine_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    source_sdo: Mapped[str] = mapped_column(Text, nullable=False)
    source_package: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    sdo_package_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sdo_packages.id"), nullable=True)
    store_code: Mapped[str] = mapped_column(ForeignKey("stores.store_code"), nullable=False)
    assigned_employee: Mapped[str] = mapped_column(Text, nullable=False)
    category_summary: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    cost_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    selected_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    store_rack_code: Mapped[str] = mapped_column(Text, nullable=False)
    print_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending_print")
    sale_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="ready_for_sale")
    printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sold_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    raw_token: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")


class StoreItemPrintBatch(Base, TimestampMixin):
    __tablename__ = "store_item_print_batches"

    batch_no: Mapped[str] = mapped_column(Text, primary_key=True)
    store_code: Mapped[str] = mapped_column(ForeignKey("stores.store_code"), nullable=False)
    assigned_employee: Mapped[str] = mapped_column(Text, nullable=False)
    sdo_package_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sdo_packages.id"), nullable=True)
    requested_qty: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="preview")
    printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class StoreItemPrintBatchItem(Base, TimestampMixin):
    __tablename__ = "store_item_print_batch_items"
    __table_args__ = (
        UniqueConstraint("batch_no", "store_item_id", name="uq_store_item_print_batch_items_batch_item"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_no: Mapped[str] = mapped_column(ForeignKey("store_item_print_batches.batch_no"), nullable=False)
    store_item_id: Mapped[int] = mapped_column(ForeignKey("store_items.id"), nullable=False)
    print_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending_print")


class Sale(Base, TimestampMixin):
    __tablename__ = "sales"
    __table_args__ = (
        Index("ix_sales_store_sold_at", "store_code", "sold_at"),
    )

    sale_no: Mapped[str] = mapped_column(Text, primary_key=True)
    store_code: Mapped[str] = mapped_column(ForeignKey("stores.store_code"), nullable=False)
    cashier: Mapped[str] = mapped_column(Text, nullable=False)
    payment_method: Mapped[str] = mapped_column(Text, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    sold_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="completed")


class SaleItem(Base, TimestampMixin):
    __tablename__ = "sale_items"
    __table_args__ = (
        UniqueConstraint("sale_no", "store_item_id", name="uq_sale_items_sale_store_item"),
        Index("ix_sale_items_sale_no", "sale_no"),
        Index("ix_sale_items_source_type_sale_no", "source_type", "sale_no"),
        Index("ix_sale_items_source_chain", "source_sdo", "source_package"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_no: Mapped[str] = mapped_column(ForeignKey("sales.sale_no"), nullable=False)
    store_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("store_items.id"), nullable=True)
    store_item_display_code: Mapped[str] = mapped_column(Text, nullable=False)
    store_item_machine_code: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    unit_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    line_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    selected_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    source_sdo: Mapped[str] = mapped_column(Text, nullable=False)
    source_package: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_employee: Mapped[str] = mapped_column(Text, nullable=False)
    store_rack_code: Mapped[str] = mapped_column(Text, nullable=False)
    category_summary: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    legacy_category: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    legacy_subcategory: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    legacy_item_label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class SalePayment(Base, TimestampMixin):
    __tablename__ = "sale_payments"
    __table_args__ = (
        Index("ix_sale_payments_sale_no", "sale_no"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_no: Mapped[str] = mapped_column(ForeignKey("sales.sale_no"), nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="collected")
    manual_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    confirmed_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confirmed_at_local: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmation_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_entity", "entity_type", "entity_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[str] = mapped_column(Text, nullable=False)
    before_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    after_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    environment: Mapped[str] = mapped_column(Text, nullable=False, server_default="staging")
