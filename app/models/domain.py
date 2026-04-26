from enum import StrEnum


class StoreStatus(StrEnum):
    ACTIVE = "active"
    CLOSED = "closed"


class TransferStatus(StrEnum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    PICKING = "picking"
    DISPATCHED = "dispatched"
    RECEIVED = "received"
    DISCREPANCY_CONFIRMED = "discrepancy_confirmed"
    CANCELLED = "cancelled"


class PrintJobType(StrEnum):
    BARCODE_LABEL = "barcode_label"
    TRANSFER_ORDER = "transfer_order"
    GOODS_RECEIPT = "goods_receipt"


class DiscrepancyType(StrEnum):
    SHORT = "short"
    EXCESS = "excess"
    WRONG_ITEM = "wrong_item"
    DAMAGED = "damaged"


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class UserRole(StrEnum):
    WAREHOUSE_CLERK = "warehouse_clerk"
    WAREHOUSE_SUPERVISOR = "warehouse_supervisor"
    STORE_MANAGER = "store_manager"
    CASHIER = "cashier"
    AREA_SUPERVISOR = "area_supervisor"
    ADMIN = "admin"
