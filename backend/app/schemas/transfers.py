from typing import Any, List, Optional

from pydantic import BaseModel, Field


class TransferItemCreate(BaseModel):
    barcode: Optional[str] = Field(default=None, min_length=1)
    category_main: Optional[str] = Field(default=None, min_length=1)
    category_sub: Optional[str] = Field(default=None, min_length=1)
    requested_qty: int = Field(ge=1)


class TransferOrderCreate(BaseModel):
    from_warehouse_code: str = Field(min_length=1)
    to_store_code: str = Field(min_length=1)
    created_by: str = Field(min_length=1, default="warehouse_clerk_1")
    approval_required: bool = True
    items: List[TransferItemCreate]


class TransferDemandLineResponse(BaseModel):
    category_main: str
    category_sub: str
    requested_qty: int


class TransferOrderItemResponse(BaseModel):
    barcode: str
    product_name: str
    category_main: str = ""
    category_sub: str = ""
    requested_qty: int
    approved_qty: int
    received_qty: int
    discrepancy_qty: int


class TransferOrderResponse(BaseModel):
    transfer_no: str
    from_warehouse_code: str
    to_store_code: str
    created_by: str
    approval_required: bool
    status: str
    approval_status: str
    created_at: str
    submitted_at: Optional[str] = None
    approved_at: Optional[str] = None
    approved_by: Optional[str] = None
    received_at: Optional[str] = None
    received_by: Optional[str] = None
    closed_at: Optional[str] = None
    dispatch_bundle_created_at: Optional[str] = None
    dispatch_bundle_created_by: Optional[str] = None
    delivery_batch_no: str = ""
    shipment_session_no: str = ""
    store_receipt_status: str = ""
    dispatch_grouping_mode: str = ""
    dispatch_max_items_per_bale: int = 0
    dispatch_bale_nos: List[str] = Field(default_factory=list)
    dispatch_bale_count: int = 0
    accepted_dispatch_bale_count: int = 0
    completed_dispatch_bale_count: int = 0
    demand_lines: List[TransferDemandLineResponse] = Field(default_factory=list)
    items: List[TransferOrderItemResponse]


class TransferDiscrepancy(BaseModel):
    barcode: str = Field(min_length=1)
    issue_type: str = Field(min_length=1)
    expected_qty: int = Field(ge=0)
    actual_qty: int = Field(ge=0)
    note: str = ""


class TransferReceiveRequest(BaseModel):
    receiver_name: str = Field(min_length=1, default="store_manager_1")
    discrepancies: List[TransferDiscrepancy] = []


class TransferApprovalRequest(BaseModel):
    approved_by: str = Field(min_length=1, default="warehouse_supervisor_1")
    approved: bool = True
    note: str = ""


class TransferShipRequest(BaseModel):
    shipped_by: str = Field(min_length=1, default="warehouse_supervisor_1")
    driver_name: str = Field(min_length=1)
    vehicle_no: str = Field(min_length=1)
    note: str = ""


class DiscrepancyApprovalRequest(BaseModel):
    approved_by: str = Field(min_length=1, default="area_supervisor_1")
    approved: bool = True
    note: str = ""


class TransferRecommendationRequest(BaseModel):
    from_warehouse_code: str = Field(min_length=1)
    to_store_code: str = Field(min_length=1)
    preferred_categories: List[str] = Field(default_factory=list)
    max_suggestions: int = Field(default=50, ge=1, le=50)


class TransferRecommendationItemResponse(BaseModel):
    recommendation_key: str = ""
    category_main: str = ""
    category_sub: str = ""
    warehouse_available_qty: int = 0
    current_store_qty: int = 0
    pending_shelving_qty: int = 0
    in_transit_qty: int = 0
    effective_store_qty: int = 0
    recent_14d_sales_qty: int = 0
    avg_daily_sales_qty: float = 0
    requested_qty: int = 0
    suggested_qty: int = 0
    source_count: int = 0
    reason: str = ""
    score: int = 0
    barcode: str = ""
    product_name: str = ""


class TransferRecommendationResponse(BaseModel):
    recommendation_no: str
    from_warehouse_code: str
    to_store_code: str
    created_by: str
    created_at: str
    preferred_categories: List[str]
    analysis_summary: dict[str, Any]
    items: List[TransferRecommendationItemResponse]


class RecommendationTransferCreateRequest(BaseModel):
    approval_required: bool = True
    selected_demand_keys: List[str] = Field(default_factory=list)
    selected_barcodes: List[str] = Field(default_factory=list)
