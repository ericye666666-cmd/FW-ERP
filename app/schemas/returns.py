from typing import List, Optional

from pydantic import BaseModel, Field


class ReturnOrderItemCreate(BaseModel):
    barcode: str = Field(min_length=1)
    requested_qty: int = Field(ge=1)
    note: str = ""


class ReturnOrderCreate(BaseModel):
    from_store_code: str = Field(min_length=1)
    to_warehouse_code: str = Field(min_length=1)
    reason: str = Field(min_length=1, default="cycle_end_return")
    created_by: str = Field(min_length=1, default="store_manager_1")
    items: List[ReturnOrderItemCreate]


class ReturnCandidateResponse(BaseModel):
    identity_id: str = ""
    barcode: str
    product_name: str
    category_main: str
    category_sub: str
    qty_on_hand: int
    store_rack_code: str = ""


class ReturnSelectionCreate(BaseModel):
    from_store_code: str = Field(min_length=1)
    to_warehouse_code: str = Field(min_length=1)
    reason: str = Field(min_length=1, default="cycle_end_return")
    select_all: bool = True
    selected_barcodes: List[str] = Field(default_factory=list)
    excluded_barcodes: List[str] = Field(default_factory=list)
    note: str = ""


class ReturnOrderDispatchRequest(BaseModel):
    dispatched_by: str = Field(min_length=1, default="store_manager_1")
    note: str = ""


class ReturnOrderReceiveRequest(BaseModel):
    received_by: str = Field(min_length=1, default="warehouse_clerk_1")
    ret_rack_code: str = Field(min_length=1, default="WH-RET-01-01-01")
    note: str = ""


class ReturnOrderItemResponse(BaseModel):
    identity_id: str = ""
    barcode: str
    product_name: str
    requested_qty: int
    returned_qty: int
    note: str = ""


class ReturnOrderResponse(BaseModel):
    return_no: str
    from_store_code: str
    to_warehouse_code: str
    reason: str
    status: str
    created_by: str
    created_at: str
    dispatched_at: Optional[str] = None
    dispatched_by: Optional[str] = None
    received_at: Optional[str] = None
    received_by: Optional[str] = None
    ret_rack_code: str = ""
    items: List[ReturnOrderItemResponse]
