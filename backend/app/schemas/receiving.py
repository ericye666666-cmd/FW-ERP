from typing import Any, List, Optional

from pydantic import BaseModel, Field


class StoreTokenReceivingSessionStartRequest(BaseModel):
    store_code: str = Field(min_length=1)
    bale_no: str = ""
    task_no: str = ""
    shipment_no: str = ""
    note: str = ""


class StoreTokenReceivingBatchAddRequest(BaseModel):
    token_no: str = Field(min_length=1)
    rack_code: str = Field(min_length=1)
    note: str = ""


class StoreTokenReceivingBatchResponse(BaseModel):
    batch_id: int
    token_no: str
    category_name: str
    grade: str
    rack_code: str
    previous_rack_code: str = ""
    suggested_rack_codes: List[str] = Field(default_factory=list)
    created_by: str
    created_at: str
    note: str = ""


class StoreTokenReceivingSessionItemSummary(BaseModel):
    token_no: str
    category_name: str
    grade: str
    status: str
    previous_rack_code: str = ""
    suggested_rack_codes: List[str] = Field(default_factory=list)
    latest_rack_code: str = ""
    placed_flag: bool = False


class ClerkShelvingTaskResponse(BaseModel):
    entity_type: str = "clerk_shelving_task"
    session_no: str
    bale_no: str = ""
    store_code: str = ""
    assigned_employee: str = ""
    status: str = ""
    token_count: int = 0
    placed_count: int = 0
    pending_count: int = 0


class StoreTokenPlacementSuggestionResponse(BaseModel):
    token_no: str
    store_code: str
    category_name: str
    grade: str
    previous_rack_code: str = ""
    suggested_rack_codes: List[str] = Field(default_factory=list)


class StoreTokenReceivingSessionResponse(BaseModel):
    session_no: str
    bale_no: str = ""
    task_no: str = ""
    shipment_no: str = ""
    store_code: str
    assigned_employee: str = ""
    status: str
    task_type: str = ""
    created_by: str
    created_at: str
    finalized_at: Optional[str] = None
    finalized_by: Optional[str] = None
    note: str = ""
    token_summaries: List[StoreTokenReceivingSessionItemSummary] = Field(default_factory=list)
    batches: List[StoreTokenReceivingBatchResponse] = Field(default_factory=list)
    analysis_summary: dict[str, Any] = Field(default_factory=dict)
    clerk_shelving_task: Optional[ClerkShelvingTaskResponse] = None


class ReceivingSessionStartRequest(BaseModel):
    note: str = ""


class ReceivingBatchAddRequest(BaseModel):
    barcode: str = Field(min_length=1)
    received_qty: int = Field(ge=1)
    rack_code: str = Field(min_length=1)
    note: str = ""


class ReceivingBatchResponse(BaseModel):
    batch_id: int
    barcode: str
    product_name: str
    category_main: str
    category_sub: str
    received_qty: int
    rack_code: str
    previous_rack_code: str = ""
    suggested_rack_codes: List[str] = Field(default_factory=list)
    created_by: str
    created_at: str
    note: str = ""


class ReceivingSessionItemSummary(BaseModel):
    barcode: str
    product_name: str
    category_main: str
    category_sub: str
    approved_qty: int
    received_qty: int
    discrepancy_qty: int
    previous_rack_code: str = ""
    suggested_rack_codes: List[str] = Field(default_factory=list)
    latest_rack_code: str = ""


class ReceivingSessionResponse(BaseModel):
    session_no: str
    transfer_no: str
    store_code: str
    warehouse_code: str
    status: str
    created_by: str
    created_at: str
    finalized_at: Optional[str] = None
    finalized_by: Optional[str] = None
    note: str = ""
    item_summaries: List[ReceivingSessionItemSummary] = Field(default_factory=list)
    batches: List[ReceivingBatchResponse] = Field(default_factory=list)
    analysis_summary: dict[str, Any] = Field(default_factory=dict)


class PlacementSuggestionResponse(BaseModel):
    barcode: str
    product_name: str
    store_code: str
    category_main: str
    category_sub: str
    previous_rack_code: str = ""
    suggested_rack_codes: List[str] = Field(default_factory=list)


class ReceivingSessionFinalizeRequest(BaseModel):
    note: str = ""
