from typing import Optional

from pydantic import BaseModel, Field


class BaleSalesCandidateResponse(BaseModel):
    entry_id: str
    source_type: str
    source_label: str = ""
    bale_barcode: str
    shipment_no: str = ""
    parcel_batch_no: str = ""
    source_bale_token: str = ""
    supplier_name: str = ""
    category_main: str = ""
    category_sub: str = ""
    weight_kg: float = 0
    package_count: int = 1
    entered_sales_pool_at: Optional[str] = None
    status: str = "available"
    raw_status: str = ""
    is_available: bool = True
    outbound_order_no: str = ""
    source_cost_kes: float = 0
    editable_cost_kes: float = 0
    downstream_cost_kes: float = 0
    total_cost_kes: float = 0
    margin_rate: float = 0
    target_sale_price_kes: float = 0
    pricing_note: str = ""
    pricing_updated_at: Optional[str] = None
    pricing_updated_by: str = ""


class BaleSalesCandidatePricingUpdateRequest(BaseModel):
    editable_cost_kes: Optional[float] = Field(default=None, ge=0)
    downstream_cost_kes: Optional[float] = Field(default=None, ge=0)
    margin_rate: Optional[float] = Field(default=None, ge=0)
    target_sale_price_kes: Optional[float] = Field(default=None, ge=0)
    note: str = ""


class BaleSalesOrderItemCreate(BaseModel):
    entry_id: str = Field(min_length=1)
    sale_price_kes: Optional[float] = Field(default=None, ge=0)


class BaleSalesOrderCreate(BaseModel):
    sold_by: str = Field(min_length=1)
    customer_name: str = Field(min_length=1)
    customer_contact: str = ""
    payment_method: str = Field(min_length=1)
    note: str = ""
    items: list[BaleSalesOrderItemCreate] = Field(default_factory=list, min_length=1)


class BaleSalesOrderItemResponse(BaseModel):
    entry_id: str
    bale_barcode: str
    shipment_no: str = ""
    supplier_name: str = ""
    category_main: str = ""
    category_sub: str = ""
    weight_kg: float = 0
    source_cost_kes: float = 0
    total_cost_kes: float = 0
    sale_price_kes: float = 0
    profit_kes: float = 0


class BaleSalesOrderResponse(BaseModel):
    order_no: str
    status: str
    sold_by: str
    customer_name: str
    customer_contact: str = ""
    payment_method: str
    note: str = ""
    created_by: str = ""
    created_at: str
    completed_at: str
    total_cost_kes: float = 0
    total_amount_kes: float = 0
    total_profit_kes: float = 0
    items: list[BaleSalesOrderItemResponse] = Field(default_factory=list)
