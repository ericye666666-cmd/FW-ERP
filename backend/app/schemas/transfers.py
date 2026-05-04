from typing import Any, List, Optional

from pydantic import BaseModel, Field


class TransferItemCreate(BaseModel):
    barcode: Optional[str] = Field(default=None, min_length=1)
    category_main: Optional[str] = Field(default=None, min_length=1)
    category_sub: Optional[str] = Field(default=None, min_length=1)
    grade: Optional[str] = Field(default=None, min_length=1)
    requested_qty: int = Field(ge=1)


class TransferOrderCreate(BaseModel):
    from_warehouse_code: str = Field(min_length=1)
    to_store_code: str = Field(min_length=1)
    required_arrival_date: Optional[str] = Field(default=None, min_length=1)
    created_by: str = Field(min_length=1, default="warehouse_clerk_1")
    approval_required: bool = True
    items: List[TransferItemCreate]


class TransferDemandLineResponse(BaseModel):
    category_main: str
    category_sub: str
    grade: str = ""
    requested_qty: int


class TransferOrderItemResponse(BaseModel):
    barcode: str
    product_name: str
    category_main: str = ""
    category_sub: str = ""
    grade: str = ""
    requested_qty: int
    approved_qty: int
    received_qty: int
    discrepancy_qty: int


class TransferOrderResponse(BaseModel):
    transfer_no: str
    from_warehouse_code: str
    to_store_code: str
    required_arrival_date: str = ""
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
    store_delivery_execution_order_no: str = ""
    official_delivery_barcode: str = ""
    store_delivery_execution_status: str = ""
    store_delivery_execution_created_at: Optional[str] = None
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


class StoreDeliveryExecutionOrderCreateRequest(BaseModel):
    created_by: str = Field(min_length=1, default="warehouse_clerk_1")
    mark_as_printed: bool = False
    notes: str = ""
    packages: List[dict[str, Any]] = Field(default_factory=list)


class StoreDeliveryExecutionPackageDetailResponse(BaseModel):
    id: int = 0
    package_id: str = ""
    display_code: str = ""
    machine_code: str = ""
    barcode_value: str = ""
    human_readable: str = ""
    entity_type: str = ""
    parent_entity_type: str = ""
    parent_sdo_display_code: str = ""
    parent_sdo_machine_code: str = ""
    parent_sdo_order_no: str = ""
    execution_order_no: str = ""
    transfer_no: str = ""
    store_code: str = ""
    package_no: int = 0
    package_total: int = 0
    source_type: str = ""
    source_code: str = ""
    source_machine_code: str = ""
    item_count: Optional[int] = None
    content_summary: str = ""
    category_summary: str = ""
    category_name: str = ""
    source_token_refs: List[str] = Field(default_factory=list)
    cost_source_refs: List[str] = Field(default_factory=list)
    status: str = "created"
    assigned_clerk: str = ""
    received_at: Optional[str] = None
    received_by: str = ""
    printed_at: Optional[str] = None
    printed_by: str = ""
    created_at: str = ""
    updated_at: str = ""
    print_payload: dict[str, Any] = Field(default_factory=dict)


class StoreDeliveryExecutionOrderResponse(BaseModel):
    execution_order_no: str
    official_delivery_barcode: str
    source_transfer_no: str = ""
    replenishment_request_no: str = ""
    from_warehouse_code: str = ""
    to_store_code: str = ""
    source_store_prep_bale_codes: List[str] = Field(default_factory=list)
    source_gap_fill_task_codes: List[str] = Field(default_factory=list)
    package_count: int = 0
    total_item_count: Optional[int] = None
    packages: List[StoreDeliveryExecutionPackageDetailResponse] = Field(default_factory=list)
    status: str = "pending_print"
    created_by: str = ""
    created_at: str
    printed_at: Optional[str] = None
    received_at: Optional[str] = None
    notes: str = ""


class PickingWaveCreate(BaseModel):
    wave_name: str = Field(min_length=1)
    warehouse_code: str = Field(min_length=1)
    planned_picking_date: str = Field(min_length=1)
    required_arrival_date: Optional[str] = Field(default=None, min_length=1)
    selected_replenishment_request_nos: List[str] = Field(default_factory=list)
    notes: str = ""


class PickingWaveResponse(BaseModel):
    wave_no: str
    wave_name: str
    warehouse_code: str
    planned_picking_date: str
    required_arrival_date: str = ""
    selected_replenishment_request_nos: List[str] = Field(default_factory=list)
    stores_included: List[str] = Field(default_factory=list)
    total_requested_qty: int = 0
    total_shortage_qty: int = 0
    sdb_count: int = 0
    lpk_count: int = 0
    status: str = "draft"
    created_by: str = ""
    created_at: str
    notes: str = ""
