from typing import Any, Optional

from pydantic import BaseModel, Field


class ItemIdentitySourceBaleResponse(BaseModel):
    bale_barcode: str
    legacy_bale_barcode: str = ""
    source_bale_token: str = ""
    parcel_batch_no: str = ""
    supplier_name: str = ""
    category_main: str = ""
    category_sub: str = ""
    status: str = ""


class ItemIdentityLocationRowResponse(BaseModel):
    location_type: str
    location_code: str
    rack_code: str = ""
    qty_on_hand: int = 0
    updated_at: str = ""


class ItemIdentityLocationResponse(BaseModel):
    current_stage: str
    warehouse_locations: list[ItemIdentityLocationRowResponse] = Field(default_factory=list)
    store_locations: list[ItemIdentityLocationRowResponse] = Field(default_factory=list)
    latest_location_code: str = ""
    latest_rack_code: str = ""


class ItemIdentitySaleHistoryResponse(BaseModel):
    identity_id: str = ""
    order_no: str
    store_code: str
    sold_at: str
    cashier_name: str = ""
    qty: int = 0
    selling_price: float = 0
    line_total: float = 0
    line_profit: float = 0
    sale_status: str = ""
    payment_status: str = ""
    returned_qty: int = 0
    refund_amount_total: float = 0


class ItemIdentityRefundHistoryResponse(BaseModel):
    identity_id: str = ""
    refund_no: str
    order_no: str
    status: str = ""
    store_code: str = ""
    refund_method: str = ""
    requested_qty: int = 0
    refund_amount: float = 0
    reason: str = ""
    requested_at: str
    reviewed_at: Optional[str] = None


class ItemIdentityReturnHistoryResponse(BaseModel):
    identity_id: str = ""
    return_no: str
    status: str
    from_store_code: str
    to_warehouse_code: str
    reason: str = ""
    requested_qty: int = 0
    returned_qty: int = 0
    created_at: str
    dispatched_at: Optional[str] = None
    received_at: Optional[str] = None


class ItemIdentityPriceHistoryResponse(BaseModel):
    occurred_at: str
    actor: str = ""
    source_type: str = ""
    reference_no: str = ""
    previous_price_kes: Optional[float] = None
    current_price_kes: Optional[float] = None
    note: str = ""


class ItemIdentityRackHistoryResponse(BaseModel):
    occurred_at: str
    actor: str = ""
    source_type: str = ""
    reference_no: str = ""
    previous_rack_code: str = ""
    current_rack_code: str = ""
    note: str = ""


class ItemIdentityTimelineEventResponse(BaseModel):
    source_type: str
    occurred_at: str
    title: str
    actor: str = ""
    reference_no: str = ""
    status: str = ""
    details: dict[str, Any] = Field(default_factory=dict)


class ItemIdentityLedgerResponse(BaseModel):
    identity_no: str
    token_no: str = ""
    barcode: str = ""
    product_code: str = ""
    product_name: str = ""
    category_name: str = ""
    category_main: str = ""
    category_sub: str = ""
    grade: str = ""
    sku_code: str = ""
    cost_status: str = ""
    unit_cost_kes: Optional[float] = None
    cost_model_code: str = ""
    cost_locked_at: Optional[str] = None
    source_pool_tokens: list[str] = Field(default_factory=list)
    suggested_price_kes: Optional[float] = None
    selling_price_kes: Optional[float] = None
    suggested_rack_code: str = ""
    store_rack_code: str = ""
    shipment_no: str = ""
    customs_notice_no: str = ""
    task_no: str = ""
    source_bale_barcodes: list[str] = Field(default_factory=list)
    source_legacy_bale_barcodes: list[str] = Field(default_factory=list)
    supplier_names: list[str] = Field(default_factory=list)
    store_dispatch_bale_no: str = ""
    store_dispatch_bale_status: str = ""
    assigned_employee: str = ""
    store_code: str = ""
    printed_at: Optional[str] = None
    edited_at: Optional[str] = None
    shelved_at: Optional[str] = None
    location: ItemIdentityLocationResponse
    source_bales: list[ItemIdentitySourceBaleResponse] = Field(default_factory=list)
    price_history: list[ItemIdentityPriceHistoryResponse] = Field(default_factory=list)
    rack_history: list[ItemIdentityRackHistoryResponse] = Field(default_factory=list)
    sales_history: list[ItemIdentitySaleHistoryResponse] = Field(default_factory=list)
    refund_history: list[ItemIdentityRefundHistoryResponse] = Field(default_factory=list)
    return_history: list[ItemIdentityReturnHistoryResponse] = Field(default_factory=list)
    timeline: list[ItemIdentityTimelineEventResponse] = Field(default_factory=list)
